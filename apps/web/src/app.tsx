import { DepthChart } from './components/charts/depth-chart.tsx';
import { PriceChart } from './components/charts/price-chart.tsx';
import { BenchmarkPanel } from './components/controls/benchmark-panel.tsx';
import { FaultControls } from './components/controls/fault-controls.tsx';
import { LoadControls } from './components/controls/load-controls.tsx';
import { TerminalLayout } from './components/layout/terminal-layout.tsx';
import { TopBar } from './components/layout/top-bar.tsx';
import { MarketsTable } from './components/markets/markets-table.tsx';
import { OrderBook } from './components/orderbook/order-book.tsx';
import { PerfHud } from './components/perf/perf-hud.tsx';
import { SignalsFeed } from './components/signals/signals-feed.tsx';
import { EventLog } from './components/status/event-log.tsx';
import { TradesTape } from './components/trades/trades-tape.tsx';

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
          <FaultControls />
          <BenchmarkPanel />
          <EventLog />
        </>
      }
    />
  );
}
