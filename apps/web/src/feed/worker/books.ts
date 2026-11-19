import {
  MAX_MARKETS,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_TICKS,
  VENUE_COUNT,
} from '@trade-terminal/protocol';
import type { PriceLevel } from '@trade-terminal/protocol';

export const BOOK_COUNT = MAX_MARKETS * VENUE_COUNT;

export const BOOK_WAITING = 0;
export const BOOK_SYNCED = 1;
export const BOOK_RESYNC = 2;

const SIZE_MAX = 2 ** 31 - 1;

export type DeltaResult = 'applied' | 'skipped' | 'gap';

// A book index is m * VENUE_COUNT + x. bids and asks hold PRICE_TICKS sizes per
// book, indexed by price tick; size 0 means no level. A best price of 0 means
// the side is empty. bookState holds BOOK_WAITING, BOOK_SYNCED or BOOK_RESYNC.
export const bids = new Int32Array(BOOK_COUNT * PRICE_TICKS);
export const asks = new Int32Array(BOOK_COUNT * PRICE_TICKS);
export const bestBid = new Int16Array(BOOK_COUNT);
export const bestAsk = new Int16Array(BOOK_COUNT);
export const seq = new Float64Array(BOOK_COUNT);
export const bookState = new Uint8Array(BOOK_COUNT);
// Set to 1 when any book of the market changes; cleared by the frame builder.
export const dirty = new Uint8Array(MAX_MARKETS);

export function bookIndex(m: number, x: number): number {
  return m * VENUE_COUNT + x;
}

function isIntBetween(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function setBidLevel(book: number, price: number, size: number): void {
  const base = book * PRICE_TICKS;
  const best = bestBid[book] ?? 0;
  bids[base + price] = size;

  if (size > 0) {
    if (price > best) {
      bestBid[book] = price;
    }
    return;
  }
  if (price !== best) {
    return;
  }

  let next = price - 1;
  while (next >= PRICE_MIN && (bids[base + next] ?? 0) === 0) {
    next -= 1;
  }
  bestBid[book] = next >= PRICE_MIN ? next : 0;
}

function setAskLevel(book: number, price: number, size: number): void {
  const base = book * PRICE_TICKS;
  const best = bestAsk[book] ?? 0;
  asks[base + price] = size;

  if (size > 0) {
    if (best === 0 || price < best) {
      bestAsk[book] = price;
    }
    return;
  }
  if (price !== best) {
    return;
  }

  let next = price + 1;
  while (next <= PRICE_MAX && (asks[base + next] ?? 0) === 0) {
    next += 1;
  }
  bestAsk[book] = next <= PRICE_MAX ? next : 0;
}

function applyLevels(
  book: number,
  levels: readonly PriceLevel[],
  setLevel: (book: number, price: number, size: number) => void,
): void {
  if (!Array.isArray(levels)) {
    return;
  }
  for (const level of levels) {
    if (!Array.isArray(level)) {
      continue;
    }
    const [price, size] = level;
    if (
      isIntBetween(price, PRICE_MIN, PRICE_MAX) &&
      isIntBetween(size, 0, SIZE_MAX)
    ) {
      setLevel(book, price, size);
    }
  }
}

export function resetBooks(): void {
  bookState.fill(BOOK_WAITING);
  bestBid.fill(0);
  bestAsk.fill(0);
  seq.fill(0);
}

// Returns true when the snapshot answered a resync request.
export function applySnapshot(
  m: number,
  x: number,
  snapshotSeq: number,
  bidLevels: readonly PriceLevel[],
  askLevels: readonly PriceLevel[],
): boolean {
  const book = bookIndex(m, x);
  const base = book * PRICE_TICKS;
  const wasResync = bookState[book] === BOOK_RESYNC;

  bids.fill(0, base, base + PRICE_TICKS);
  asks.fill(0, base, base + PRICE_TICKS);
  bestBid[book] = 0;
  bestAsk[book] = 0;
  applyLevels(book, bidLevels, setBidLevel);
  applyLevels(book, askLevels, setAskLevel);

  seq[book] = snapshotSeq;
  bookState[book] = BOOK_SYNCED;
  dirty[m] = 1;
  return wasResync;
}

// On 'gap' the book switches to BOOK_RESYNC and keeps its previous seq.
export function applyDelta(
  m: number,
  x: number,
  deltaSeq: number,
  bidLevels: readonly PriceLevel[],
  askLevels: readonly PriceLevel[],
): DeltaResult {
  const book = bookIndex(m, x);
  if (bookState[book] !== BOOK_SYNCED) {
    return 'skipped';
  }

  const expected = (seq[book] ?? 0) + 1;
  if (deltaSeq < expected) {
    return 'skipped';
  }
  if (deltaSeq !== expected) {
    bookState[book] = BOOK_RESYNC;
    return 'gap';
  }

  seq[book] = deltaSeq;
  applyLevels(book, bidLevels, setBidLevel);
  applyLevels(book, askLevels, setAskLevel);
  dirty[m] = 1;
  return 'applied';
}

export function isBookCrossed(m: number, x: number): boolean {
  const book = bookIndex(m, x);
  const bid = bestBid[book] ?? 0;
  const ask = bestAsk[book] ?? 0;
  return bid > 0 && ask > 0 && bid >= ask;
}
