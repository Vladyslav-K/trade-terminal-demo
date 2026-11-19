import {
  INGEST_MAX,
  INGEST_P50,
  INGEST_P95,
  OLDEST_TS,
  STAT_FIELDS,
} from '../frame-layout.ts';
import { createLatencyHistogram } from '../latency-histogram.ts';
import type { LatencySummary } from '../latency-histogram.ts';

// Indexed by the fields of frame-layout.ts.
export const stats = new Float64Array(STAT_FIELDS);

const ingestLatency = createLatencyHistogram();
const ingestSummary: LatencySummary = { p50: 0, p95: 0, max: 0 };

export function addStat(field: number, amount: number): void {
  stats[field] = (stats[field] ?? 0) + amount;
}

export function recordIngestLatency(ms: number): void {
  ingestLatency.record(ms);
}

export function rollIngestWindow(): void {
  ingestLatency.roll(ingestSummary);
  stats[INGEST_P50] = ingestSummary.p50;
  stats[INGEST_P95] = ingestSummary.p95;
  stats[INGEST_MAX] = ingestSummary.max;
}

// Copies the stats for one frame and starts a new OLDEST_TS window.
export function takeFrameStats(): Float64Array<ArrayBuffer> {
  const frame = stats.slice();
  stats[OLDEST_TS] = 0;
  return frame;
}
