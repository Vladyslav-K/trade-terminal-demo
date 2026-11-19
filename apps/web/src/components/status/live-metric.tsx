import { useEffect, useRef } from 'react';

import { formatMeasure } from '../../lib/format.ts';
import { createTextCell, writeTextCell } from '../../lib/text-cell.ts';
import { perfMonitor } from '../../perf/perf-monitor.ts';

export type LiveMetricKey = 'in' | 'fps' | 'toScreenP95';

interface LiveMetricProps {
  label: string;
  metric: LiveMetricKey;
  unit?: string;
}

// The value is written straight into the DOM once per second.
export function LiveMetric({ label, metric, unit }: LiveMetricProps) {
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = valueRef.current;
    if (!element) {
      return;
    }
    const cell = createTextCell(element);

    const handleSecond = () => {
      writeTextCell(cell, formatMeasure(perfMonitor.getSnapshot()[metric]));
    };

    handleSecond();

    return perfMonitor.subscribe(handleSecond);
  }, [metric]);

  return (
    <span className="font-mono text-[11px] whitespace-nowrap text-muted tabular-nums">
      {label}{' '}
      <span ref={valueRef} className="text-ink">
        —
      </span>
      {unit && ` ${unit}`}
    </span>
  );
}
