import {
  INGEST_MAX,
  INGEST_P50,
  INGEST_P95,
  OLDEST_TS,
  STAT_FIELDS,
} from '../frame-layout.ts';

// Buckets: 1 ms wide below 1 s, 10 ms wide below 10 s, the last one is 10 s+.
const FINE_BUCKETS = 1000;
const COARSE_BUCKET_MS = 10;
const COARSE_BUCKETS = 900;
const BUCKET_COUNT = FINE_BUCKETS + COARSE_BUCKETS + 1;

export interface LatencySummary {
  p50: number;
  p95: number;
  max: number;
}

export interface LatencyHistogram {
  record(ms: number): void;
  // Writes the samples recorded since the previous call into summary
  // (zeros when there were none) and starts a new window.
  roll(summary: LatencySummary): void;
}

function bucketOf(ms: number): number {
  if (ms < FINE_BUCKETS) {
    return Math.floor(ms);
  }
  const bucket =
    FINE_BUCKETS + Math.floor((ms - FINE_BUCKETS) / COARSE_BUCKET_MS);
  return Math.min(bucket, BUCKET_COUNT - 1);
}

function bucketStart(bucket: number): number {
  return bucket < FINE_BUCKETS
    ? bucket
    : FINE_BUCKETS + (bucket - FINE_BUCKETS) * COARSE_BUCKET_MS;
}

export function createLatencyHistogram(): LatencyHistogram {
  const buckets = new Uint32Array(BUCKET_COUNT);
  let count = 0;
  let max = 0;

  const record = (ms: number): void => {
    const value = ms > 0 ? ms : 0;
    const bucket = bucketOf(value);
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    count += 1;
    if (value > max) {
      max = value;
    }
  };

  const percentile = (share: number): number => {
    const rank = Math.ceil(count * share);
    let seen = 0;
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket++) {
      seen += buckets[bucket] ?? 0;
      if (seen >= rank) {
        return Math.min(bucketStart(bucket), max);
      }
    }
    return max;
  };

  const roll = (summary: LatencySummary): void => {
    if (count === 0) {
      summary.p50 = 0;
      summary.p95 = 0;
      summary.max = 0;
      return;
    }
    summary.p50 = percentile(0.5);
    summary.p95 = percentile(0.95);
    summary.max = max;
    buckets.fill(0);
    count = 0;
    max = 0;
  };

  return { record, roll };
}

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
