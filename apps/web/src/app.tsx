import { TerminalLayout } from './components/layout/terminal-layout.tsx';
import { TopBar } from './components/layout/top-bar.tsx';
import { MarketsTable } from './components/markets/markets-table.tsx';
import { OrderBook } from './components/orderbook/order-book.tsx';
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
      priceChart={
        <Panel title="Probability">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
      depthChart={
        <Panel title="Depth (both venues)">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
      orderBook={<OrderBook />}
      trades={<TradesTape />}
      signals={<SignalsFeed />}
      sidebar={
        <>
          <Panel title="Performance" className="h-[360px] shrink-0">
            <EmptyState>{WAITING_TEXT}</EmptyState>
          </Panel>
          <Panel title="Load" className="h-[200px] shrink-0">
            <EmptyState>{WAITING_TEXT}</EmptyState>
          </Panel>
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
