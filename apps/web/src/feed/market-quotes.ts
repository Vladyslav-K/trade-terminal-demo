import {
  ROW_ASK_A,
  ROW_ASK_B,
  ROW_BID_A,
  ROW_BID_B,
  ROW_EDGE,
} from './frame-layout.ts';
import { hotStore } from './hot-store.ts';

function pickBest(
  a: number,
  b: number,
  pick: (a: number, b: number) => number,
): number {
  if (Number.isNaN(a)) {
    return b;
  }
  return Number.isNaN(b) ? a : pick(a, b);
}

export function getBestBid(market: number): number {
  return pickBest(
    hotStore.getRowValue(market, ROW_BID_A),
    hotStore.getRowValue(market, ROW_BID_B),
    Math.max,
  );
}

export function getBestAsk(market: number): number {
  return pickBest(
    hotStore.getRowValue(market, ROW_ASK_A),
    hotStore.getRowValue(market, ROW_ASK_B),
    Math.min,
  );
}

// Without asks on one venue and bids on the other the row holds an edge of 0,
// which means no data.
export function getEdge(market: number): number {
  const bidA = hotStore.getRowValue(market, ROW_BID_A);
  const askA = hotStore.getRowValue(market, ROW_ASK_A);
  const bidB = hotStore.getRowValue(market, ROW_BID_B);
  const askB = hotStore.getRowValue(market, ROW_ASK_B);
  const hasEdge =
    (Number.isFinite(askA) && Number.isFinite(bidB)) ||
    (Number.isFinite(askB) && Number.isFinite(bidA));

  return hasEdge ? hotStore.getRowValue(market, ROW_EDGE) : NaN;
}
