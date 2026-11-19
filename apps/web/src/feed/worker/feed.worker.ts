import {
  MARKET_COUNTS,
  MAX_MARKETS,
  RATE_MAX,
  VENUE_COUNT,
} from '@trade-terminal/protocol';
import type {
  ConfigMessage,
  DeltaMessage,
  HelloMessage,
  ServerMessage,
  SetMessage,
  SnapshotMessage,
  StatsMessage,
  StreamLimits,
  VenueInfo,
} from '@trade-terminal/protocol';

import type { LogLevel } from '../../stores/app-store.ts';
import type {
  MainToWorkerMessage,
  SetConfigMessage,
  WorkerToMainMessage,
} from '../feed-messages.ts';
import {
  BUSY_MS_TOTAL,
  BYTES_TOTAL,
  CLOCK_OFFSET,
  CROSSED,
  GAPS,
  LAST_MESSAGE_AT,
  OLDEST_TS,
  RECEIVED_DELTAS,
  RECEIVED_SIGNALS,
  RECEIVED_TOTAL,
  RECEIVED_TRADES,
  RECONNECTS,
  RESYNCS,
  RTT,
  SERVER_BUFFERED,
  SERVER_SENT,
  SERVER_THROTTLED,
} from '../frame-layout.ts';
import {
  applyDelta,
  applySnapshot,
  bookIndex,
  isBookCrossed,
  resetBooks,
  seq,
} from './books.ts';
import { createConnection } from './connection.ts';
import {
  addStat,
  recordIngestLatency,
  rollIngestWindow,
  stats,
  takeFrameStats,
} from './counters.ts';

const INGEST_WINDOW_MS = 1000;
// Invalid messages are logged at most once per interval, so a broken stream
// cannot flood the event log.
const INVALID_LOG_INTERVAL_MS = 1000;

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;

let marketCount = 0;
let venues: VenueInfo[] = [];
let limits: StreamLimits = { maxRate: RATE_MAX, marketCounts: MARKET_COUNTS };
let isHidden = false;
let lastInvalidLogAt = 0;

const post = (message: WorkerToMainMessage, transfer?: Transferable[]) => {
  scope.postMessage(message, transfer ?? []);
};

const log = (level: LogLevel, text: string): void => {
  post({ type: 'log', ts: Date.now(), level, text });
};

const venueCode = (x: number): string => venues[x]?.code ?? String(x);

const toMarketCount = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value)
    ? Math.min(Math.max(value, 0), MAX_MARKETS)
    : 0;

const isIndex = (value: unknown, size: number): boolean =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < size;

const isBookRef = (m: unknown, x: unknown): boolean =>
  isIndex(m, marketCount) && isIndex(x, VENUE_COUNT);

const trackDataMessage = (ts: number, now: number): void => {
  if (connection.clock.isReady) {
    recordIngestLatency(now + connection.clock.offset - ts);
  }
  const oldestTs = stats[OLDEST_TS] ?? 0;
  if (!isHidden && ts > 0 && (oldestTs === 0 || ts < oldestTs)) {
    stats[OLDEST_TS] = ts;
  }
};

const handleDelta = (message: DeltaMessage, now: number): void => {
  addStat(RECEIVED_DELTAS, 1);
  trackDataMessage(message.ts, now);

  const { m, x } = message;
  if (!isBookRef(m, x)) {
    return;
  }
  const expected = (seq[bookIndex(m, x)] ?? 0) + 1;
  const result = applyDelta(m, x, message.seq, message.b, message.a);

  if (result === 'applied') {
    if (isBookCrossed(m, x)) {
      addStat(CROSSED, 1);
    }
    return;
  }
  if (result === 'gap') {
    addStat(GAPS, 1);
    connection.send({ t: 'resync', m, x });
    log(
      'warn',
      `gap on market ${m} venue ${venueCode(x)}: expected ${expected}, got ${message.seq} — resync requested`,
    );
  }
};

const handleSnapshot = (message: SnapshotMessage): void => {
  const { m, x } = message;
  if (!isBookRef(m, x)) {
    return;
  }
  const wasResync = applySnapshot(
    m,
    x,
    message.seq,
    message.bids,
    message.asks,
  );
  if (wasResync) {
    addStat(RESYNCS, 1);
    log(
      'info',
      `snapshot applied: market ${m} venue ${venueCode(x)}, seq ${message.seq}`,
    );
  }
};

const handleHello = (message: HelloMessage): void => {
  const result = connection.acceptHello(message.v);
  if (result === 'mismatch') {
    return;
  }
  if (result === 'reconnected') {
    addStat(RECONNECTS, 1);
  }
  marketCount = toMarketCount(message.config.markets);
  venues = message.venues;
  limits = message.limits;
  post({
    type: 'meta',
    markets: message.markets,
    venues,
    config: message.config,
    limits,
  });
};

const handleConfig = (message: ConfigMessage): void => {
  const nextCount = toMarketCount(message.config.markets);
  if (nextCount !== marketCount) {
    resetBooks();
    marketCount = nextCount;
  }
  post({
    type: 'meta',
    markets: message.markets,
    venues,
    config: message.config,
    limits,
  });
};

const handleServerStats = (message: StatsMessage): void => {
  stats[SERVER_SENT] = message.sent;
  stats[SERVER_BUFFERED] = message.buffered;
  stats[SERVER_THROTTLED] = message.throttled;
};

const parseServerMessage = (data: string): ServerMessage | null => {
  try {
    const message: unknown = JSON.parse(data);
    return typeof message === 'object' && message !== null
      ? (message as ServerMessage)
      : null;
  } catch {
    return null;
  }
};

const processMessage = (data: string, now: number): void => {
  const message = parseServerMessage(data);
  if (message === null) {
    if (now - lastInvalidLogAt >= INVALID_LOG_INTERVAL_MS) {
      lastInvalidLogAt = now;
      log('warn', 'invalid message from the server skipped');
    }
    return;
  }

  switch (message.t) {
    case 'd':
      handleDelta(message, now);
      return;
    case 'tr':
      addStat(RECEIVED_TRADES, 1);
      trackDataMessage(message.ts, now);
      return;
    case 'sig':
      addStat(RECEIVED_SIGNALS, 1);
      trackDataMessage(message.ts, now);
      return;
    case 'snap':
      handleSnapshot(message);
      return;
    case 'stats':
      handleServerStats(message);
      return;
    case 'pong':
      connection.handlePong(message, now);
      stats[CLOCK_OFFSET] = connection.clock.offset;
      stats[RTT] = connection.clock.rtt;
      return;
    case 'hello':
      handleHello(message);
      return;
    case 'cfg':
      handleConfig(message);
      return;
    case 'err':
      log('warn', `server error (${message.code}): ${message.message}`);
      return;
  }
};

const handleServerData = (data: unknown, now: number): void => {
  const startedAt = performance.now();
  stats[LAST_MESSAGE_AT] = now;
  addStat(RECEIVED_TOTAL, 1);

  if (typeof data === 'string') {
    addStat(BYTES_TOTAL, data.length);
    processMessage(data, now);
  }

  addStat(BUSY_MS_TOTAL, performance.now() - startedAt);
};

const handleSetConfig = (message: SetConfigMessage): void => {
  const command: SetMessage = { t: 'set' };
  if (message.rate !== undefined) {
    command.rate = message.rate;
  }
  if (message.markets !== undefined) {
    command.markets = message.markets;
  }
  connection.send(command);
};

// While the tab is hidden nothing is drawn, so OLDEST_TS is not tracked:
// otherwise the first frame after the return would report the whole
// hidden period as screen latency.
const handleVisibility = (nextIsHidden: boolean): void => {
  isHidden = nextIsHidden;
  if (isHidden) {
    stats[OLDEST_TS] = 0;
  }
};

const handleMainMessage = (event: MessageEvent<MainToWorkerMessage>): void => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      connection.start(message.url);
      return;
    case 'pull': {
      const frame = takeFrameStats();
      post({ type: 'frame', stats: frame }, [frame.buffer]);
      return;
    }
    case 'visibility':
      handleVisibility(message.isHidden);
      return;
    case 'setConfig':
      handleSetConfig(message);
      return;
  }
};

const connection = createConnection({
  onStatus: (status) => post({ type: 'conn', ...status }),
  onLog: log,
  onBeforeConnect: resetBooks,
  onMessage: handleServerData,
});

scope.addEventListener('message', handleMainMessage);
setInterval(rollIngestWindow, INGEST_WINDOW_MS);
