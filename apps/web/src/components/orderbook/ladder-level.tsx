import { cn } from '../../lib/cn.ts';

export type LadderSide = 'bid' | 'ask';

export const LADDER_COLUMNS = 'grid grid-cols-3 items-center px-2';

export interface LadderLevelElements {
  bar: HTMLElement;
  price: HTMLElement;
  size: HTMLElement;
  total: HTMLElement;
}

// Reads the parts of a row rendered by LadderLevel, in its markup order.
export function bindLadderLevel(row: Element): LadderLevelElements | null {
  const [bar, price, size, total] = row.children;

  if (
    !(bar instanceof HTMLElement) ||
    !(price instanceof HTMLElement) ||
    !(size instanceof HTMLElement) ||
    !(total instanceof HTMLElement)
  ) {
    return null;
  }

  return { bar, price, size, total };
}

interface LadderLevelProps {
  side: LadderSide;
}

// A pooled row: the ladder writes its text and the depth bar transform
// directly, so the rendered content is only the state before the first frame.
export function LadderLevel({ side }: LadderLevelProps) {
  const isBid = side === 'bid';

  return (
    <div className={cn(LADDER_COLUMNS, 'relative h-4')}>
      <span
        className={cn(
          'absolute inset-0 origin-right [transform:scaleX(0)]',
          isBid ? 'bg-bid/15' : 'bg-ask/15',
        )}
      />
      <span className={cn('relative', isBid ? 'text-bid' : 'text-ask')}>—</span>
      <span className="relative text-right">—</span>
      <span className="relative text-right">—</span>
    </div>
  );
}
