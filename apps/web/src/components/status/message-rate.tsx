import { useEffect, useRef } from 'react';

import { RECEIVED_TOTAL } from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';

const UPDATE_INTERVAL_MS = 1000;

// The rate is divided by the time between the frames themselves, so a pause
// in frames (hidden tab) does not show up as a spike after the return.
export function MessageRate() {
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let previousTotal = -1;
    let previousAt = 0;

    const handleTick = () => {
      const stats = hotStore.getStats();
      const receivedAt = hotStore.getStatsReceivedAt();
      const valueElement = valueRef.current;

      if (stats === null || valueElement === null) {
        return;
      }

      const total = stats[RECEIVED_TOTAL] ?? 0;
      const elapsedMs = receivedAt - previousAt;

      if (previousTotal >= 0 && elapsedMs > 0) {
        const rate = ((total - previousTotal) * 1000) / elapsedMs;
        valueElement.textContent = String(Math.max(0, Math.round(rate)));
      }

      previousTotal = total;
      previousAt = receivedAt;
    };

    const timer = setInterval(handleTick, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <span className="font-mono text-[11px] whitespace-nowrap text-muted tabular-nums">
      IN{' '}
      <span ref={valueRef} className="text-ink">
        —
      </span>{' '}
      msg/s
    </span>
  );
}
