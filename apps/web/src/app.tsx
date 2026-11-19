import { TerminalLayout } from './components/layout/terminal-layout.tsx';
import { TopBar } from './components/layout/top-bar.tsx';
import { EmptyState } from './components/ui/empty-state.tsx';
import { Panel } from './components/ui/panel.tsx';

const WAITING_TEXT = 'Waiting for data…';

export function App() {
  return (
    <TerminalLayout
      topBar={<TopBar />}
      markets={
        <Panel title="Markets">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
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
      orderBook={
        <Panel title="Order Book">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
      trades={
        <Panel title="Trades">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
      signals={
        <Panel title="Signals">
          <EmptyState>{WAITING_TEXT}</EmptyState>
        </Panel>
      }
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
