import { MAX_MARKETS } from '@trade-terminal/protocol';

import {
  CANDLE_CLOSE,
  CANDLE_FIELDS,
  CANDLE_HIGH,
  CANDLE_HISTORY,
  CANDLE_LOW,
  CANDLE_OPEN,
  CANDLE_TIME,
  SIGNAL_A,
  SIGNAL_B,
  SIGNAL_FIELDS,
  SIGNAL_HISTORY,
  SIGNAL_ID,
  SIGNAL_KIND,
  SIGNAL_MARKET,
  SIGNAL_TS,
  SIGNAL_VALUE,
  SPARK_POINTS,
  TRADE_FIELDS,
  TRADE_HISTORY,
  TRADE_PRICE,
  TRADE_SIDE,
  TRADE_SIZE,
  TRADE_TS,
  TRADE_VENUE,
} from '../frame-layout.ts';

// Stored candles keep open, high, low and close. All markets close their
// candles on the same tick, so the candle times are shared.
const OHLC = 4;

// sparkHead is the slot written next, which also holds the oldest point.
const sparks = new Float32Array(MAX_MARKETS * SPARK_POINTS).fill(NaN);
let sparkHead = 0;
let hasNewSparks = false;

const candles = new Float32Array(MAX_MARKETS * CANDLE_HISTORY * OHLC);
const candleTimes = new Float64Array(CANDLE_HISTORY);
let candleHead = 0;
let candleCount = 0;
// The open candle of every market; NaN until the market has a price in it.
const openCandles = new Float64Array(MAX_MARKETS * OHLC).fill(NaN);
let openCandleTime = Math.floor(Date.now() / 1000);

// tradeTotals counts every trade of a market; trade n lives in the ring slot
// n % TRADE_HISTORY. The cursor marks the trades already sent for the
// followed market, and the same applies to signals.
const trades = new Float64Array(MAX_MARKETS * TRADE_HISTORY * TRADE_FIELDS);
const tradeTotals = new Float64Array(MAX_MARKETS);
let followedMarket = 0;
let tradeCursor = 0;

const signals = new Float64Array(SIGNAL_HISTORY * SIGNAL_FIELDS);
let signalTotal = 0;
let signalCursor = 0;

export const volume = new Float64Array(MAX_MARKETS);
export const lastTs = new Float64Array(MAX_MARKETS);

export function resetHistory(nowSec: number): void {
  sparks.fill(NaN);
  sparkHead = 0;
  hasNewSparks = false;
  candleHead = 0;
  candleCount = 0;
  openCandles.fill(NaN);
  openCandleTime = Math.max(nowSec, openCandleTime + 1);
  tradeTotals.fill(0);
  tradeCursor = 0;
  signalTotal = 0;
  signalCursor = 0;
  volume.fill(0);
  lastTs.fill(0);
}

export function noteMarketTs(m: number, ts: number): void {
  if (Number.isFinite(ts) && ts > (lastTs[m] ?? 0)) {
    lastTs[m] = ts;
  }
}

export function getMinuteAgoPrice(m: number): number {
  return sparks[m * SPARK_POINTS + sparkHead] ?? NaN;
}

export function updateCandle(m: number, price: number): void {
  if (Number.isNaN(price)) {
    return;
  }
  const base = m * OHLC;
  if (Number.isNaN(openCandles[base] ?? NaN)) {
    openCandles.fill(price, base, base + OHLC);
    return;
  }
  if (price > (openCandles[base + 1] ?? price)) {
    openCandles[base + 1] = price;
  }
  if (price < (openCandles[base + 2] ?? price)) {
    openCandles[base + 2] = price;
  }
  openCandles[base + 3] = price;
}

// Records the current price of markets 0..marketCount-1 as the next
// sparkline point and closes their candles. The next candle opens flat at
// that price, or empty when the market has no price, which leaves a gap.
export function closeSecond(
  marketCount: number,
  nowSec: number,
  getPrice: (m: number) => number,
): void {
  for (let m = 0; m < marketCount; m++) {
    const price = getPrice(m);
    updateCandle(m, price);
    sparks[m * SPARK_POINTS + sparkHead] = price;

    const open = m * OHLC;
    const closed = (m * CANDLE_HISTORY + candleHead) * OHLC;
    candles.set(openCandles.subarray(open, open + OHLC), closed);
    openCandles.fill(price, open, open + OHLC);
  }

  candleTimes[candleHead] = openCandleTime;
  candleHead = (candleHead + 1) % CANDLE_HISTORY;
  candleCount = Math.min(candleCount + 1, CANDLE_HISTORY);
  openCandleTime = Math.max(nowSec, openCandleTime + 1);
  sparkHead = (sparkHead + 1) % SPARK_POINTS;
  hasNewSparks = true;
}

// Returns the sparklines of markets 0..marketCount-1, oldest point first,
// once per closed second; undefined when no second closed since the last
// call.
export function takeSparks(
  marketCount: number,
): Float32Array<ArrayBuffer> | undefined {
  if (!hasNewSparks) {
    return undefined;
  }
  hasNewSparks = false;

  const result = new Float32Array(marketCount * SPARK_POINTS);
  const tail = SPARK_POINTS - sparkHead;
  for (let m = 0; m < marketCount; m++) {
    const base = m * SPARK_POINTS;
    result.set(sparks.subarray(base + sparkHead, base + SPARK_POINTS), base);
    result.set(sparks.subarray(base, base + sparkHead), base + tail);
  }
  return result;
}

export function writeOpenCandle(m: number, target: Float64Array): void {
  const base = m * OHLC;
  target[CANDLE_TIME] = openCandleTime;
  target[CANDLE_OPEN] = openCandles[base] ?? NaN;
  target[CANDLE_HIGH] = openCandles[base + 1] ?? NaN;
  target[CANDLE_LOW] = openCandles[base + 2] ?? NaN;
  target[CANDLE_CLOSE] = openCandles[base + 3] ?? NaN;
}

// Closed candles of the market with a price, oldest first.
export function getClosedCandles(m: number): Float64Array<ArrayBuffer> {
  const firstSlot = candleHead - candleCount + CANDLE_HISTORY;
  let count = 0;
  for (let index = 0; index < candleCount; index++) {
    const slot = (firstSlot + index) % CANDLE_HISTORY;
    if (!Number.isNaN(candles[(m * CANDLE_HISTORY + slot) * OHLC] ?? NaN)) {
      count += 1;
    }
  }

  const result = new Float64Array(count * CANDLE_FIELDS);
  let offset = 0;
  for (let index = 0; index < candleCount; index++) {
    const slot = (firstSlot + index) % CANDLE_HISTORY;
    const base = (m * CANDLE_HISTORY + slot) * OHLC;
    if (Number.isNaN(candles[base] ?? NaN)) {
      continue;
    }
    result[offset + CANDLE_TIME] = candleTimes[slot] ?? 0;
    result[offset + CANDLE_OPEN] = candles[base] ?? NaN;
    result[offset + CANDLE_HIGH] = candles[base + 1] ?? NaN;
    result[offset + CANDLE_LOW] = candles[base + 2] ?? NaN;
    result[offset + CANDLE_CLOSE] = candles[base + 3] ?? NaN;
    offset += CANDLE_FIELDS;
  }
  return result;
}

// side is TRADE_SIDE_BUY or TRADE_SIDE_SELL.
export function recordTrade(
  m: number,
  ts: number,
  venue: number,
  price: number,
  size: number,
  side: number,
): void {
  const total = tradeTotals[m] ?? 0;
  const offset = (m * TRADE_HISTORY + (total % TRADE_HISTORY)) * TRADE_FIELDS;
  trades[offset + TRADE_TS] = ts;
  trades[offset + TRADE_VENUE] = venue;
  trades[offset + TRADE_PRICE] = price;
  trades[offset + TRADE_SIZE] = size;
  trades[offset + TRADE_SIDE] = side;
  tradeTotals[m] = total + 1;
  volume[m] = (volume[m] ?? 0) + size;
  noteMarketTs(m, ts);
}

// Copies trades number from..end-1 of the market, which must still be in its
// ring.
function copyTrades(
  m: number,
  from: number,
  end: number,
): Float64Array<ArrayBuffer> {
  const result = new Float64Array((end - from) * TRADE_FIELDS);
  for (let index = from; index < end; index++) {
    const source = (m * TRADE_HISTORY + (index % TRADE_HISTORY)) * TRADE_FIELDS;
    result.set(
      trades.subarray(source, source + TRADE_FIELDS),
      (index - from) * TRADE_FIELDS,
    );
  }
  return result;
}

export function getRecentTrades(m: number): Float64Array<ArrayBuffer> {
  const total = tradeTotals[m] ?? 0;
  return copyTrades(m, Math.max(0, total - TRADE_HISTORY), total);
}

export function followTrades(m: number): void {
  followedMarket = m;
  tradeCursor = tradeTotals[m] ?? 0;
}

// When more trades came than the ring holds, only the newest are returned.
export function takeNewTrades(): Float64Array<ArrayBuffer> | null {
  const total = tradeTotals[followedMarket] ?? 0;
  if (total <= tradeCursor) {
    return null;
  }
  const from = Math.max(tradeCursor, total - TRADE_HISTORY);
  tradeCursor = total;
  return copyTrades(followedMarket, from, total);
}

export function recordSignal(
  id: number,
  m: number,
  ts: number,
  kind: number,
  a: number,
  b: number,
  value: number,
): void {
  const offset = (signalTotal % SIGNAL_HISTORY) * SIGNAL_FIELDS;
  signals[offset + SIGNAL_ID] = id;
  signals[offset + SIGNAL_MARKET] = m;
  signals[offset + SIGNAL_TS] = ts;
  signals[offset + SIGNAL_KIND] = kind;
  signals[offset + SIGNAL_A] = a;
  signals[offset + SIGNAL_B] = b;
  signals[offset + SIGNAL_VALUE] = value;
  signalTotal += 1;
}

export function takeNewSignals(): Float64Array<ArrayBuffer> | null {
  if (signalTotal <= signalCursor) {
    return null;
  }
  const from = Math.max(signalCursor, signalTotal - SIGNAL_HISTORY);
  const result = new Float64Array((signalTotal - from) * SIGNAL_FIELDS);
  for (let index = from; index < signalTotal; index++) {
    const source = (index % SIGNAL_HISTORY) * SIGNAL_FIELDS;
    result.set(
      signals.subarray(source, source + SIGNAL_FIELDS),
      (index - from) * SIGNAL_FIELDS,
    );
  }
  signalCursor = signalTotal;
  return result;
}
