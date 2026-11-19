import { DepthChart } from './components/charts/depth-chart.tsx';
import { PriceChart } from './components/charts/price-chart.tsx';
import { LoadControls } from './components/controls/load-controls.tsx';
import { TerminalLayout } from './components/layout/terminal-layout.tsx';
import { TopBar } from './components/layout/top-bar.tsx';
import { MarketsTable } from './components/markets/markets-table.tsx';
import { OrderBook } from './components/orderbook/order-book.tsx';
import { PerfHud } from './components/perf/perf-hud.tsx';
import { SignalsFeed } from './components/signals/signals-feed.tsx';
import { TradesTape } from './components/trades/trades-tape.tsx';
import { EmptyState } from './components/ui/empty-state.tsx';
import { Panel } from './components/ui/panel.tsx';

const WAITING_TEXT = 'Waiting for data…';

export function App() {
  return (
    <TerminalLayout
      topBar={<TopBar />}
      markets={<MarketsTable />}
      priceChart={<PriceChart />}
      depthChart={<DepthChart />}
      orderBook={<OrderBook />}
      trades={<TradesTape />}
      signals={<SignalsFeed />}
      sidebar={
        <>
          <PerfHud />
          <LoadControls />
          <Panel title="Fault injection" className="h-[120px] shrink-0">
            <EmptyState>{WAITING_TEXT}</EmptyState>
          </Panel>
          <Panel title="Benchmark" className="h-[120px] shrink-0">
            <EmptyState>{WAITING_TEXT}</EmptyState>
          </Panel>
          <Panel title="Event log" className="min-h-[240px] flex-1">
            <EmptyState>{WAITING_TEXT}</EmptyState>
          </Panel>
        </>
      }
    />
  );
}
