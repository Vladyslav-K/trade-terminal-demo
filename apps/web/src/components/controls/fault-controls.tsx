import { Fragment, useEffect, useRef } from 'react';

import { injectFault } from '../../feed/feed-client.ts';
import { GAPS, RECONNECTS, RESYNCS } from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { formatMeasure } from '../../lib/format.ts';
import { createTextCell, writeTextCell } from '../../lib/text-cell.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { useBenchmarkStore } from '../../stores/benchmark-store.ts';
import { Button } from '../ui/button.tsx';
import { Panel } from '../ui/panel.tsx';

const UPDATE_INTERVAL_MS = 500;

interface FaultCounter {
  label: string;
  field: number;
}

const COUNTERS: readonly FaultCounter[] = [
  { label: 'Gaps', field: GAPS },
  { label: 'Resyncs', field: RESYNCS },
  { label: 'Reconnects', field: RECONNECTS },
];

// Counter values are written straight into the DOM on a timer.
export function FaultControls() {
  const isLive = useAppStore((state) => state.connection.state === 'live');
  const isBenchmarkRunning = useBenchmarkStore(
    (state) => state.status === 'running',
  );
  const isDisabled = !isLive || isBenchmarkRunning;
  const valueRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const cells = COUNTERS.map((_, index) => {
      const element = valueRefs.current[index];
      return element ? createTextCell(element) : null;
    });

    const handleTick = () => {
      const stats = hotStore.getStats();
      COUNTERS.forEach((counter, index) => {
        const cell = cells[index];
        if (cell) {
          writeTextCell(cell, formatMeasure(stats?.[counter.field] ?? 0));
        }
      });
    };

    handleTick();
    const timer = setInterval(handleTick, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const handleDrop = () => injectFault('drop');
  const handleDisconnect = () => injectFault('disconnect');
  const handleStall = () => injectFault('stall');

  return (
    <Panel title="Fault injection" className="h-[140px] shrink-0">
      <div className="flex flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            className="col-span-2"
            isDisabled={isDisabled}
            onClick={handleDrop}
          >
            Drop a delta
          </Button>
          <Button isDisabled={isDisabled} onClick={handleDisconnect}>
            Disconnect
          </Button>
          <Button isDisabled={isDisabled} onClick={handleStall}>
            Stall 10s
          </Button>
        </div>
        <p className="truncate text-[11px] text-muted tabular-nums">
          {COUNTERS.map((counter, index) => (
            <Fragment key={counter.label}>
              {index > 0 && ' · '}
              {counter.label}{' '}
              <span
                ref={(element) => {
                  valueRefs.current[index] = element;
                }}
                className="text-ink"
              >
                0
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </Panel>
  );
}
