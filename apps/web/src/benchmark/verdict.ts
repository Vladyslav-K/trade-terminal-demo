export type Verdict = 'PASS' | 'DEGRADED' | 'FAIL';

// Aggregates over the measured seconds of one step. Rates are messages per
// second, times are ms, workerBusy is percent, gaps is the increase of the
// gap counter. NaN means no data; a null longTaskMs means the browser does
// not report long tasks.
export interface StepMeasurement {
  target: number;
  received: number;
  serverSent: number;
  avgFps: number;
  frameP99: number;
  longTaskMs: number | null;
  ingestP95: number;
  toScreenP95: number;
  workerBusy: number;
  gaps: number;
}

export interface StepResult extends StepMeasurement {
  verdict: Verdict;
  // The server sent less than the target, so the generator or the channel
  // fell short, not the frontend.
  isServerLimited: boolean;
}

const PASS_FPS_SHARE = 0.9;
const PASS_SCREEN_MS = 100;
const PASS_DELIVERED_SHARE = 0.95;
const PASS_LONG_TASK_MS = 400;
const DEGRADED_FPS_SHARE = 0.5;
const DEGRADED_SCREEN_MS = 1000;
const DEGRADED_DELIVERED_SHARE = 0.8;
const SERVER_LIMITED_SHARE = 0.95;

export const PASS_RULE =
  'PASS: FPS ≥ 90% of display refresh, data on screen within 100 ms, ≥ 95% of messages delivered, long tasks ≤ 400 ms per 8 s.';
export const DEGRADED_RULE =
  'DEGRADED: FPS ≥ 50%, data on screen within 1 s, ≥ 80% delivered.';

// A NaN metric fails every comparison, so a step without data never passes.
function isPass(measurement: StepMeasurement, baselineFps: number): boolean {
  const { avgFps, toScreenP95, received, target, longTaskMs } = measurement;
  return (
    avgFps >= PASS_FPS_SHARE * baselineFps &&
    toScreenP95 <= PASS_SCREEN_MS &&
    received >= PASS_DELIVERED_SHARE * target &&
    (longTaskMs === null || longTaskMs <= PASS_LONG_TASK_MS)
  );
}

function isDegraded(
  measurement: StepMeasurement,
  baselineFps: number,
): boolean {
  const { avgFps, toScreenP95, received, target } = measurement;
  return (
    avgFps >= DEGRADED_FPS_SHARE * baselineFps &&
    toScreenP95 <= DEGRADED_SCREEN_MS &&
    received >= DEGRADED_DELIVERED_SHARE * target
  );
}

function getVerdict(
  measurement: StepMeasurement,
  baselineFps: number,
): Verdict {
  if (isPass(measurement, baselineFps)) {
    return 'PASS';
  }
  return isDegraded(measurement, baselineFps) ? 'DEGRADED' : 'FAIL';
}

export function judgeStep(
  measurement: StepMeasurement,
  baselineFps: number,
): StepResult {
  return {
    ...measurement,
    verdict: getVerdict(measurement, baselineFps),
    isServerLimited:
      measurement.serverSent < SERVER_LIMITED_SHARE * measurement.target,
  };
}

// The highest target for which the step itself and every lower step passed;
// null when the first step did not pass.
export function findSustainedLimit(
  results: readonly StepResult[],
): number | null {
  let limit: number | null = null;
  for (const result of results) {
    if (result.verdict !== 'PASS') {
      break;
    }
    limit = result.target;
  }
  return limit;
}
