import { NOT_AVAILABLE, formatMeasure } from '../lib/format.ts';
import type { BenchmarkEnvironment } from '../stores/benchmark-store.ts';
import { findSustainedLimit, type StepResult } from './verdict.ts';

export interface BenchmarkReportData {
  steps: readonly number[];
  results: readonly StepResult[];
  environment: BenchmarkEnvironment;
  baselineFps: number;
}

export const METRIC_COLUMNS: readonly string[] = [
  'Target msg/s',
  'Received msg/s',
  'Avg FPS',
  'Frame p99 ms',
  'Long tasks ms',
  'Ingest p95 ms',
  'To-screen p95 ms',
  'Worker busy %',
];
export const VERDICT_COLUMN = 'Verdict';
export const NOTE_COLUMN = 'Note';

const SERVER_LIMITED_NOTE = 'server-limited';

function formatValue(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) {
    return NOT_AVAILABLE;
  }
  return formatMeasure(value, '', fractionDigits);
}

// One cell per METRIC_COLUMNS entry.
export function formatMetricCells(result: StepResult): string[] {
  return [
    formatValue(result.target),
    formatValue(result.received),
    formatValue(result.avgFps),
    formatValue(result.frameP99, 1),
    formatValue(result.longTaskMs),
    formatValue(result.ingestP95),
    formatValue(result.toScreenP95),
    formatValue(result.workerBusy),
  ];
}

export function formatNote(result: StepResult): string {
  return result.isServerLimited ? SERVER_LIMITED_NOTE : '';
}

// The baseline FPS is the display refresh rate.
export function formatEnvironment(report: BenchmarkReportData): string {
  const { userAgent, cores, markets } = report.environment;
  return `${userAgent} · ${cores} cores · ${formatValue(report.baselineFps)} Hz · ${markets} markets`;
}

export function formatSustainedLimit(
  steps: readonly number[],
  results: readonly StepResult[],
): string {
  const limit = findSustainedLimit(results);
  if (limit === null) {
    return `Sustained limit: below ${steps[0] ?? NOT_AVAILABLE} msg/s`;
  }
  const suffix = limit === steps.at(-1) ? ' (highest tested)' : '';
  return `Sustained limit: ${limit} msg/s${suffix}`;
}
