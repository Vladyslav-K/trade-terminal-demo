import {
  BOOK_DEPTH,
  CLOSE_POLICY,
  DEFAULT_MARKETS,
  MARKET_COUNTS,
  PROTOCOL_VERSION,
  RATE_DEFAULT,
  VENUE_COUNT,
  parseClientMessage,
} from '@trade-terminal/protocol';
import type {
  ClientMessage,
  ErrorCode,
  ServerMessage,
  SetMessage,
  StreamConfig,
} from '@trade-terminal/protocol';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';

import { VENUES, createSimulation } from '../sim/index.ts';

const TICK_INTERVAL_MS = 5;
// The message debt never exceeds 100 ms of traffic, so a stalled loop does not burst.
const MAX_DEBT_SECONDS = 0.1;
const STATS_INTERVAL_MS = 1000;
const BACKPRESSURE_BYTES = 4 * 1024 * 1024;
// Generation stops at BACKPRESSURE_BYTES; command replies (snapshots) can still
// grow the buffer, so a client that stopped reading is dropped at this size.
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
const COMMAND_WINDOW_MS = 1000;
const COMMANDS_PER_WINDOW = 50;
const CLOSE_INTERNAL_ERROR = 1011;

export interface SessionOptions {
  maxRate: number;
  seed: number;
  onClose(code: number): void;
}

export interface Session {
  // Terminates the socket if the previous ping got no pong, otherwise pings again.
  heartbeat(): void;
  close(code: number, reason: string): void;
}

// Streams one simulation to one socket; the socket must already be open.
export function createSession(ws: WebSocket, options: SessionOptions): Session {
  const { maxRate, seed } = options;
  const config: StreamConfig = {
    rate: Math.min(RATE_DEFAULT, maxRate),
    markets: DEFAULT_MARKETS,
  };
  let simulation = createSimulation(seed, config.markets);
  const out: ServerMessage[] = [];

  let debt = 0;
  let lastTickAt = performance.now();
  let statsWindowStart = lastTickAt;
  let sentInWindow = 0;
  let throttledInWindow = 0;
  let commandWindowStart = Number.NEGATIVE_INFINITY;
  let commandsInWindow = 0;
  let isAlive = true;

  const send = (message: ServerMessage): void => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.error('session terminated: the client stopped reading');
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify(message));
  };

  const sendError = (code: ErrorCode, message: string): void => {
    send({ t: 'err', code, message });
  };

  const sendSnapshots = (): void => {
    const ts = Date.now();
    for (let m = 0; m < config.markets; m++) {
      for (let x = 0; x < VENUE_COUNT; x++) {
        send(simulation.snapshot(m, x, ts));
      }
    }
  };

  const generate = (): void => {
    const now = performance.now();
    const elapsedSeconds = (now - lastTickAt) / 1000;
    lastTickAt = now;

    // Skipped ticks generate nothing, so book sequences stay continuous.
    if (ws.bufferedAmount > BACKPRESSURE_BYTES) {
      throttledInWindow += 1;
      return;
    }

    debt = Math.min(
      debt + config.rate * elapsedSeconds,
      config.rate * MAX_DEBT_SECONDS,
    );
    const ts = Date.now();
    while (debt >= 1) {
      simulation.step(ts, out);
      for (const message of out) {
        send(message);
      }
      debt -= out.length;
      sentInWindow += out.length;
      out.length = 0;
    }
  };

  const tick = (): void => {
    try {
      generate();
    } catch (error) {
      stopTimers();
      console.error('session stopped by a simulation error:', error);
      ws.close(CLOSE_INTERNAL_ERROR, 'internal error');
    }
  };

  const sendStats = (): void => {
    const now = performance.now();
    const elapsedMs = now - statsWindowStart;
    statsWindowStart = now;
    send({
      t: 'stats',
      ts: Date.now(),
      sent: Math.round((sentInWindow * 1000) / elapsedMs),
      rate: config.rate,
      buffered: ws.bufferedAmount,
      throttled: throttledInWindow,
    });
    sentInWindow = 0;
    throttledInWindow = 0;
  };

  const applySet = (command: SetMessage): void => {
    const { rate, markets } = command;
    if (rate !== undefined) {
      config.rate = Math.min(rate, maxRate);
    }
    let hasNewMarkets = false;
    if (markets !== undefined && markets !== config.markets) {
      config.markets = markets;
      simulation = createSimulation(seed, markets);
      hasNewMarkets = true;
    }
    send({ t: 'cfg', config: { ...config }, markets: simulation.markets });
    if (hasNewMarkets) {
      sendSnapshots();
    }
  };

  const handleCommand = (command: ClientMessage): void => {
    switch (command.t) {
      case 'ping':
        send({ t: 'pong', id: command.id, ts: Date.now() });
        return;
      case 'set':
        applySet(command);
        return;
      case 'resync':
        send(simulation.snapshot(command.m, command.x, Date.now()));
        return;
      case 'fault':
        sendError('unsupported', 'fault injection is not supported');
        return;
    }
  };

  const isCommandAllowed = (): boolean => {
    const now = performance.now();
    if (now - commandWindowStart >= COMMAND_WINDOW_MS) {
      commandWindowStart = now;
      commandsInWindow = 0;
    }
    commandsInWindow += 1;
    return commandsInWindow <= COMMANDS_PER_WINDOW;
  };

  const handleMessage = (data: RawData, isBinary: boolean): void => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!isCommandAllowed()) {
      ws.close(CLOSE_POLICY, 'too many commands');
      return;
    }
    const command =
      !isBinary && Buffer.isBuffer(data)
        ? parseClientMessage(data.toString('utf8'), config.markets)
        : null;
    if (command === null) {
      sendError('invalid', 'invalid command');
      return;
    }
    handleCommand(command);
  };

  send({
    t: 'hello',
    v: PROTOCOL_VERSION,
    now: Date.now(),
    config: { ...config },
    limits: { maxRate, marketCounts: MARKET_COUNTS },
    venues: VENUES,
    markets: simulation.markets,
    depth: BOOK_DEPTH,
  });
  sendSnapshots();

  const tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  const statsTimer = setInterval(sendStats, STATS_INTERVAL_MS);
  const stopTimers = (): void => {
    clearInterval(tickTimer);
    clearInterval(statsTimer);
  };

  ws.on('message', handleMessage);
  ws.on('pong', () => {
    isAlive = true;
  });
  ws.on('error', (error) => {
    console.error(`session socket error: ${error.message}`);
  });
  ws.on('close', (code) => {
    stopTimers();
    options.onClose(code);
  });

  return {
    heartbeat: () => {
      if (!isAlive) {
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    },
    close: (code, reason) => {
      ws.close(code, reason);
    },
  };
}
