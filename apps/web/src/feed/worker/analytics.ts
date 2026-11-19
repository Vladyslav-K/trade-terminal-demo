import {
  PRICE_MAX,
  PRICE_MIN,
  PRICE_TICKS,
  VENUE_COUNT,
} from '@trade-terminal/protocol';

import {
  ROW_ASK_A,
  ROW_ASK_B,
  ROW_BID_A,
  ROW_BID_B,
  ROW_EDGE,
  ROW_EDGE_DIR,
  ROW_EDGE_SIZE,
  ROW_LAST_TS,
  ROW_MARKET,
  ROW_PROB,
  ROW_SHIFT,
  ROW_VOLUME,
} from '../frame-layout.ts';
import { asks, bestAsk, bestBid, bids, bookIndex } from './books.ts';
import { getMinuteAgoPrice, lastTs, volume } from './history.ts';

const VENUE_A = 0;
const VENUE_B = 1;

interface EdgeEstimate {
  edge: number;
  size: number;
}

const estimate: EdgeEstimate = { edge: 0, size: 0 };

function priceOrNaN(price: number | undefined): number {
  return price !== undefined && price > 0 ? price : NaN;
}

// Midpoint between the best bid and the best ask across venues; NaN while
// either side is empty on every venue.
export function computeProb(m: number): number {
  let bid = 0;
  let ask = 0;
  for (let x = 0; x < VENUE_COUNT; x++) {
    const book = bookIndex(m, x);
    const venueBid = bestBid[book] ?? 0;
    const venueAsk = bestAsk[book] ?? 0;
    if (venueBid > bid) {
      bid = venueBid;
    }
    if (venueAsk > 0 && (ask === 0 || venueAsk < ask)) {
      ask = venueAsk;
    }
  }
  return bid > 0 && ask > 0 ? (bid + ask) / 2 : NaN;
}

// Buys up to notional contracts from the asks of buyBook while selling the
// same amount into the bids of sellBook, best levels first. edge is the sell
// VWAP minus the buy VWAP on the filled amount; size is the part filled while
// the bid price stays above the ask price. Returns false when nothing fills.
function estimateEdge(
  buyBook: number,
  sellBook: number,
  notional: number,
): boolean {
  let askPrice = bestAsk[buyBook] ?? 0;
  let bidPrice = bestBid[sellBook] ?? 0;
  if (askPrice === 0 || bidPrice === 0 || notional <= 0) {
    return false;
  }

  const askBase = buyBook * PRICE_TICKS;
  const bidBase = sellBook * PRICE_TICKS;
  let askLeft = asks[askBase + askPrice] ?? 0;
  let bidLeft = bids[bidBase + bidPrice] ?? 0;
  let filled = 0;
  let cost = 0;
  let proceeds = 0;
  let profitable = 0;

  while (filled < notional) {
    const size = Math.min(askLeft, bidLeft, notional - filled);
    filled += size;
    cost += size * askPrice;
    proceeds += size * bidPrice;
    if (bidPrice > askPrice) {
      profitable += size;
    }
    askLeft -= size;
    bidLeft -= size;

    if (askLeft === 0) {
      askPrice += 1;
      while (askPrice <= PRICE_MAX && (asks[askBase + askPrice] ?? 0) === 0) {
        askPrice += 1;
      }
      if (askPrice > PRICE_MAX) {
        break;
      }
      askLeft = asks[askBase + askPrice] ?? 0;
    }
    if (bidLeft === 0) {
      bidPrice -= 1;
      while (bidPrice >= PRICE_MIN && (bids[bidBase + bidPrice] ?? 0) === 0) {
        bidPrice -= 1;
      }
      if (bidPrice < PRICE_MIN) {
        break;
      }
      bidLeft = bids[bidBase + bidPrice] ?? 0;
    }
  }

  if (filled === 0) {
    return false;
  }
  estimate.edge = (proceeds - cost) / filled;
  estimate.size = profitable;
  return true;
}

// Writes the row of market m at offset and returns its prob.
export function writeMarketRow(
  m: number,
  notional: number,
  row: Float64Array,
  offset: number,
): number {
  const bookA = bookIndex(m, VENUE_A);
  const bookB = bookIndex(m, VENUE_B);
  const prob = computeProb(m);

  let edge = 0;
  let edgeSize = 0;
  let edgeDir = 0;
  let hasEdge = false;
  for (let buy = 0; buy < VENUE_COUNT; buy++) {
    for (let sell = 0; sell < VENUE_COUNT; sell++) {
      if (
        buy !== sell &&
        estimateEdge(bookIndex(m, buy), bookIndex(m, sell), notional) &&
        (!hasEdge || estimate.edge > edge)
      ) {
        edge = estimate.edge;
        edgeSize = estimate.size;
        edgeDir = buy;
        hasEdge = true;
      }
    }
  }

  row[offset + ROW_MARKET] = m;
  row[offset + ROW_BID_A] = priceOrNaN(bestBid[bookA]);
  row[offset + ROW_ASK_A] = priceOrNaN(bestAsk[bookA]);
  row[offset + ROW_BID_B] = priceOrNaN(bestBid[bookB]);
  row[offset + ROW_ASK_B] = priceOrNaN(bestAsk[bookB]);
  row[offset + ROW_PROB] = prob;
  row[offset + ROW_SHIFT] = prob - getMinuteAgoPrice(m);
  row[offset + ROW_EDGE] = edge;
  row[offset + ROW_EDGE_SIZE] = edgeSize;
  row[offset + ROW_EDGE_DIR] = edgeDir;
  row[offset + ROW_VOLUME] = volume[m] ?? 0;
  row[offset + ROW_LAST_TS] = lastTs[m] ?? 0;
  return prob;
}
