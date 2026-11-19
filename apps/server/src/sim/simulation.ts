import { MAX_MARKETS, VENUE_COUNT } from '@trade-terminal/protocol';
import type {
  MarketInfo,
  ServerMessage,
  SnapshotMessage,
} from '@trade-terminal/protocol';

import { bestPrice, createBook, sizeAt, toSnapshot } from './book.ts';
import type { BookSide } from './book.ts';
import { createBookEditor } from './book-editor.ts';
import type { AnchoredBook } from './book-editor.ts';
import { getMarkets } from './market-names.ts';
import { clamp } from './math.ts';
import { createPrng } from './prng.ts';

const TRADE_SHARE = 0.11;
const FAIR_MOVE_SHARE = 0.25;
const HOT_MARKET_EXPONENT = 0.8;
const FULL_FILL_SHARE = 0.15;

// Fair moves scale with elapsed time, so volatility does not depend on the message rate.
const FAIR_MIN = 20;
const FAIR_MAX = 980;
const INITIAL_FAIR_MIN = 60;
const INITIAL_FAIR_MAX = 940;
const FAIR_TICKS_PER_SQRT_SEC = 2;
const MAX_ELAPSED_SEC = 10;

const OFFSET_LIMIT = 15;
const OFFSET_DEVIATION = 1.5;
const OFFSET_REVERSION_PER_SEC = 0.2;

const SIGNAL_COOLDOWN_MS = 2000;
const EDGE_MIN_TICKS = 5;
const SHIFT_MIN_TICKS = 15;
const SHIFT_WINDOW_SEC = 10;
const HISTORY_SLOTS = SHIFT_WINDOW_SEC + 1;

interface VenueState extends AnchoredBook {
  offset: number;
  offsetUpdatedAt: number;
  isNextDeltaDropped: boolean;
}

interface MarketState {
  fair: number;
  fairMovedAt: number;
  venues: VenueState[];
  // fairHistory[second % HISTORY_SLOTS] holds the fair at the start of that second.
  fairHistory: Float64Array;
  historySecond: number;
  lastSignalAt: number;
}

export interface Simulation {
  markets: MarketInfo[];
  snapshot(m: number, x: number, ts: number): SnapshotMessage;
  // Runs one event and appends up to 3 messages to out.
  step(ts: number, out: ServerMessage[]): void;
  // The next delta of the (m, x) book advances seq but is not emitted.
  skipNextDelta(m: number, x: number): void;
}

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`Index out of range: ${index}`);
  }
  return item;
}

// A never-set start (NaN) or a clock that went back counts as no time passed.
function elapsedSeconds(from: number, to: number): number {
  const seconds = (to - from) / 1000;
  return Number.isFinite(seconds) ? clamp(seconds, 0, MAX_ELAPSED_SEC) : 0;
}

// Same seed and same timestamps give the same sequence of messages.
export function createSimulation(
  seed: number,
  marketCount: number,
): Simulation {
  if (
    !Number.isInteger(marketCount) ||
    marketCount < 1 ||
    marketCount > MAX_MARKETS
  ) {
    throw new RangeError(`Invalid market count: ${marketCount}`);
  }

  const rng = createPrng(seed);
  const editor = createBookEditor(rng);
  let nextSignalId = 1;
  let firstSecond = Number.NaN;

  const moveFair = (market: MarketState, ts: number): void => {
    const seconds = elapsedSeconds(market.fairMovedAt, ts);
    market.fairMovedAt = ts;

    let fair =
      market.fair +
      rng.nextGaussian() * FAIR_TICKS_PER_SQRT_SEC * Math.sqrt(seconds);
    if (fair < FAIR_MIN) {
      fair = 2 * FAIR_MIN - fair;
    }
    if (fair > FAIR_MAX) {
      fair = 2 * FAIR_MAX - fair;
    }
    market.fair = clamp(fair, FAIR_MIN, FAIR_MAX);
  };

  // Ornstein-Uhlenbeck step: the offset decays towards 0 and gets fresh noise.
  const driftOffset = (venue: VenueState, ts: number): void => {
    const seconds = elapsedSeconds(venue.offsetUpdatedAt, ts);
    venue.offsetUpdatedAt = ts;

    const decay = Math.exp(-OFFSET_REVERSION_PER_SEC * seconds);
    const noise =
      OFFSET_DEVIATION * Math.sqrt(1 - decay * decay) * rng.nextGaussian();
    venue.offset = clamp(
      venue.offset * decay + noise,
      -OFFSET_LIMIT,
      OFFSET_LIMIT,
    );
  };

  const updateBook = (
    market: MarketState,
    venue: VenueState,
    ts: number,
  ): void => {
    if (rng.next() < FAIR_MOVE_SHARE) {
      moveFair(market, ts);
      driftOffset(venue, ts);
      editor.recenter(venue, market.fair + venue.offset);
    }
    if (!editor.hasChanges()) {
      editor.changeLevels(venue);
    }
    editor.restoreDepth(venue, 'bid');
    editor.restoreDepth(venue, 'ask');
  };

  const trade = (
    m: number,
    x: number,
    venue: VenueState,
    ts: number,
    out: ServerMessage[],
  ): void => {
    const { book } = venue;
    const isTakerBuying = rng.next() < 0.5;
    const side: BookSide = isTakerBuying ? 'ask' : 'bid';
    const price = bestPrice(book, side);
    const available = sizeAt(book, side, price);
    const size =
      rng.next() < FULL_FILL_SHARE
        ? available
        : Math.max(1, Math.round(available * rng.next() ** 2));

    out.push({
      t: 'tr',
      m,
      x,
      ts,
      p: price,
      s: size,
      side: isTakerBuying ? 'b' : 's',
    });
    editor.setSize(book, side, price, available - size);
    editor.restoreDepth(venue, side);
  };

  const emitDelta = (
    m: number,
    x: number,
    venue: VenueState,
    ts: number,
    out: ServerMessage[],
  ): void => {
    venue.book.seq += 1;
    const { b, a } = editor.takeDelta(venue.book);
    if (venue.isNextDeltaDropped) {
      venue.isNextDeltaDropped = false;
      return;
    }
    out.push({ t: 'd', m, x, seq: venue.book.seq, ts, b, a });
  };

  // The fair only changes inside events of its market, so skipped seconds get the current value.
  const recordFairHistory = (market: MarketState, second: number): void => {
    if (second <= market.historySecond) {
      return;
    }
    const from = Math.max(
      market.historySecond + 1,
      second - HISTORY_SLOTS + 1,
      firstSecond,
    );
    for (let slotSecond = from; slotSecond <= second; slotSecond++) {
      market.fairHistory[slotSecond % HISTORY_SLOTS] = market.fair;
    }
    market.historySecond = second;
  };

  const fairWindowStart = (
    market: MarketState,
    second: number,
  ): number | null => {
    const startSecond = second - SHIFT_WINDOW_SEC;
    if (startSecond < firstSecond || second !== market.historySecond) {
      return null;
    }
    return market.fairHistory[startSecond % HISTORY_SLOTS] ?? null;
  };

  const emitSignal = (
    m: number,
    market: MarketState,
    ts: number,
    second: number,
    out: ServerMessage[],
  ): void => {
    if (ts - market.lastSignalAt < SIGNAL_COOLDOWN_MS) {
      return;
    }

    let edge = Number.NEGATIVE_INFINITY;
    let buy = 0;
    let sell = 0;
    for (let bidVenue = 0; bidVenue < VENUE_COUNT; bidVenue++) {
      for (let askVenue = 0; askVenue < VENUE_COUNT; askVenue++) {
        if (bidVenue === askVenue) {
          continue;
        }
        const value =
          itemAt(market.venues, bidVenue).book.bestBid -
          itemAt(market.venues, askVenue).book.bestAsk;
        if (value > edge) {
          edge = value;
          sell = bidVenue;
          buy = askVenue;
        }
      }
    }

    if (edge >= EDGE_MIN_TICKS) {
      market.lastSignalAt = ts;
      out.push({
        t: 'sig',
        id: nextSignalId++,
        m,
        ts,
        kind: 'edge',
        buy,
        sell,
        value: edge,
      });
      return;
    }

    const startFair = fairWindowStart(market, second);
    if (startFair === null) {
      return;
    }
    const shift = market.fair - startFair;
    if (Math.abs(shift) < SHIFT_MIN_TICKS) {
      return;
    }
    market.lastSignalAt = ts;
    out.push({
      t: 'sig',
      id: nextSignalId++,
      m,
      ts,
      kind: 'shift',
      dir: shift > 0 ? 1 : -1,
      value: Math.round(Math.abs(shift)),
    });
  };

  const createVenue = (fair: number): VenueState => {
    const offset = clamp(
      rng.nextGaussian() * OFFSET_DEVIATION,
      -OFFSET_LIMIT,
      OFFSET_LIMIT,
    );
    const venue: VenueState = {
      book: createBook(),
      mid: 0,
      offset,
      offsetUpdatedAt: Number.NaN,
      isNextDeltaDropped: false,
    };
    editor.seed(venue, fair + offset);
    return venue;
  };

  const createMarket = (): MarketState => {
    const fair =
      INITIAL_FAIR_MIN + rng.next() * (INITIAL_FAIR_MAX - INITIAL_FAIR_MIN);
    return {
      fair,
      fairMovedAt: Number.NaN,
      venues: Array.from({ length: VENUE_COUNT }, () => createVenue(fair)),
      fairHistory: new Float64Array(HISTORY_SLOTS),
      historySecond: Number.NEGATIVE_INFINITY,
      lastSignalAt: Number.NEGATIVE_INFINITY,
    };
  };

  const marketStates = Array.from({ length: marketCount }, createMarket);

  // Market weight is 1 / (rank + 1)^0.8 with a shuffled rank, so a few markets run hot.
  const ranks = Array.from({ length: marketCount }, (_, index) => index);
  for (let index = ranks.length - 1; index > 0; index--) {
    const swapIndex = rng.nextInt(0, index);
    const current = itemAt(ranks, index);
    ranks[index] = itemAt(ranks, swapIndex);
    ranks[swapIndex] = current;
  }
  const cumulativeWeights = new Float64Array(marketCount);
  let totalWeight = 0;
  ranks.forEach((rank, index) => {
    totalWeight += 1 / (rank + 1) ** HOT_MARKET_EXPONENT;
    cumulativeWeights[index] = totalWeight;
  });

  const pickMarket = (): number => {
    const target = rng.next() * totalWeight;
    let low = 0;
    let high = marketCount - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((cumulativeWeights[middle] ?? 0) > target) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return low;
  };

  const step = (ts: number, out: ServerMessage[]): void => {
    if (!Number.isFinite(ts)) {
      throw new RangeError(`Invalid timestamp: ${ts}`);
    }
    const second = Math.floor(ts / 1000);
    if (Number.isNaN(firstSecond)) {
      firstSecond = second;
    }

    const m = pickMarket();
    const x = rng.nextInt(0, VENUE_COUNT - 1);
    const market = itemAt(marketStates, m);
    const venue = itemAt(market.venues, x);

    recordFairHistory(market, second);
    if (rng.next() < TRADE_SHARE) {
      trade(m, x, venue, ts, out);
    } else {
      updateBook(market, venue, ts);
    }
    emitDelta(m, x, venue, ts, out);
    emitSignal(m, market, ts, second, out);
  };

  const snapshot = (m: number, x: number, ts: number): SnapshotMessage => {
    const venue = itemAt(itemAt(marketStates, m).venues, x);
    return toSnapshot(venue.book, m, x, ts);
  };

  const skipNextDelta = (m: number, x: number): void => {
    itemAt(itemAt(marketStates, m).venues, x).isNextDeltaDropped = true;
  };

  return { markets: getMarkets(marketCount), snapshot, step, skipNextDelta };
}
