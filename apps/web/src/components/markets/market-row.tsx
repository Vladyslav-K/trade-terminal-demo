import { memo } from 'react';

import { useRowBinding } from '../../hooks/use-row-binding.ts';
import { cn } from '../../lib/cn.ts';
import { Sparkline } from './sparkline.tsx';

export const MARKET_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_46px_46px_38px_38px_48px_64px] items-center px-2';

const NUMBER_CELL = 'text-right font-mono tabular-nums';

interface MarketRowProps {
  market: number;
  title: string;
  offset: number;
  isSelected: boolean;
  onSelect: (market: number) => void;
}

// useRowBinding writes the text and the tone and flash classes of the numeric
// cells, so their className must stay constant between renders.
export const MarketRow = memo(function MarketRow({
  market,
  title,
  offset,
  isSelected,
  onSelect,
}: MarketRowProps) {
  const { probRef, shiftRef, bidRef, askRef, edgeRef } = useRowBinding(market);

  const handleClick = () => {
    onSelect(market);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ transform: `translateY(${offset}px)` }}
      className={cn(
        MARKET_COLUMNS,
        'absolute top-0 left-0 h-6 w-full text-left text-[11px] text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        isSelected
          ? 'bg-panel-raised before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent'
          : 'hover:bg-panel-raised/50',
      )}
    >
      <span className="truncate pr-1" title={title}>
        {title}
      </span>
      <span ref={probRef} className={NUMBER_CELL}>
        —
      </span>
      <span ref={shiftRef} className={cn(NUMBER_CELL, 'text-muted')}>
        —
      </span>
      <span ref={bidRef} className={NUMBER_CELL}>
        —
      </span>
      <span ref={askRef} className={NUMBER_CELL}>
        —
      </span>
      <span ref={edgeRef} className={cn(NUMBER_CELL, 'text-muted')}>
        —
      </span>
      <span className="flex justify-end">
        <Sparkline market={market} />
      </span>
    </button>
  );
});
