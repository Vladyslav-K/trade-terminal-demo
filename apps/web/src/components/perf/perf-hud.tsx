import { useEffect, useRef } from 'react';

import { NOT_AVAILABLE, formatMeasure } from '../../lib/format.ts';
import {
  createTextCell,
  writeTextCell,
  type TextCell,
} from '../../lib/text-cell.ts';
import { perfMonitor, type PerfSnapshot } from '../../perf/perf-monitor.ts';
import { Panel } from '../ui/panel.tsx';
import { Stat } from '../ui/stat.tsx';
import { MetricChart } from './metric-chart.tsx';

const UPDATE_INTERVAL_MS = 500;
const BYTES_PER_MB = 1024 * 1024;
const FPS_BAD = 30;
const FPS_LOW = 50;
const SCREEN_LATENCY_SLOW_MS = 100;
const SCREEN_LATENCY_BAD_MS = 1000;

const TONES = ['text-ink', 'text-bid', 'text-warn', 'text-ask'] as const;

type Tone = (typeof TONES)[number];

interface PerfTile {
  label: string;
  format: (snapshot: PerfSnapshot) => string;
  tone?: (snapshot: PerfSnapshot) => Tone;
}

interface TileCell {
  text: TextCell;
  tone: Tone;
}

function formatOptional(value: number | null, unit: string): string {
  return value === null ? NOT_AVAILABLE : formatMeasure(value, unit);
}

function formatLongTasks(snapshot: PerfSnapshot): string {
  const { longTaskCount, longTaskMs } = snapshot;
  if (longTaskCount === null || longTaskMs === null) {
    return NOT_AVAILABLE;
  }
  if (!Number.isFinite(longTaskCount)) {
    return formatMeasure(longTaskCount);
  }
  return `${formatMeasure(longTaskCount)} / ${formatMeasure(longTaskMs, ' ms')}`;
}

function formatHeap(snapshot: PerfSnapshot): string {
  const { heapBytes } = snapshot;
  return formatOptional(
    heapBytes === null ? null : heapBytes / BYTES_PER_MB,
    ' MB',
  );
}

function formatIntegrity(snapshot: PerfSnapshot): string {
  const { crossed } = snapshot;
  if (!Number.isFinite(crossed)) {
    return formatMeasure(crossed);
  }
  return crossed === 0 ? 'OK' : `${formatMeasure(crossed)} crossed`;
}

function toneOfFps(snapshot: PerfSnapshot): Tone {
  const { fps } = snapshot;
  if (fps < FPS_BAD) {
    return 'text-ask';
  }
  return fps < FPS_LOW ? 'text-warn' : 'text-ink';
}

function toneOfScreenLatency(snapshot: PerfSnapshot): Tone {
  const { toScreenP95 } = snapshot;
  if (toScreenP95 > SCREEN_LATENCY_BAD_MS) {
    return 'text-ask';
  }
  return toScreenP95 > SCREEN_LATENCY_SLOW_MS ? 'text-warn' : 'text-ink';
}

function toneOfIntegrity(snapshot: PerfSnapshot): Tone {
  const { crossed } = snapshot;
  if (!Number.isFinite(crossed)) {
    return 'text-ink';
  }
  return crossed === 0 ? 'text-bid' : 'text-ask';
}

// Two columns, filled row by row.
const PERF_TILES: readonly PerfTile[] = [
  {
    label: 'FPS',
    format: (snapshot) => formatMeasure(snapshot.fps),
    tone: toneOfFps,
  },
  {
    label: 'Frame p99',
    format: (snapshot) => formatMeasure(snapshot.frameP99, ' ms', 1),
  },
  { label: 'Long tasks', format: formatLongTasks },
  { label: 'Heap', format: formatHeap },
  { label: 'In', format: (snapshot) => formatMeasure(snapshot.in, ' msg/s') },
  {
    label: 'Server out',
    format: (snapshot) => formatMeasure(snapshot.serverOut, ' msg/s'),
  },
  {
    label: 'Ingest p95',
    format: (snapshot) => formatMeasure(snapshot.ingestP95, ' ms'),
  },
  {
    label: 'To-screen p95',
    format: (snapshot) => formatMeasure(snapshot.toScreenP95, ' ms'),
    tone: toneOfScreenLatency,
  },
  {
    label: 'Worker busy',
    format: (snapshot) => formatMeasure(snapshot.workerBusy, '%'),
  },
  { label: 'Integrity', format: formatIntegrity, tone: toneOfIntegrity },
];

function setTone(element: HTMLElement, tone: Tone): void {
  for (const candidate of TONES) {
    element.classList.toggle(candidate, candidate === tone);
  }
}

// Values are written straight into the tiles on a timer; React renders the
// panel once.
export function PerfHud() {
  const valueRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const cells: Array<TileCell | null> = PERF_TILES.map((_, index) => {
      const element = valueRefs.current[index];
      return element
        ? { text: createTextCell(element), tone: 'text-ink' }
        : null;
    });

    const handleTick = () => {
      const snapshot = perfMonitor.getSnapshot();

      PERF_TILES.forEach((tile, index) => {
        const cell = cells[index];
        if (!cell) {
          return;
        }
        writeTextCell(cell.text, tile.format(snapshot));
        const tone = tile.tone?.(snapshot) ?? 'text-ink';
        if (tone !== cell.tone) {
          setTone(cell.text.element, tone);
          cell.tone = tone;
        }
      });
    };

    handleTick();
    const timer = setInterval(handleTick, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <Panel title="Performance" className="h-[360px] shrink-0">
      <div className="grid h-full grid-cols-2 grid-rows-[repeat(5,auto)_minmax(0,1fr)] gap-px bg-line">
        {PERF_TILES.map((tile, index) => (
          <Stat
            key={tile.label}
            label={tile.label}
            valueRef={(element) => {
              valueRefs.current[index] = element;
            }}
          />
        ))}
        <MetricChart title="FPS · 60s" metric="fps" />
        <MetricChart title="Messages/s · 60s" metric="in" />
      </div>
    </Panel>
  );
}
