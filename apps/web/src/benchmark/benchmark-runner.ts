import { RATE_MIN, RATE_STEPS } from '@trade-terminal/protocol';

import { setConfig } from '../feed/feed-client.ts';
import { GAPS } from '../feed/frame-layout.ts';
import { hotStore } from '../feed/hot-store.ts';
import { perfMonitor, type PerfSnapshot } from '../perf/perf-monitor.ts';
import { useAppStore } from '../stores/app-store.ts';
import {
  useBenchmarkStore,
  type BenchmarkAbortReason,
} from '../stores/benchmark-store.ts';
import { judgeStep, type StepMeasurement } from './verdict.ts';

const BASELINE_SETTLE_SECONDS = 1;
const BASELINE_SECONDS = 2;
const WARMUP_SECONDS = 2;
const MEASURE_SECONDS = 8;
const STEP_SECONDS = WARMUP_SECONDS + MEASURE_SECONDS;
const BASELINE_STEP = -1;

type Sample = Readonly<PerfSnapshot>;

// The run advances on the perf monitor seconds, so every sample covers one
// whole second of the current phase. stepIndex is BASELINE_STEP while the
// baseline is measured; second counts the seconds since the phase started.
interface Run {
  steps: readonly number[];
  previousRate: number;
  stepIndex: number;
  rate: number;
  second: number;
  secondsLeft: number;
  samples: Sample[];
  baselineFps: number;
  gapsAtStart: number;
  stopListeners: Array<() => void>;
}

let run: Run | null = null;

export function getBenchmarkSteps(maxRate: number): number[] {
  return RATE_STEPS.filter((rate) => rate <= maxRate);
}

export function getBenchmarkSeconds(stepCount: number): number {
  return BASELINE_SETTLE_SECONDS + BASELINE_SECONDS + STEP_SECONDS * stepCount;
}

function readGaps(): number {
  return hotStore.getStats()?.[GAPS] ?? 0;
}

// Seconds without data are skipped; NaN when no second has data.
function meanOf(
  samples: readonly Sample[],
  read: (s: Sample) => number,
): number {
  let sum = 0;
  let count = 0;
  for (const sample of samples) {
    const value = read(sample);
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : NaN;
}

function maxOf(
  samples: readonly Sample[],
  read: (s: Sample) => number,
): number {
  let max = NaN;
  for (const sample of samples) {
    const value = read(sample);
    if (Number.isFinite(value) && (Number.isNaN(max) || value > max)) {
      max = value;
    }
  }
  return max;
}

function sumLongTasks(samples: readonly Sample[]): number | null {
  let total = 0;
  for (const { longTaskMs } of samples) {
    if (longTaskMs === null) {
      return null;
    }
    if (Number.isFinite(longTaskMs)) {
      total += longTaskMs;
    }
  }
  return total;
}

function measureStep(current: Run): StepMeasurement {
  const { samples } = current;
  return {
    target: current.rate,
    received: meanOf(samples, (sample) => sample.in),
    serverSent: meanOf(samples, (sample) => sample.serverOut),
    avgFps: meanOf(samples, (sample) => sample.fps),
    frameP99: maxOf(samples, (sample) => sample.frameP99),
    longTaskMs: sumLongTasks(samples),
    ingestP95: maxOf(samples, (sample) => sample.ingestP95),
    toScreenP95: maxOf(samples, (sample) => sample.toScreenP95),
    workerBusy: meanOf(samples, (sample) => sample.workerBusy),
    gaps: readGaps() - current.gapsAtStart,
  };
}

function stopRun(): Run | null {
  const current = run;
  run = null;
  current?.stopListeners.forEach((stop) => stop());
  return current;
}

// After a reconnect the new server session starts with its default rate, so
// the previous rate is sent once the connection is live again.
function restoreRateWhenLive(rate: number): void {
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.connection.state === 'live') {
      unsubscribe();
      setConfig({ rate });
    }
  });
}

function abortRun(reason: BenchmarkAbortReason): void {
  const current = stopRun();
  if (current === null) {
    return;
  }
  useBenchmarkStore.getState().abort(reason);
  if (reason === 'connection') {
    restoreRateWhenLive(current.previousRate);
    return;
  }
  setConfig({ rate: current.previousRate });
}

function finishRun(): void {
  const current = stopRun();
  if (current === null) {
    return;
  }
  useBenchmarkStore.getState().finish();
  setConfig({ rate: current.previousRate });
}

function startStep(current: Run, stepIndex: number, rate: number): void {
  current.stepIndex = stepIndex;
  current.rate = rate;
  current.second = 0;
  current.samples = [];
  useBenchmarkStore.getState().setProgress(stepIndex, current.secondsLeft);
  setConfig({ rate });
}

function handleBaselineSecond(current: Run): void {
  if (current.second > BASELINE_SETTLE_SECONDS) {
    current.samples.push(perfMonitor.getSnapshot());
  }
  if (current.second < BASELINE_SETTLE_SECONDS + BASELINE_SECONDS) {
    useBenchmarkStore
      .getState()
      .setProgress(BASELINE_STEP, current.secondsLeft);
    return;
  }

  current.baselineFps = meanOf(current.samples, (sample) => sample.fps);
  useBenchmarkStore.getState().setBaselineFps(current.baselineFps);
  const firstRate = current.steps[0];
  if (firstRate === undefined) {
    finishRun();
    return;
  }
  startStep(current, 0, firstRate);
}

// The rest of the steps is skipped after the first FAIL.
function handleStepSecond(current: Run): void {
  if (current.second === WARMUP_SECONDS) {
    current.gapsAtStart = readGaps();
  }
  if (current.second > WARMUP_SECONDS) {
    current.samples.push(perfMonitor.getSnapshot());
  }
  if (current.second < STEP_SECONDS) {
    useBenchmarkStore
      .getState()
      .setProgress(current.stepIndex, current.secondsLeft);
    return;
  }

  const result = judgeStep(measureStep(current), current.baselineFps);
  useBenchmarkStore.getState().addResult(result);

  const nextIndex = current.stepIndex + 1;
  const nextRate = current.steps[nextIndex];
  if (result.verdict === 'FAIL' || nextRate === undefined) {
    finishRun();
    return;
  }
  startStep(current, nextIndex, nextRate);
}

function handleMonitorSecond(): void {
  const current = run;
  if (current === null) {
    return;
  }
  current.second += 1;
  current.secondsLeft = Math.max(0, current.secondsLeft - 1);

  if (current.stepIndex === BASELINE_STEP) {
    handleBaselineSecond(current);
    return;
  }
  handleStepSecond(current);
}

// requestAnimationFrame does not run in a hidden tab, so the measurement
// would be wrong.
function handleVisibilityChange(): void {
  if (document.hidden) {
    abortRun('hidden');
  }
}

export function startBenchmark(): void {
  if (run !== null) {
    return;
  }
  const { connection, limits, config } = useAppStore.getState();
  const steps = getBenchmarkSteps(limits.maxRate);
  if (connection.state !== 'live' || document.hidden || steps.length === 0) {
    return;
  }

  const current: Run = {
    steps,
    previousRate: config.rate,
    stepIndex: BASELINE_STEP,
    rate: RATE_MIN,
    second: 0,
    secondsLeft: getBenchmarkSeconds(steps.length),
    samples: [],
    baselineFps: NaN,
    gapsAtStart: 0,
    stopListeners: [],
  };
  run = current;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  current.stopListeners.push(
    () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange),
    perfMonitor.subscribe(handleMonitorSecond),
    useAppStore.subscribe((state) => {
      if (state.connection.state !== 'live') {
        abortRun('connection');
      }
    }),
  );

  useBenchmarkStore.getState().begin(steps, current.secondsLeft, {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    markets: config.markets,
  });
  setConfig({ rate: RATE_MIN });
}

export function cancelBenchmark(): void {
  abortRun('cancelled');
}
