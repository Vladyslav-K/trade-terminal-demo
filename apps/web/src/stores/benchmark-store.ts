import { create } from 'zustand';

import type { StepResult } from '../benchmark/verdict.ts';

export type BenchmarkStatus = 'idle' | 'running' | 'done' | 'aborted';

export type BenchmarkAbortReason = 'hidden' | 'connection' | 'cancelled';

export interface BenchmarkEnvironment {
  userAgent: string;
  cores: number;
  markets: number;
}

// steps are the target rates of the run. stepIndex is -1 while the baseline
// is measured; secondsLeft is the time left to the end of the whole run.
interface BenchmarkState {
  status: BenchmarkStatus;
  steps: readonly number[];
  stepIndex: number;
  secondsLeft: number;
  baselineFps: number | null;
  results: StepResult[];
  abortReason: BenchmarkAbortReason | null;
  environment: BenchmarkEnvironment | null;
  begin: (
    steps: readonly number[],
    secondsLeft: number,
    environment: BenchmarkEnvironment,
  ) => void;
  setBaselineFps: (baselineFps: number) => void;
  setProgress: (stepIndex: number, secondsLeft: number) => void;
  addResult: (result: StepResult) => void;
  finish: () => void;
  abort: (reason: BenchmarkAbortReason) => void;
}

export const useBenchmarkStore = create<BenchmarkState>()((set) => ({
  status: 'idle',
  steps: [],
  stepIndex: -1,
  secondsLeft: 0,
  baselineFps: null,
  results: [],
  abortReason: null,
  environment: null,
  begin: (steps, secondsLeft, environment) =>
    set({
      status: 'running',
      steps,
      stepIndex: -1,
      secondsLeft,
      baselineFps: null,
      results: [],
      abortReason: null,
      environment,
    }),
  setBaselineFps: (baselineFps) => set({ baselineFps }),
  setProgress: (stepIndex, secondsLeft) => set({ stepIndex, secondsLeft }),
  addResult: (result) =>
    set((state) => ({ results: [...state.results, result] })),
  finish: () => set({ status: 'done', secondsLeft: 0 }),
  abort: (reason) => set({ status: 'aborted', abortReason: reason }),
}));
