import { cn } from '../../lib/cn.ts';

export const TRADE_COLUMNS =
  'grid grid-cols-[60px_36px_minmax(0,1fr)_minmax(0,1fr)] items-center px-2';

export interface TradeRowElements {
  row: HTMLElement;
  time: HTMLElement;
  venue: HTMLElement;
  price: HTMLElement;
  size: HTMLElement;
}

// Reads the cells of a row rendered by TradeRow, in its markup order.
export function bindTradeRow(row: Element): TradeRowElements | null {
  const [time, venue, price, size] = row.children;

  if (
    !(row instanceof HTMLElement) ||
    !(time instanceof HTMLElement) ||
    !(venue instanceof HTMLElement) ||
    !(price instanceof HTMLElement) ||
    !(size instanceof HTMLElement)
  ) {
    return null;
  }

  return { row, time, venue, price, size };
}

// A pooled row: the tape writes its text, price tone, hidden flag and CSS
// order directly, so the row renders once and never re-renders.
export function TradeRow() {
  return (
    <div hidden className={cn(TRADE_COLUMNS, 'h-4 shrink-0')}>
      <span className="text-muted" />
      <span className="text-center" />
      <span className="text-right" />
      <span className="text-right" />
    </div>
  );
}
