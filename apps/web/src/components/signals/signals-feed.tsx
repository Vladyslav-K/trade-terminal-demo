import { useEffect, useState } from 'react';

import {
  SIGNAL_A,
  SIGNAL_B,
  SIGNAL_KIND,
  SIGNAL_MARKET,
  SIGNAL_TS,
  SIGNAL_VALUE,
} from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';
import { SignalItem, type SignalView } from './signal-item.tsx';

const REFRESH_INTERVAL_MS = 250;
const FEED_LIMIT = 50;

interface SignalsSnapshot {
  version: number;
  signals: SignalView[];
}

// The newest FEED_LIMIT signals, newest first.
function readSnapshot(): SignalsSnapshot {
  const queue = hotStore.signals;
  const end = queue.getEnd();
  const first = Math.max(queue.getFirst(), end - FEED_LIMIT);
  const signals: SignalView[] = [];

  for (let record = end - 1; record >= first; record--) {
    signals.push({
      record,
      market: queue.get(record, SIGNAL_MARKET),
      ts: queue.get(record, SIGNAL_TS),
      kind: queue.get(record, SIGNAL_KIND),
      a: queue.get(record, SIGNAL_A),
      b: queue.get(record, SIGNAL_B),
      value: queue.get(record, SIGNAL_VALUE),
    });
  }

  return { version: hotStore.getTopicVersion('signals'), signals };
}

// The only stream panel rendered by React: signals are rare, so the list is
// re-read on a timer and rendered at most 4 times per second.
export function SignalsFeed() {
  const markets = useAppStore((state) => state.markets);
  const selectMarket = useAppStore((state) => state.selectMarket);
  const [snapshot, setSnapshot] = useState(readSnapshot);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot((current) =>
        current.version === hotStore.getTopicVersion('signals')
          ? current
          : readSnapshot(),
      );
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <Panel title="Signals">
      {snapshot.signals.length === 0 ? (
        <EmptyState>No signals yet</EmptyState>
      ) : (
        <div className="h-full overflow-y-auto">
          {snapshot.signals.map((signal) => (
            <SignalItem
              key={signal.record}
              signal={signal}
              title={markets[signal.market]?.title ?? '—'}
              onSelect={selectMarket}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
