import { VENUE_COUNT } from '@trade-terminal/protocol';

import { useIsStale } from '../../hooks/use-stale-state.ts';
import { formatVenue } from '../../lib/format.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { StaleOverlay } from '../status/stale-overlay.tsx';
import { Panel } from '../ui/panel.tsx';
import { Ladder } from './ladder.tsx';

const VENUES = Array.from({ length: VENUE_COUNT }, (_, venue) => venue);

export function OrderBook() {
  const venues = useAppStore((state) => state.venues);
  const selectedMarket = useAppStore((state) => state.selectedMarket);
  const isStale = useIsStale();

  return (
    <Panel title="Order Book" overlay={isStale && <StaleOverlay />}>
      <div className="grid h-full grid-cols-2 gap-px bg-line">
        {VENUES.map((venue) => (
          <Ladder
            key={venue}
            venue={venue}
            market={selectedMarket}
            title={`${venues[venue]?.name ?? '—'} (${formatVenue(venue)})`}
          />
        ))}
      </div>
    </Panel>
  );
}
