import { MAX_MARKETS } from '@trade-terminal/protocol';

import type {
  FrameMessage,
  HistoryMessage,
  SelectedFrame,
} from './feed-messages.ts';
import {
  CLOCK_OFFSET,
  OLDEST_TS,
  ROW_EDGE,
  ROW_EDGE_DIR,
  ROW_EDGE_SIZE,
  ROW_FIELDS,
  ROW_LAST_TS,
  ROW_MARKET,
  ROW_VOLUME,
  SIGNAL_FIELDS,
  SIGNAL_HISTORY,
  TRADE_FIELDS,
  TRADE_HISTORY,
} from './frame-layout.ts';
import { createLatencyHistogram } from './latency-histogram.ts';
import type { LatencySummary } from './latency-histogram.ts';

const SCREEN_WINDOW_MS = 1000;
const NO_ROWS = new Float64Array(0);

export type HotTopic =
  'selected' | 'trades' | 'signals' | 'sparks' | 'stats' | 'history';

export type HotListener = () => void;

// Records are numbered in arrival order; only the newest ones stay readable,
// from getFirst() up to getEnd() - 1.
export interface RecordQueue {
  getFirst(): number;
  getEnd(): number;
  get(index: number, field: number): number;
}

interface WritableRecordQueue extends RecordQueue {
  push(records: Float64Array): void;
  clear(): void;
}

export interface HistorySlice {
  market: number;
  candles: Float64Array<ArrayBuffer>;
  trades: Float64Array<ArrayBuffer>;
}

export interface HotStore {
  applyFrame(frame: FrameMessage): void;
  // The trades queue is refilled with the history trades.
  applyHistory(history: HistoryMessage): void;
  // Clears everything that belongs to the market list.
  reset(): void;
  subscribeRow(market: number, listener: HotListener): () => void;
  subscribeTopic(topic: HotTopic, listener: HotListener): () => void;
  getRowValue(market: number, field: number): number;
  getRowVersion(market: number): number;
  getTopicVersion(topic: HotTopic): number;
  getStats(): Float64Array<ArrayBuffer> | null;
  // performance.now() at which the latest stats arrived.
  getStatsReceivedAt(): number;
  getSelected(): SelectedFrame | null;
  getSparks(): Float32Array<ArrayBuffer> | null;
  getHistory(): HistorySlice | null;
  // From the server ts of the oldest message in a frame to the moment the
  // frame is applied, p95 over the last second, in ms.
  getScreenLatencyP95(): number;
  readonly trades: RecordQueue;
  readonly signals: RecordQueue;
}

function createRecordQueue(
  capacity: number,
  fields: number,
): WritableRecordQueue {
  const data = new Float64Array(capacity * fields);
  let first = 0;
  let end = 0;

  const getFirst = (): number => Math.max(first, end - capacity);
  const getEnd = (): number => end;
  const get = (index: number, field: number): number =>
    data[(index % capacity) * fields + field] ?? NaN;

  const push = (records: Float64Array): void => {
    const count = Math.floor(records.length / fields);
    const skipped = Math.max(0, count - capacity);
    end += skipped;
    for (let record = skipped; record < count; record++) {
      data.set(
        records.subarray(record * fields, (record + 1) * fields),
        (end % capacity) * fields,
      );
      end += 1;
    }
  };

  const clear = (): void => {
    first = end;
  };

  return { getFirst, getEnd, get, push, clear };
}

function isMarketIndex(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < MAX_MARKETS
  );
}

const rows = new Float64Array(MAX_MARKETS * ROW_FIELDS);
const rowVersion = new Uint32Array(MAX_MARKETS);
const rowListeners = Array.from(
  { length: MAX_MARKETS },
  () => new Set<HotListener>(),
);

const topicVersion: Record<HotTopic, number> = {
  selected: 0,
  trades: 0,
  signals: 0,
  sparks: 0,
  stats: 0,
  history: 0,
};
const topicListeners: Record<HotTopic, Set<HotListener>> = {
  selected: new Set(),
  trades: new Set(),
  signals: new Set(),
  sparks: new Set(),
  stats: new Set(),
  history: new Set(),
};
const changedTopics: HotTopic[] = [];

const tradeQueue = createRecordQueue(TRADE_HISTORY, TRADE_FIELDS);
const signalQueue = createRecordQueue(SIGNAL_HISTORY, SIGNAL_FIELDS);

let stats: Float64Array<ArrayBuffer> | null = null;
let statsReceivedAt = 0;
let selected: SelectedFrame | null = null;
let sparks: Float32Array<ArrayBuffer> | null = null;
let history: HistorySlice | null = null;

const screenLatency = createLatencyHistogram();
const screenSummary: LatencySummary = { p50: 0, p95: 0, max: 0 };
let screenWindowStartedAt = performance.now();

// Matches the row the worker sends for a market without data.
const clearRow = (m: number): void => {
  const base = m * ROW_FIELDS;
  rows.fill(NaN, base, base + ROW_FIELDS);
  rows[base + ROW_MARKET] = m;
  rows[base + ROW_EDGE] = 0;
  rows[base + ROW_EDGE_SIZE] = 0;
  rows[base + ROW_EDGE_DIR] = 0;
  rows[base + ROW_VOLUME] = 0;
  rows[base + ROW_LAST_TS] = 0;
};

const notifyRow = (m: number): void => {
  rowListeners[m]?.forEach((listener) => listener());
};

const markTopic = (topic: HotTopic): void => {
  topicVersion[topic] += 1;
  changedTopics.push(topic);
};

const notifyChangedTopics = (): void => {
  for (const topic of changedTopics) {
    topicListeners[topic].forEach((listener) => listener());
  }
  changedTopics.length = 0;
};

// Hidden tabs draw nothing, so their frames say nothing about screen latency.
const recordScreenLatency = (frameStats: Float64Array, now: number): void => {
  const oldestTs = frameStats[OLDEST_TS] ?? 0;
  if (oldestTs > 0 && !document.hidden) {
    const offset = frameStats[CLOCK_OFFSET] ?? 0;
    screenLatency.record(Date.now() + offset - oldestTs);
  }
  if (now - screenWindowStartedAt >= SCREEN_WINDOW_MS) {
    screenLatency.roll(screenSummary);
    screenWindowStartedAt = now;
  }
};

// Everything is stored before any listener runs, so a listener always sees
// one consistent frame.
const applyFrame = (frame: FrameMessage): void => {
  const now = performance.now();
  const frameRows = frame.rows ?? NO_ROWS;
  const rowCount = Math.floor(frameRows.length / ROW_FIELDS);

  for (let row = 0; row < rowCount; row++) {
    const offset = row * ROW_FIELDS;
    const m = frameRows[offset + ROW_MARKET];
    if (isMarketIndex(m)) {
      rows.set(frameRows.subarray(offset, offset + ROW_FIELDS), m * ROW_FIELDS);
      rowVersion[m] = (rowVersion[m] ?? 0) + 1;
    }
  }

  stats = frame.stats;
  statsReceivedAt = now;
  recordScreenLatency(frame.stats, now);
  markTopic('stats');

  if (frame.selected !== null) {
    selected = frame.selected;
    markTopic('selected');
  }
  if (frame.trades !== null) {
    tradeQueue.push(frame.trades);
    markTopic('trades');
  }
  if (frame.signals !== null) {
    signalQueue.push(frame.signals);
    markTopic('signals');
  }
  if (frame.sparks !== undefined) {
    sparks = frame.sparks;
    markTopic('sparks');
  }

  for (let row = 0; row < rowCount; row++) {
    const m = frameRows[row * ROW_FIELDS + ROW_MARKET];
    if (isMarketIndex(m)) {
      notifyRow(m);
    }
  }
  notifyChangedTopics();
};

const applyHistory = (message: HistoryMessage): void => {
  history = {
    market: message.market,
    candles: message.candles,
    trades: message.trades,
  };
  tradeQueue.clear();
  tradeQueue.push(message.trades);
  markTopic('history');
  notifyChangedTopics();
};

const reset = (): void => {
  for (let m = 0; m < MAX_MARKETS; m++) {
    clearRow(m);
    rowVersion[m] = (rowVersion[m] ?? 0) + 1;
  }
  selected = null;
  sparks = null;
  history = null;
  tradeQueue.clear();
  signalQueue.clear();
  markTopic('selected');
  markTopic('sparks');
  markTopic('history');
  markTopic('trades');
  markTopic('signals');

  for (let m = 0; m < MAX_MARKETS; m++) {
    notifyRow(m);
  }
  notifyChangedTopics();
};

const subscribeRow = (market: number, listener: HotListener): (() => void) => {
  const listeners = rowListeners[market];
  if (listeners === undefined) {
    throw new RangeError(`No market row ${market}`);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const subscribeTopic = (
  topic: HotTopic,
  listener: HotListener,
): (() => void) => {
  topicListeners[topic].add(listener);
  return () => {
    topicListeners[topic].delete(listener);
  };
};

for (let m = 0; m < MAX_MARKETS; m++) {
  clearRow(m);
}

export const hotStore: HotStore = {
  applyFrame,
  applyHistory,
  reset,
  subscribeRow,
  subscribeTopic,
  getRowValue: (market, field) => rows[market * ROW_FIELDS + field] ?? NaN,
  getRowVersion: (market) => rowVersion[market] ?? 0,
  getTopicVersion: (topic) => topicVersion[topic],
  getStats: () => stats,
  getStatsReceivedAt: () => statsReceivedAt,
  getSelected: () => selected,
  getSparks: () => sparks,
  getHistory: () => history,
  getScreenLatencyP95: () => screenSummary.p95,
  trades: tradeQueue,
  signals: signalQueue,
};
