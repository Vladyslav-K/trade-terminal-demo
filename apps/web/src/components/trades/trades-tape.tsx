import { useEffect, useRef } from 'react';

import {
  TRADE_PRICE,
  TRADE_SIDE,
  TRADE_SIDE_BUY,
  TRADE_SIZE,
  TRADE_TS,
  TRADE_VENUE,
} from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { cn } from '../../lib/cn.ts';
import {
  formatClock,
  formatPlainPrice,
  formatSize,
  formatVenue,
} from '../../lib/format.ts';
import {
  createTextCell,
  writeTextCell,
  type TextCell,
} from '../../lib/text-cell.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';
import { TRADE_COLUMNS, TradeRow, bindTradeRow } from './trade-row.tsx';

const POOL_SIZE = 40;
const POOL = Array.from({ length: POOL_SIZE }, (_, index) => index);
// Rows are ordered by CSS order = -sequence, newest on top. Sequences are
// renumbered from 1 before they grow past what CSS order holds reliably.
const SEQUENCE_REBASE_AT = 1_000_000;

// isBuy starts as null, so the first trade always sets the price tone.
interface TradeCells {
  row: HTMLElement;
  isShown: boolean;
  isBuy: boolean | null;
  sequence: number;
  time: TextCell;
  venue: TextCell;
  price: TextCell;
  size: TextCell;
}

function bindRows(list: HTMLElement | null): TradeCells[] | null {
  if (list === null) {
    return null;
  }

  const rows: TradeCells[] = [];

  for (const row of list.children) {
    const elements = bindTradeRow(row);

    if (elements === null) {
      return null;
    }

    rows.push({
      row: elements.row,
      isShown: !elements.row.hidden,
      isBuy: null,
      sequence: 0,
      time: createTextCell(elements.time),
      venue: createTextCell(elements.venue),
      price: createTextCell(elements.price),
      size: createTextCell(elements.size),
    });
  }

  return rows;
}

function setShown(cells: TradeCells, isShown: boolean): void {
  if (cells.isShown !== isShown) {
    cells.row.hidden = !isShown;
    cells.isShown = isShown;
  }
}

function setSequence(cells: TradeCells, sequence: number): void {
  cells.sequence = sequence;
  cells.row.style.order = String(-sequence);
}

// A fixed pool of rows: a new trade overwrites the oldest row and moves it to
// the top through CSS order, so no DOM node is created or removed per trade.
export function TradesTape() {
  const listRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const emptyElement = emptyRef.current;
    const rows = bindRows(listRef.current);

    if (!emptyElement || rows === null) {
      return;
    }

    const { trades } = hotStore;
    let cursor = 0;
    let head = 0;
    let sequence = 0;
    let isEmptyShown = !emptyElement.hidden;

    const setEmptyShown = (isShown: boolean) => {
      if (isEmptyShown !== isShown) {
        emptyElement.hidden = !isShown;
        isEmptyShown = isShown;
      }
    };

    const rebase = () => {
      const shift = sequence - POOL_SIZE;
      for (const cells of rows) {
        setSequence(cells, cells.sequence - shift);
      }
      sequence -= shift;
    };

    const writeTrade = (index: number) => {
      const cells = rows[head];
      if (!cells) {
        return;
      }
      if (sequence >= SEQUENCE_REBASE_AT) {
        rebase();
      }

      writeTextCell(cells.time, formatClock(trades.get(index, TRADE_TS)));
      writeTextCell(cells.venue, formatVenue(trades.get(index, TRADE_VENUE)));
      writeTextCell(
        cells.price,
        formatPlainPrice(trades.get(index, TRADE_PRICE)),
      );
      writeTextCell(cells.size, formatSize(trades.get(index, TRADE_SIZE)));

      const isBuy = trades.get(index, TRADE_SIDE) === TRADE_SIDE_BUY;
      if (cells.isBuy !== isBuy) {
        cells.price.element.classList.toggle('text-bid', isBuy);
        cells.price.element.classList.toggle('text-ask', !isBuy);
        cells.isBuy = isBuy;
      }

      sequence += 1;
      setSequence(cells, sequence);
      setShown(cells, true);
      head = (head + 1) % POOL_SIZE;
    };

    const handleTrades = () => {
      const end = trades.getEnd();
      const from = Math.max(cursor, trades.getFirst(), end - POOL_SIZE);
      for (let index = from; index < end; index++) {
        writeTrade(index);
      }
      cursor = end;
      setEmptyShown(sequence === 0);
    };

    // A new market or market list replaces the whole queue.
    const handleHistory = () => {
      for (const cells of rows) {
        setShown(cells, false);
      }
      head = 0;
      sequence = 0;
      cursor = trades.getFirst();
      handleTrades();
    };

    handleHistory();

    const unsubscribeTrades = hotStore.subscribeTopic('trades', handleTrades);
    const unsubscribeHistory = hotStore.subscribeTopic(
      'history',
      handleHistory,
    );

    return () => {
      unsubscribeTrades();
      unsubscribeHistory();
    };
  }, []);

  return (
    <Panel title="Trades">
      <div className="flex h-full flex-col">
        <div
          className={cn(
            TRADE_COLUMNS,
            'h-5 shrink-0 border-b border-line text-[10px] text-muted',
          )}
        >
          <span>Time</span>
          <span className="text-center">Venue</span>
          <span className="text-right">Price</span>
          <span className="text-right">Size</span>
        </div>
        <div className="relative min-h-0 flex-1">
          <div
            ref={listRef}
            className="flex flex-col font-mono text-[11px] text-ink tabular-nums"
          >
            {POOL.map((index) => (
              <TradeRow key={index} />
            ))}
          </div>
          <div ref={emptyRef} className="absolute inset-0">
            <EmptyState>No trades yet</EmptyState>
          </div>
        </div>
      </div>
    </Panel>
  );
}
