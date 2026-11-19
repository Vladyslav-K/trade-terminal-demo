import {
  MAX_MARKETS,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_TICKS,
  VENUE_COUNT,
} from '@trade-terminal/protocol';

import type {
  FrameMessage,
  HistoryMessage,
  SelectedFrame,
} from '../feed-messages.ts';
import {
  BOOK_SIDE_ASK,
  BOOK_SIDE_BID,
  CANDLE_FIELDS,
  DEPTH_POINTS,
  LADDER_ROWS,
  ROW_FIELDS,
  depthIndex,
  ladderIndex,
} from '../frame-layout.ts';
import { writeMarketRow } from './analytics.ts';
import { asks, bestAsk, bestBid, bids, bookIndex, dirty } from './books.ts';
import { takeFrameStats } from './counters.ts';
import {
  followTrades,
  getClosedCandles,
  getRecentTrades,
  takeNewSignals,
  takeNewTrades,
  takeSparks,
  updateCandle,
  writeOpenCandle,
} from './history.ts';

export interface OutgoingMessage<T> {
  message: T;
  transfer: Transferable[];
}

const SIDES = [BOOK_SIDE_BID, BOOK_SIDE_ASK] as const;

const rowScratch = new Float64Array(MAX_MARKETS * ROW_FIELDS);

let selectedMarket = 0;
let notional = 0;

function levelsOf(side: number): Int32Array {
  return side === BOOK_SIDE_BID ? bids : asks;
}

function bestOf(side: number): Int16Array {
  return side === BOOK_SIDE_BID ? bestBid : bestAsk;
}

function stepOf(side: number): number {
  return side === BOOK_SIDE_BID ? -1 : 1;
}

function isPrice(price: number): boolean {
  return price >= PRICE_MIN && price <= PRICE_MAX;
}

function writeLadders(m: number, ladders: Int32Array): void {
  for (let x = 0; x < VENUE_COUNT; x++) {
    const book = bookIndex(m, x);
    const base = book * PRICE_TICKS;

    for (const side of SIDES) {
      const levels = levelsOf(side);
      const step = stepOf(side);
      let price = bestOf(side)[book] ?? 0;
      let row = 0;

      while (isPrice(price) && row < LADDER_ROWS) {
        const size = levels[base + price] ?? 0;
        if (size > 0) {
          const index = ladderIndex(x, side, row);
          ladders[index] = price;
          ladders[index + 1] = size;
          row += 1;
        }
        price += step;
      }
    }
  }
}

// The best price of the side across venues; 0 when the side is empty.
function innermostPrice(m: number, side: number): number {
  const best = bestOf(side);
  let result = 0;
  for (let x = 0; x < VENUE_COUNT; x++) {
    const price = best[bookIndex(m, x)] ?? 0;
    const isBetter = side === BOOK_SIDE_BID ? price > result : price < result;
    if (price > 0 && (result === 0 || isBetter)) {
      result = price;
    }
  }
  return result;
}

// Only venues with a non-empty side are summed: a reset book keeps stale
// sizes until its next snapshot.
function writeDepth(m: number, depth: Int32Array): void {
  for (const side of SIDES) {
    const levels = levelsOf(side);
    const best = bestOf(side);
    const step = stepOf(side);
    let price = innermostPrice(m, side);
    let total = 0;
    let point = 0;

    while (isPrice(price) && point < DEPTH_POINTS) {
      let size = 0;
      for (let x = 0; x < VENUE_COUNT; x++) {
        const book = bookIndex(m, x);
        if ((best[book] ?? 0) > 0) {
          size += levels[book * PRICE_TICKS + price] ?? 0;
        }
      }
      if (size > 0) {
        total += size;
        const index = depthIndex(side, point);
        depth[index] = price;
        depth[index + 1] = total;
        point += 1;
      }
      price += step;
    }
  }
}

function buildSelected(m: number): SelectedFrame {
  const ladders = new Int32Array(VENUE_COUNT * 2 * LADDER_ROWS * 2);
  const depth = new Int32Array(2 * DEPTH_POINTS * 2);
  const candle = new Float64Array(CANDLE_FIELDS);
  writeLadders(m, ladders);
  writeDepth(m, depth);
  writeOpenCandle(m, candle);
  return { market: m, ladders, depth, candle };
}

// Rows are built only for markets changed since the previous frame, and the
// selected market's slices only when it changed: this is the conflation step.
export function buildFrame(marketCount: number): OutgoingMessage<FrameMessage> {
  const stats = takeFrameStats();
  const transfer: Transferable[] = [stats.buffer];

  let rowCount = 0;
  let isSelectedChanged = false;
  for (let m = 0; m < marketCount; m++) {
    if (dirty[m] !== 1) {
      continue;
    }
    dirty[m] = 0;
    const prob = writeMarketRow(m, notional, rowScratch, rowCount * ROW_FIELDS);
    updateCandle(m, prob);
    rowCount += 1;
    if (m === selectedMarket) {
      isSelectedChanged = true;
    }
  }

  const rows = rowCount > 0 ? rowScratch.slice(0, rowCount * ROW_FIELDS) : null;
  const selected = isSelectedChanged ? buildSelected(selectedMarket) : null;
  const trades = takeNewTrades();
  const signals = takeNewSignals();
  const sparks = takeSparks(marketCount);

  const message: FrameMessage = {
    type: 'frame',
    stats,
    rows,
    selected,
    trades,
    signals,
  };
  if (rows !== null) {
    transfer.push(rows.buffer);
  }
  if (selected !== null) {
    transfer.push(
      selected.ladders.buffer,
      selected.depth.buffer,
      selected.candle.buffer,
    );
  }
  if (trades !== null) {
    transfer.push(trades.buffer);
  }
  if (signals !== null) {
    transfer.push(signals.buffer);
  }
  if (sparks !== undefined) {
    message.sparks = sparks;
    transfer.push(sparks.buffer);
  }
  return { message, transfer };
}

export function markAllDirty(): void {
  dirty.fill(1);
}

export function setNotional(value: number): void {
  notional = value;
  markAllDirty();
}

// The history goes out before the next frame, so every later frame belongs
// to the new market.
export function selectMarket(
  m: number,
  marketCount: number,
): OutgoingMessage<HistoryMessage> {
  selectedMarket = m;
  followTrades(m);
  dirty[m] = 1;

  const isActive = m < marketCount;
  const candles = isActive ? getClosedCandles(m) : new Float64Array(0);
  const trades = isActive ? getRecentTrades(m) : new Float64Array(0);
  return {
    message: { type: 'history', market: m, candles, trades },
    transfer: [candles.buffer, trades.buffer],
  };
}
