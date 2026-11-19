import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';

import { ROW_PROB, ROW_SHIFT, ROW_VOLUME } from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { getEdge } from '../../feed/market-quotes.ts';
import { useIsStale } from '../../hooks/use-stale-state.ts';
import { cn } from '../../lib/cn.ts';
import { useAppStore, type SortKey } from '../../stores/app-store.ts';
import { StaleOverlay } from '../status/stale-overlay.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';
import { Segmented, type SegmentedOption } from '../ui/segmented.tsx';
import { MARKET_COLUMNS, MarketRow } from './market-row.tsx';

const ROW_HEIGHT = 24;
const OVERSCAN = 6;
const ORDER_INTERVAL_MS = 1000;

const SORT_OPTIONS: readonly SegmentedOption<SortKey>[] = [
  { value: 'edge', label: 'Edge' },
  { value: 'prob', label: 'Prob' },
  { value: 'shift', label: 'Shift' },
  { value: 'volume', label: 'Vol' },
];

// The header and the list both reserve the scrollbar gutter, so their
// columns stay aligned whether the scrollbar takes space or overlays.
const GUTTER = 'overflow-y-hidden [scrollbar-gutter:stable]';

interface RowOrder {
  sortKey: SortKey;
  marketCount: number;
  markets: number[];
}

function readSortValue(market: number, sortKey: SortKey): number {
  switch (sortKey) {
    case 'edge':
      return getEdge(market);
    case 'prob':
      return hotStore.getRowValue(market, ROW_PROB);
    case 'shift':
      return hotStore.getRowValue(market, ROW_SHIFT);
    case 'volume':
      return hotStore.getRowValue(market, ROW_VOLUME);
  }
}

// Descending by value; markets without a value go last, ties keep the
// market list order.
function createOrder(sortKey: SortKey, marketCount: number): RowOrder {
  const values = new Float64Array(marketCount);
  const markets: number[] = [];

  for (let market = 0; market < marketCount; market++) {
    values[market] = readSortValue(market, sortKey);
    markets.push(market);
  }

  markets.sort((a, b) => {
    const valueA = values[a] ?? NaN;
    const valueB = values[b] ?? NaN;
    const hasA = Number.isFinite(valueA);
    const hasB = Number.isFinite(valueB);

    if (hasA !== hasB) {
      return hasA ? -1 : 1;
    }
    if (hasA && valueA !== valueB) {
      return valueB - valueA;
    }
    return a - b;
  });

  return { sortKey, marketCount, markets };
}

function pickOrder(current: RowOrder, next: RowOrder): RowOrder {
  const isSame =
    current.sortKey === next.sortKey &&
    current.marketCount === next.marketCount &&
    current.markets.every((market, index) => market === next.markets[index]);

  return isSame ? current : next;
}

export function MarketsTable() {
  const markets = useAppStore((state) => state.markets);
  const selectedMarket = useAppStore((state) => state.selectedMarket);
  const sortKey = useAppStore((state) => state.sortKey);
  const setSortKey = useAppStore((state) => state.setSortKey);
  const selectMarket = useAppStore((state) => state.selectMarket);
  const isStale = useIsStale();
  const marketCount = markets.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isFrozenRef = useRef(false);
  const [order, setOrder] = useState(() => createOrder(sortKey, marketCount));

  // A new sort key or market list is applied at once, even while the order
  // is frozen under the pointer.
  let rowOrder = order;
  if (order.sortKey !== sortKey || order.marketCount !== marketCount) {
    rowOrder = createOrder(sortKey, marketCount);
    setOrder(rowOrder);
  }

  const virtualizer = useVirtualizer({
    count: rowOrder.markets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isFrozenRef.current) {
        const next = createOrder(sortKey, marketCount);
        setOrder((current) => pickOrder(current, next));
      }
    }, ORDER_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [sortKey, marketCount]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [marketCount]);

  const handlePointerEnter = () => {
    isFrozenRef.current = true;
  };

  const handlePointerLeave = () => {
    isFrozenRef.current = false;
    const next = createOrder(sortKey, marketCount);
    setOrder((current) => pickOrder(current, next));
  };

  return (
    <Panel
      title="Markets"
      overlay={isStale && <StaleOverlay />}
      actions={
        <Segmented
          options={SORT_OPTIONS}
          value={sortKey}
          onChange={setSortKey}
          label="Sort markets by"
        />
      }
    >
      {marketCount === 0 ? (
        <EmptyState>Waiting for market list…</EmptyState>
      ) : (
        <div
          className="flex h-full flex-col"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <div
            className={cn(
              MARKET_COLUMNS,
              GUTTER,
              'h-[22px] shrink-0 border-b border-line text-[10px] text-muted',
            )}
          >
            <span>Market</span>
            <span className="text-right">Prob</span>
            <span className="text-right">60s</span>
            <span className="text-right">Bid</span>
            <span className="text-right">Ask</span>
            <span className="text-right">Edge</span>
            <span className="text-right">Trend</span>
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          >
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const market = rowOrder.markets[item.index];

                if (market === undefined) {
                  return null;
                }

                return (
                  <MarketRow
                    key={market}
                    market={market}
                    title={markets[market]?.title ?? ''}
                    offset={item.start}
                    isSelected={market === selectedMarket}
                    onSelect={selectMarket}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
