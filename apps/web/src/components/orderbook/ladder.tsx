import { useEffect, useRef } from 'react';

import {
  BOOK_SIDE_ASK,
  BOOK_SIDE_BID,
  LADDER_ROWS,
  ladderIndex,
} from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { cn } from '../../lib/cn.ts';
import {
  formatPlainPrice,
  formatSize,
  formatSpread,
} from '../../lib/format.ts';
import {
  createTextCell,
  writeTextCell,
  type TextCell,
} from '../../lib/text-cell.ts';
import {
  LADDER_COLUMNS,
  LadderLevel,
  bindLadderLevel,
} from './ladder-level.tsx';

const NO_DATA = '—';
const NO_LEVEL = '';

const ROWS = Array.from({ length: LADDER_ROWS }, (_, row) => row);

// scale starts as NaN, so the first write always sets the bar.
interface LevelCells {
  bar: HTMLElement;
  scale: number;
  price: TextCell;
  size: TextCell;
  total: TextCell;
}

// Levels of the list in DOM order.
function bindLevels(list: HTMLElement | null): LevelCells[] | null {
  if (list === null) {
    return null;
  }

  const levels: LevelCells[] = [];

  for (const row of list.children) {
    const elements = bindLadderLevel(row);

    if (elements === null) {
      return null;
    }

    levels.push({
      bar: elements.bar,
      scale: NaN,
      price: createTextCell(elements.price),
      size: createTextCell(elements.size),
      total: createTextCell(elements.total),
    });
  }

  return levels;
}

function writeLevel(
  level: LevelCells,
  price: string,
  size: string,
  total: string,
  scale: number,
): void {
  writeTextCell(level.price, price);
  writeTextCell(level.size, size);
  writeTextCell(level.total, total);

  if (level.scale !== scale) {
    level.bar.style.transform = `scaleX(${scale})`;
    level.scale = scale;
  }
}

// Total is the size accumulated from the best level; the bar shows it
// against the total of the whole side.
function writeSide(
  levels: readonly LevelCells[],
  ladders: Int32Array,
  venue: number,
  side: number,
): void {
  let sideTotal = 0;
  for (const row of ROWS) {
    sideTotal += ladders[ladderIndex(venue, side, row) + 1] ?? 0;
  }

  let total = 0;
  levels.forEach((level, row) => {
    const index = ladderIndex(venue, side, row);
    const price = ladders[index] ?? 0;
    const size = ladders[index + 1] ?? 0;

    if (price <= 0 || size <= 0) {
      writeLevel(level, NO_LEVEL, NO_LEVEL, NO_LEVEL, 0);
      return;
    }

    total += size;
    writeLevel(
      level,
      formatPlainPrice(price),
      formatSize(size),
      formatSize(total),
      total / sideTotal,
    );
  });
}

function writeNoData(levels: readonly LevelCells[]): void {
  for (const level of levels) {
    writeLevel(level, NO_DATA, NO_DATA, NO_DATA, 0);
  }
}

function readSpread(ladders: Int32Array, venue: number): number {
  const askIndex = ladderIndex(venue, BOOK_SIDE_ASK, 0);
  const bidIndex = ladderIndex(venue, BOOK_SIDE_BID, 0);
  const ask = ladders[askIndex] ?? 0;
  const bid = ladders[bidIndex] ?? 0;
  const hasAsk = ask > 0 && (ladders[askIndex + 1] ?? 0) > 0;
  const hasBid = bid > 0 && (ladders[bidIndex + 1] ?? 0) > 0;

  return hasAsk && hasBid ? ask - bid : NaN;
}

interface LadderProps {
  venue: number;
  title: string;
  market: number;
}

// Rows stay in the DOM for good; every frame of the selected market writes
// their text and depth bars. Until a frame of the selected market arrives the
// rows hold dashes.
export function Ladder({ venue, title, market }: LadderProps) {
  const asksRef = useRef<HTMLDivElement>(null);
  const bidsRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const spreadElement = spreadRef.current;
    // Asks are rendered worst first, so the best ask sits right above the
    // spread; the levels are kept best first.
    const asks = bindLevels(asksRef.current)?.reverse() ?? null;
    const bids = bindLevels(bidsRef.current);

    if (!spreadElement || asks === null || bids === null) {
      return;
    }

    const spread = createTextCell(spreadElement);

    const handleSelected = () => {
      const selected = hotStore.getSelected();

      if (selected === null || selected.market !== market) {
        writeNoData(asks);
        writeNoData(bids);
        writeTextCell(spread, NO_DATA);
        return;
      }

      writeSide(asks, selected.ladders, venue, BOOK_SIDE_ASK);
      writeSide(bids, selected.ladders, venue, BOOK_SIDE_BID);
      writeTextCell(spread, formatSpread(readSpread(selected.ladders, venue)));
    };

    handleSelected();

    return hotStore.subscribeTopic('selected', handleSelected);
  }, [venue, market]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-panel">
      <div className="flex h-6 shrink-0 items-center px-2">
        <h3 className="truncate text-[11px] font-medium text-ink">{title}</h3>
      </div>
      <div
        className={cn(
          LADDER_COLUMNS,
          'h-5 shrink-0 border-b border-line text-[10px] text-muted',
        )}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div
        ref={asksRef}
        className="shrink-0 font-mono text-[11px] text-ink tabular-nums"
      >
        {ROWS.map((row) => (
          <LadderLevel key={row} side="ask" />
        ))}
      </div>
      <div className="flex h-5 shrink-0 items-center justify-center gap-1 border-y border-line text-[10px] text-muted">
        Spread
        <span
          ref={spreadRef}
          className="font-mono text-[11px] text-ink tabular-nums"
        >
          —
        </span>
      </div>
      <div
        ref={bidsRef}
        className="shrink-0 font-mono text-[11px] text-ink tabular-nums"
      >
        {ROWS.map((row) => (
          <LadderLevel key={row} side="bid" />
        ))}
      </div>
    </div>
  );
}
