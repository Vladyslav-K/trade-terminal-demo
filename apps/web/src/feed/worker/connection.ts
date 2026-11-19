import {
  DEAD_AFTER_MS,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  STALE_AFTER_MS,
} from '@trade-terminal/protocol';
import type { ClientMessage, PongMessage } from '@trade-terminal/protocol';

import type { ConnectionState, LogLevel } from '../../stores/app-store.ts';

const LIVENESS_CHECK_MS = 250;
const CLOCK_SAMPLES = 10;
const PING_SLOTS = 8;
const PING_ID_LIMIT = 2 ** 31;

// retryInMs is set while a reconnect timer is pending; lastMessageAt is the
// Date.now() of the last message from any socket.
export interface ConnectionStatus {
  state: ConnectionState;
  attempt: number;
  retryInMs: number | null;
  lastMessageAt: number | null;
}

// offset is server clock minus client clock, taken from the sample with the
// lowest round trip among the last CLOCK_SAMPLES pongs of the current socket.
export interface ClockEstimate {
  isReady: boolean;
  offset: number;
  rtt: number;
}

export type HelloResult = 'connected' | 'reconnected' | 'mismatch';

export interface ConnectionEvents {
  onStatus(status: ConnectionStatus): void;
  onLog(level: LogLevel, text: string): void;
  onBeforeConnect(): void;
  onMessage(data: unknown, now: number): void;
}

export interface Connection {
  readonly clock: Readonly<ClockEstimate>;
  start(url: string): void;
  send(message: ClientMessage): void;
  // On 'mismatch' the socket is closed for good.
  acceptHello(version: unknown): HelloResult;
  handlePong(message: PongMessage, now: number): void;
}

export function createConnection(events: ConnectionEvents): Connection {
  const clock: ClockEstimate = { isReady: false, offset: 0, rtt: 0 };
  const sampleRtts = new Float64Array(CLOCK_SAMPLES);
  const sampleOffsets = new Float64Array(CLOCK_SAMPLES);
  const pingIds = new Float64Array(PING_SLOTS);
  const pingSentAt = new Float64Array(PING_SLOTS);

  let url = '';
  let socket: WebSocket | null = null;
  let state: ConnectionState = 'connecting';
  let attempt = 0;
  let hasConnected = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let livenessTimer: ReturnType<typeof setInterval> | null = null;
  let lastMessageAt: number | null = null;
  let silenceStartedAt = 0;
  let lastPingAt = 0;
  let nextPingId = 0;
  let sampleCount = 0;

  const setState = (next: ConnectionState, retryInMs: number | null): void => {
    state = next;
    events.onStatus({ state, attempt, retryInMs, lastMessageAt });
  };

  const resetClock = (): void => {
    clock.isReady = false;
    sampleCount = 0;
    pingIds.fill(-1);
  };

  const sendPing = (now: number): void => {
    if (socket === null) {
      return;
    }
    const id = nextPingId;
    nextPingId = (nextPingId + 1) % PING_ID_LIMIT;
    pingIds[id % PING_SLOTS] = id;
    pingSentAt[id % PING_SLOTS] = now;
    lastPingAt = now;
    socket.send(JSON.stringify({ t: 'ping', id }));
  };

  const dropSocket = (): void => {
    if (socket === null) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close();
    }
    socket = null;
  };

  const clearRetry = (): void => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  // Returns the delay in ms, or null when the browser is offline and
  // attempts wait for the online event.
  const scheduleReconnect = (): number | null => {
    clearRetry();
    if (!navigator.onLine) {
      setState('offline', null);
      return null;
    }
    attempt += 1;
    const backoff = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** (attempt - 1),
    );
    const delay = Math.round(backoff * (0.5 + Math.random() * 0.5));
    retryTimer = setTimeout(handleRetry, delay);
    setState('reconnecting', delay);
    return delay;
  };

  const handleOpen = (): void => {
    sendPing(Date.now());
  };

  const handleSocketMessage = (event: MessageEvent<unknown>): void => {
    const now = Date.now();
    lastMessageAt = now;
    silenceStartedAt = now;
    if (state === 'stale') {
      setState('live', null);
    }
    events.onMessage(event.data, now);
  };

  // The browser always fires close after error, so error needs no handler.
  const handleClose = (event: CloseEvent): void => {
    dropSocket();
    const delay = scheduleReconnect();
    events.onLog(
      'warn',
      delay === null
        ? `socket closed (code ${event.code})`
        : `socket closed (code ${event.code}) — reconnecting in ${delay} ms`,
    );
  };

  const openSocket = (): void => {
    clearRetry();
    if (!navigator.onLine) {
      setState('offline', null);
      return;
    }

    events.onBeforeConnect();
    resetClock();
    silenceStartedAt = Date.now();

    try {
      socket = new WebSocket(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const delay = scheduleReconnect();
      events.onLog(
        'error',
        delay === null
          ? `cannot open socket: ${reason}`
          : `cannot open socket: ${reason} — reconnecting in ${delay} ms`,
      );
      return;
    }

    socket.onopen = handleOpen;
    socket.onmessage = handleSocketMessage;
    socket.onclose = handleClose;
    setState(
      attempt === 0 && !hasConnected ? 'connecting' : 'reconnecting',
      null,
    );
  };

  const handleRetry = (): void => {
    retryTimer = null;
    openSocket();
  };

  const handleLivenessCheck = (): void => {
    if (socket === null) {
      return;
    }
    const now = Date.now();
    const silentMs = now - silenceStartedAt;

    if (silentMs >= DEAD_AFTER_MS) {
      events.onLog(
        'warn',
        `no data for ${silentMs} ms — connection considered dead`,
      );
      dropSocket();
      scheduleReconnect();
      return;
    }
    if (state === 'live' && silentMs >= STALE_AFTER_MS) {
      setState('stale', null);
    }
    if (
      socket.readyState === WebSocket.OPEN &&
      now - lastPingAt >= PING_INTERVAL_MS
    ) {
      sendPing(now);
    }
  };

  // Only pending attempts pause: a socket that still delivers data is kept.
  const handleOffline = (): void => {
    if (retryTimer !== null) {
      clearRetry();
      setState('offline', null);
    }
  };

  const handleOnline = (): void => {
    if (state === 'offline') {
      openSocket();
    }
  };

  const start = (socketUrl: string): void => {
    if (url !== '') {
      return;
    }
    url = socketUrl;
    livenessTimer = setInterval(handleLivenessCheck, LIVENESS_CHECK_MS);
    addEventListener('offline', handleOffline);
    addEventListener('online', handleOnline);
    openSocket();
  };

  const send = (message: ClientMessage): void => {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const acceptHello = (version: unknown): HelloResult => {
    if (version !== PROTOCOL_VERSION) {
      events.onLog(
        'error',
        `protocol version mismatch: server v${String(version)}, client v${PROTOCOL_VERSION}`,
      );
      dropSocket();
      clearRetry();
      if (livenessTimer !== null) {
        clearInterval(livenessTimer);
        livenessTimer = null;
      }
      removeEventListener('offline', handleOffline);
      removeEventListener('online', handleOnline);
      setState('incompatible', null);
      return 'mismatch';
    }

    const result: HelloResult = hasConnected ? 'reconnected' : 'connected';
    hasConnected = true;
    attempt = 0;
    setState('live', null);
    events.onLog('info', `connected, protocol v${PROTOCOL_VERSION}`);
    return result;
  };

  const handlePong = (message: PongMessage, now: number): void => {
    if (!Number.isInteger(message.id) || typeof message.ts !== 'number') {
      return;
    }
    const slot = message.id % PING_SLOTS;
    if (pingIds[slot] !== message.id) {
      return;
    }
    pingIds[slot] = -1;

    const sentAt = pingSentAt[slot] ?? now;
    const rtt = now - sentAt;
    sampleRtts[sampleCount % CLOCK_SAMPLES] = rtt;
    sampleOffsets[sampleCount % CLOCK_SAMPLES] =
      message.ts - (sentAt + rtt / 2);
    sampleCount += 1;

    let best = 0;
    const filled = Math.min(sampleCount, CLOCK_SAMPLES);
    for (let sample = 1; sample < filled; sample++) {
      if ((sampleRtts[sample] ?? 0) < (sampleRtts[best] ?? 0)) {
        best = sample;
      }
    }
    clock.offset = sampleOffsets[best] ?? 0;
    clock.rtt = sampleRtts[best] ?? 0;
    clock.isReady = true;
  };

  return { clock, start, send, acceptHello, handlePong };
}
