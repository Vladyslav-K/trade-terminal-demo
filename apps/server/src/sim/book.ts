import { PRICE_MAX, PRICE_MIN, PRICE_TICKS } from '@trade-terminal/protocol';
import type { PriceLevel, SnapshotMessage } from '@trade-terminal/protocol';

export type BookSide = 'bid' | 'ask';

// Price ticks used as best/worst while a side has no levels.
const NO_BID = 0;
const NO_ASK = PRICE_TICKS;

// bids and asks are indexed by price tick; a size of 0 means there is no level.
// For bids "best" is the highest price, for asks the lowest; "worst" is the opposite end.
export interface Book {
  bids: Int32Array;
  asks: Int32Array;
  bestBid: number;
  worstBid: number;
  bestAsk: number;
  worstAsk: number;
  bidLevels: number;
  askLevels: number;
  seq: number;
}

export function createBook(): Book {
  return {
    bids: new Int32Array(PRICE_TICKS),
    asks: new Int32Array(PRICE_TICKS),
    bestBid: NO_BID,
    worstBid: NO_BID,
    bestAsk: NO_ASK,
    worstAsk: NO_ASK,
    bidLevels: 0,
    askLevels: 0,
    seq: 0,
  };
}

export function sizeAt(book: Book, side: BookSide, price: number): number {
  return (side === 'bid' ? book.bids[price] : book.asks[price]) ?? 0;
}

export function levelCount(book: Book, side: BookSide): number {
  return side === 'bid' ? book.bidLevels : book.askLevels;
}

export function bestPrice(book: Book, side: BookSide): number {
  return side === 'bid' ? book.bestBid : book.bestAsk;
}

export function worstPrice(book: Book, side: BookSide): number {
  return side === 'bid' ? book.worstBid : book.worstAsk;
}

// Returns the first tick with a level, moving from start by step (+1 or -1).
function findLevel(levels: Int32Array, start: number, step: 1 | -1): number {
  for (
    let price = start;
    price >= PRICE_MIN && price <= PRICE_MAX;
    price += step
  ) {
    if ((levels[price] ?? 0) > 0) {
      return price;
    }
  }
  throw new Error(`Book has no level from tick ${start}`);
}

function setBid(book: Book, price: number, size: number): void {
  const previous = book.bids[price] ?? 0;
  book.bids[price] = size;

  if (previous === 0) {
    book.bidLevels += 1;
    if (book.bidLevels === 1) {
      book.bestBid = price;
      book.worstBid = price;
      return;
    }
    book.bestBid = Math.max(book.bestBid, price);
    book.worstBid = Math.min(book.worstBid, price);
    return;
  }

  if (size > 0) {
    return;
  }

  book.bidLevels -= 1;
  if (book.bidLevels === 0) {
    book.bestBid = NO_BID;
    book.worstBid = NO_BID;
    return;
  }
  if (price === book.bestBid) {
    book.bestBid = findLevel(book.bids, price - 1, -1);
  }
  if (price === book.worstBid) {
    book.worstBid = findLevel(book.bids, price + 1, 1);
  }
}

function setAsk(book: Book, price: number, size: number): void {
  const previous = book.asks[price] ?? 0;
  book.asks[price] = size;

  if (previous === 0) {
    book.askLevels += 1;
    if (book.askLevels === 1) {
      book.bestAsk = price;
      book.worstAsk = price;
      return;
    }
    book.bestAsk = Math.min(book.bestAsk, price);
    book.worstAsk = Math.max(book.worstAsk, price);
    return;
  }

  if (size > 0) {
    return;
  }

  book.askLevels -= 1;
  if (book.askLevels === 0) {
    book.bestAsk = NO_ASK;
    book.worstAsk = NO_ASK;
    return;
  }
  if (price === book.bestAsk) {
    book.bestAsk = findLevel(book.asks, price + 1, 1);
  }
  if (price === book.worstAsk) {
    book.worstAsk = findLevel(book.asks, price - 1, -1);
  }
}

// A size of 0 removes the level.
export function setLevel(
  book: Book,
  side: BookSide,
  price: number,
  size: number,
): void {
  if (!Number.isInteger(price) || price < PRICE_MIN || price > PRICE_MAX) {
    throw new RangeError(`Price tick out of range: ${price}`);
  }
  if (!Number.isInteger(size) || size < 0) {
    throw new RangeError(`Invalid level size: ${size}`);
  }
  if (sizeAt(book, side, price) === size) {
    return;
  }

  if (side === 'bid') {
    setBid(book, price, size);
  } else {
    setAsk(book, price, size);
  }
}

// Price of the level at the given position counted from the best one (0 = best).
export function levelPriceAt(
  book: Book,
  side: BookSide,
  position: number,
): number {
  const levels = side === 'bid' ? book.bids : book.asks;
  const step = side === 'bid' ? -1 : 1;
  let price = bestPrice(book, side);

  for (let index = 0; index < position; index++) {
    price = findLevel(levels, price + step, step);
  }
  return price;
}

function collectLevels(
  levels: Int32Array,
  from: number,
  to: number,
  step: 1 | -1,
): PriceLevel[] {
  const result: PriceLevel[] = [];
  for (let price = from; step > 0 ? price <= to : price >= to; price += step) {
    const size = levels[price] ?? 0;
    if (size > 0) {
      result.push([price, size]);
    }
  }
  return result;
}

export function toSnapshot(
  book: Book,
  m: number,
  x: number,
  ts: number,
): SnapshotMessage {
  return {
    t: 'snap',
    m,
    x,
    seq: book.seq,
    ts,
    bids:
      book.bidLevels > 0
        ? collectLevels(book.bids, book.bestBid, book.worstBid, -1)
        : [],
    asks:
      book.askLevels > 0
        ? collectLevels(book.asks, book.bestAsk, book.worstAsk, 1)
        : [],
  };
}
