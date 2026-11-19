import { BOOK_DEPTH, PRICE_MAX, PRICE_MIN } from '@trade-terminal/protocol';
import type { PriceLevel } from '@trade-terminal/protocol';

import {
  levelCount,
  levelPriceAt,
  setLevel,
  sizeAt,
  worstPrice,
} from './book.ts';
import type { Book, BookSide } from './book.ts';
import { clamp } from './math.ts';
import type { Prng } from './prng.ts';

const MID_MIN = 10;
const MID_MAX = 990;
const HALF_SPREAD_MAX = 3;
const LEVEL_STEP_MAX = 3;
const INITIAL_LEVELS = 15;
const MIN_LEVELS = 5;
const DEPTH_WINDOW = 60;
const NEW_LEVEL_SPAN = 40;
const SIZE_MIN = 10;
const SIZE_MAX = 5000;
const RESIZE_DEVIATION = 0.35;
const MAX_LEVEL_CHANGES = 3;
const SPARSE_SIDE_LEVELS = 12;
const DENSE_SIDE_LEVELS = 18;

// mid is the book anchor: every bid is below it and every ask is above it, so the book never crosses.
// Levels stay within DEPTH_WINDOW ticks of it.
export interface AnchoredBook {
  book: Book;
  mid: number;
}

export interface BookDelta {
  b: PriceLevel[];
  a: PriceLevel[];
}

// Edits venue books and collects the levels changed since the last takeDelta().
export interface BookEditor {
  seed(venue: AnchoredBook, mid: number): void;
  recenter(venue: AnchoredBook, mid: number): void;
  changeLevels(venue: AnchoredBook): void;
  setSize(book: Book, side: BookSide, price: number, size: number): void;
  restoreDepth(venue: AnchoredBook, side: BookSide): void;
  hasChanges(): boolean;
  takeDelta(book: Book): BookDelta;
}

export function clampMid(mid: number): number {
  return clamp(Math.round(mid), MID_MIN, MID_MAX);
}

export function createBookEditor(rng: Prng): BookEditor {
  const touchedBids: number[] = [];
  const touchedAsks: number[] = [];

  // Log-uniform, so small sizes are common and large ones are rare.
  const randomSize = (): number =>
    clamp(
      Math.round(SIZE_MIN * (SIZE_MAX / SIZE_MIN) ** rng.next()),
      SIZE_MIN,
      SIZE_MAX,
    );

  const resized = (size: number): number => {
    const next = clamp(
      Math.round(size * Math.exp(RESIZE_DEVIATION * rng.nextGaussian())),
      SIZE_MIN,
      SIZE_MAX,
    );
    if (next !== size) {
      return next;
    }
    return size < SIZE_MAX ? size + 1 : size - 1;
  };

  const setSize = (
    book: Book,
    side: BookSide,
    price: number,
    size: number,
  ): void => {
    setLevel(book, side, price, size);
    const touched = side === 'bid' ? touchedBids : touchedAsks;
    if (!touched.includes(price)) {
      touched.push(price);
    }
  };

  const resetTouched = (): void => {
    touchedBids.length = 0;
    touchedAsks.length = 0;
  };

  // Prefers a tick just beyond the worst level, otherwise the free tick closest to the mid.
  const findFreeTick = (venue: AnchoredBook, side: BookSide): number => {
    const { book, mid } = venue;
    const direction = side === 'bid' ? -1 : 1;
    const limit =
      side === 'bid'
        ? Math.max(PRICE_MIN, mid - DEPTH_WINDOW)
        : Math.min(PRICE_MAX, mid + DEPTH_WINDOW);
    const isInWindow = (price: number): boolean =>
      direction < 0 ? price >= limit : price <= limit;

    if (levelCount(book, side) > 0) {
      const deeper =
        worstPrice(book, side) + direction * rng.nextInt(1, LEVEL_STEP_MAX);
      if (isInWindow(deeper)) {
        return deeper;
      }
    }
    for (let price = mid + direction; isInWindow(price); price += direction) {
      if (sizeAt(book, side, price) === 0) {
        return price;
      }
    }
    throw new Error('No free tick inside the depth window');
  };

  const restoreDepth = (venue: AnchoredBook, side: BookSide): void => {
    const { book } = venue;
    while (levelCount(book, side) > BOOK_DEPTH) {
      setSize(book, side, worstPrice(book, side), 0);
    }
    while (levelCount(book, side) < MIN_LEVELS) {
      setSize(book, side, findFreeTick(venue, side), randomSize());
    }
  };

  const seedSide = (venue: AnchoredBook, side: BookSide): void => {
    const direction = side === 'bid' ? -1 : 1;
    let price = venue.mid + direction * rng.nextInt(1, HALF_SPREAD_MAX);
    for (
      let index = 0;
      index < INITIAL_LEVELS && price >= PRICE_MIN && price <= PRICE_MAX;
      index++
    ) {
      setSize(venue.book, side, price, randomSize());
      price += direction * rng.nextInt(1, LEVEL_STEP_MAX);
    }
    restoreDepth(venue, side);
  };

  const seed = (venue: AnchoredBook, mid: number): void => {
    venue.mid = clampMid(mid);
    seedSide(venue, 'bid');
    seedSide(venue, 'ask');
    resetTouched();
  };

  // Drops levels that crossed the new mid or left the depth window, then quotes next to the mid.
  const recenter = (venue: AnchoredBook, mid: number): void => {
    const { book } = venue;
    const anchor = clampMid(mid);
    venue.mid = anchor;

    while (book.bidLevels > 0 && book.bestBid >= anchor) {
      setSize(book, 'bid', book.bestBid, 0);
    }
    while (book.askLevels > 0 && book.bestAsk <= anchor) {
      setSize(book, 'ask', book.bestAsk, 0);
    }
    while (book.bidLevels > 0 && book.worstBid < anchor - DEPTH_WINDOW) {
      setSize(book, 'bid', book.worstBid, 0);
    }
    while (book.askLevels > 0 && book.worstAsk > anchor + DEPTH_WINDOW) {
      setSize(book, 'ask', book.worstAsk, 0);
    }

    const bidTarget = anchor - rng.nextInt(1, HALF_SPREAD_MAX);
    if (book.bidLevels === 0 || book.bestBid < bidTarget) {
      setSize(book, 'bid', bidTarget, randomSize());
    }
    const askTarget = anchor + rng.nextInt(1, HALF_SPREAD_MAX);
    if (book.askLevels === 0 || book.bestAsk > askTarget) {
      setSize(book, 'ask', askTarget, randomSize());
    }
  };

  // Levels near the top of the book are picked more often.
  const resizeLevel = (book: Book, side: BookSide): void => {
    const position = Math.floor(rng.next() ** 2 * levelCount(book, side));
    const price = levelPriceAt(book, side, position);
    setSize(book, side, price, resized(sizeAt(book, side, price)));
  };

  const removeLevel = (book: Book, side: BookSide): void => {
    const position = rng.nextInt(0, levelCount(book, side) - 1);
    setSize(book, side, levelPriceAt(book, side, position), 0);
  };

  const addLevel = (venue: AnchoredBook, side: BookSide): void => {
    const { book, mid } = venue;
    const distance = 1 + Math.floor(rng.next() ** 2 * NEW_LEVEL_SPAN);
    const price = side === 'bid' ? mid - distance : mid + distance;
    if (price < PRICE_MIN || price > PRICE_MAX) {
      resizeLevel(book, side);
      return;
    }
    const size = sizeAt(book, side, price);
    setSize(book, side, price, size > 0 ? resized(size) : randomSize());
  };

  // Add and remove shares pull the level count of a side back towards INITIAL_LEVELS.
  const changeLevels = (venue: AnchoredBook): void => {
    const { book } = venue;
    const changes = rng.nextInt(1, MAX_LEVEL_CHANGES);

    for (let index = 0; index < changes; index++) {
      const side: BookSide = rng.next() < 0.5 ? 'bid' : 'ask';
      const levels = levelCount(book, side);
      const addShare =
        levels < SPARSE_SIDE_LEVELS
          ? 0.4
          : levels > DENSE_SIDE_LEVELS
            ? 0.1
            : 0.25;
      const roll = rng.next();

      if (roll < addShare) {
        addLevel(venue, side);
      } else if (roll < 0.5 && levels > MIN_LEVELS) {
        removeLevel(book, side);
      } else {
        resizeLevel(book, side);
      }
    }
  };

  const hasChanges = (): boolean =>
    touchedBids.length > 0 || touchedAsks.length > 0;

  const takeDelta = (book: Book): BookDelta => {
    const delta: BookDelta = {
      b: touchedBids.map((price): PriceLevel => [
        price,
        sizeAt(book, 'bid', price),
      ]),
      a: touchedAsks.map((price): PriceLevel => [
        price,
        sizeAt(book, 'ask', price),
      ]),
    };
    resetTouched();
    return delta;
  };

  return {
    seed,
    recenter,
    changeLevels,
    setSize,
    restoreDepth,
    hasChanges,
    takeDelta,
  };
}
