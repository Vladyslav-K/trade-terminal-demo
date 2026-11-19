import type { ReactNode } from 'react';

interface TerminalLayoutProps {
  topBar: ReactNode;
  markets: ReactNode;
  priceChart: ReactNode;
  depthChart: ReactNode;
  orderBook: ReactNode;
  trades: ReactNode;
  signals: ReactNode;
  sidebar: ReactNode;
}

export function TerminalLayout({
  topBar,
  markets,
  priceChart,
  depthChart,
  orderBook,
  trades,
  signals,
  sidebar,
}: TerminalLayoutProps) {
  return (
    <div className="grid h-full min-h-[800px] min-w-[1440px] grid-cols-[400px_minmax(360px,1fr)_380px_280px] grid-rows-[44px_minmax(0,1fr)_280px] gap-px bg-line">
      <div className="col-span-full row-start-1 grid min-w-0">{topBar}</div>
      <div className="col-start-1 row-start-2 row-end-4 grid min-h-0 min-w-0">
        {markets}
      </div>
      <div className="col-start-2 row-start-2 grid min-h-0 min-w-0">
        {priceChart}
      </div>
      <div className="col-start-2 row-start-3 grid min-h-0 min-w-0">
        {depthChart}
      </div>
      <div className="col-start-3 row-start-2 grid min-h-0 min-w-0">
        {orderBook}
      </div>
      <div className="col-start-3 row-start-3 grid min-h-0 min-w-0 grid-cols-2 gap-px">
        {trades}
        {signals}
      </div>
      <div className="col-start-4 row-start-2 row-end-4 flex min-h-0 min-w-0 flex-col gap-px overflow-y-auto">
        {sidebar}
      </div>
    </div>
  );
}
