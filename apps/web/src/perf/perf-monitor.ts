import {
  BUSY_MS_TOTAL,
  CROSSED,
  INGEST_P95,
  RECEIVED_TOTAL,
  SERVER_SENT,
} from '../feed/frame-layout.ts';
import { hotStore } from '../feed/hot-store.ts';

const FRAME_SAMPLES = 600;
const HISTORY_SECONDS = 60;
const SECOND_MS = 1000;
const FRAME_PERCENTILE = 0.99;

// NaN means no data yet; null means the browser does not provide the metric.
// Every value covers the last closed second, except the *Total fields, which
// are cumulative since start, and crossed, which is cumulative for the worker
// lifetime. in and serverOut are messages per second, workerBusy is percent.
export interface PerfSnapshot {
  fps: number;
  frameP99: number;
  longTaskCount: number | null;
  longTaskMs: number | null;
  longTaskTotalCount: number | null;
  longTaskTotalMs: number | null;
  heapBytes: number | null;
  in: number;
  serverOut: number;
  ingestP95: number;
  toScreenP95: number;
  workerBusy: number;
  crossed: number;
}

export type PerfHistoryKey = 'fps' | 'in';

export type PerfListener = () => void;

export interface PerfMonitor {
  start(): void;
  // The listener runs once per second, right after the snapshot is updated.
  subscribe(listener: PerfListener): () => void;
  getSnapshot(): Readonly<PerfSnapshot>;
  // One value per second, oldest first; NaN means no data for that second.
  getHistory(key: PerfHistoryKey): Float32Array<ArrayBuffer>;
}

// performance.memory exists only in Chromium.
interface ChromiumPerformance extends Performance {
  memory?: { usedJSHeapSize: number };
}

const isLongTaskSupported =
  typeof PerformanceObserver !== 'undefined' &&
  PerformanceObserver.supportedEntryTypes?.includes('longtask') === true;

const readHeapBytes = (): number | null =>
  (performance as ChromiumPerformance).memory?.usedJSHeapSize ?? null;

const frameDurations = new Float32Array(FRAME_SAMPLES);
const frameScratch = new Float32Array(FRAME_SAMPLES);
let frameCount = 0;
let windowFirstFrame = 0;
// 0 means the next frame only starts a new measurement.
let lastFrameAt = 0;

let windowLongTasks = 0;
let windowLongTaskMs = 0;
let totalLongTasks = 0;
let totalLongTaskMs = 0;

let hasStatsBase = false;
let baseReceived = 0;
let baseBusyMs = 0;
let baseAt = 0;

const fpsHistory = new Float32Array(HISTORY_SECONDS).fill(NaN);
const inHistory = new Float32Array(HISTORY_SECONDS).fill(NaN);
const listeners = new Set<PerfListener>();

let snapshot: Readonly<PerfSnapshot> = {
  fps: NaN,
  frameP99: NaN,
  longTaskCount: isLongTaskSupported ? NaN : null,
  longTaskMs: isLongTaskSupported ? NaN : null,
  longTaskTotalCount: isLongTaskSupported ? 0 : null,
  longTaskTotalMs: isLongTaskSupported ? 0 : null,
  heapBytes: readHeapBytes(),
  in: NaN,
  serverOut: NaN,
  ingestP95: NaN,
  toScreenP95: NaN,
  workerBusy: NaN,
  crossed: NaN,
};
let isStarted = false;

const handleFrame = (now: number): void => {
  if (lastFrameAt > 0) {
    frameDurations[frameCount % FRAME_SAMPLES] = now - lastFrameAt;
    frameCount += 1;
  }
  lastFrameAt = now;
  requestAnimationFrame(handleFrame);
};

const handleLongTasks = (list: PerformanceObserverEntryList): void => {
  for (const entry of list.getEntries()) {
    windowLongTasks += 1;
    windowLongTaskMs += entry.duration;
  }
};

// Frames are not drawn while the tab is hidden, so the first frame after the
// return would report the whole hidden period as one frame.
const handleVisibilityChange = (): void => {
  lastFrameAt = 0;
  if (!document.hidden) {
    windowFirstFrame = frameCount;
    windowLongTasks = 0;
    windowLongTaskMs = 0;
  }
};

// Average FPS is the frame count over the total frame time of the window.
const rollFrames = (target: PerfSnapshot): void => {
  const count = Math.min(frameCount - windowFirstFrame, FRAME_SAMPLES);
  windowFirstFrame = frameCount;

  if (count === 0) {
    target.fps = 0;
    target.frameP99 = NaN;
    return;
  }

  let totalMs = 0;
  for (let sample = 0; sample < count; sample++) {
    const duration =
      frameDurations[(frameCount - count + sample) % FRAME_SAMPLES] ?? 0;
    frameScratch[sample] = duration;
    totalMs += duration;
  }
  const sorted = frameScratch.subarray(0, count).sort();

  target.fps = totalMs > 0 ? (count * SECOND_MS) / totalMs : 0;
  target.frameP99 = sorted[Math.ceil(count * FRAME_PERCENTILE) - 1] ?? NaN;
};

const rollLongTasks = (target: PerfSnapshot): void => {
  if (!isLongTaskSupported) {
    return;
  }
  totalLongTasks += windowLongTasks;
  totalLongTaskMs += windowLongTaskMs;
  target.longTaskCount = windowLongTasks;
  target.longTaskMs = windowLongTaskMs;
  target.longTaskTotalCount = totalLongTasks;
  target.longTaskTotalMs = totalLongTaskMs;
  windowLongTasks = 0;
  windowLongTaskMs = 0;
};

// Rates are divided by the time between the frames that carried the stats,
// so a pause in frames does not show up as a spike after it.
const rollStats = (target: PerfSnapshot): void => {
  const stats = hotStore.getStats();
  if (stats === null) {
    return;
  }

  const receivedAt = hotStore.getStatsReceivedAt();
  const received = stats[RECEIVED_TOTAL] ?? 0;
  const busyMs = stats[BUSY_MS_TOTAL] ?? 0;
  const elapsedMs = receivedAt - baseAt;

  if (hasStatsBase && elapsedMs > 0) {
    target.in = Math.max(
      0,
      ((received - baseReceived) * SECOND_MS) / elapsedMs,
    );
    target.workerBusy = Math.min(
      100,
      Math.max(0, ((busyMs - baseBusyMs) * 100) / elapsedMs),
    );
  }
  if (!hasStatsBase || elapsedMs > 0) {
    hasStatsBase = true;
    baseReceived = received;
    baseBusyMs = busyMs;
    baseAt = receivedAt;
  }

  target.serverOut = stats[SERVER_SENT] ?? NaN;
  target.ingestP95 = stats[INGEST_P95] ?? NaN;
  target.crossed = stats[CROSSED] ?? NaN;
  target.toScreenP95 = hotStore.getScreenLatencyP95();
};

const pushHistory = (history: Float32Array, value: number): void => {
  history.copyWithin(0, 1);
  history[HISTORY_SECONDS - 1] = value;
};

const handleSecond = (): void => {
  if (document.hidden) {
    return;
  }

  const next: PerfSnapshot = { ...snapshot, heapBytes: readHeapBytes() };
  rollFrames(next);
  rollLongTasks(next);
  rollStats(next);
  snapshot = next;

  pushHistory(fpsHistory, next.fps);
  pushHistory(inHistory, next.in);
  listeners.forEach((listener) => listener());
};

const start = (): void => {
  if (isStarted) {
    return;
  }
  isStarted = true;

  if (isLongTaskSupported) {
    const observer = new PerformanceObserver(handleLongTasks);
    observer.observe({ type: 'longtask' });
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  requestAnimationFrame(handleFrame);
  setInterval(handleSecond, SECOND_MS);
};

const subscribe = (listener: PerfListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const perfMonitor: PerfMonitor = {
  start,
  subscribe,
  getSnapshot: () => snapshot,
  getHistory: (key) => (key === 'fps' ? fpsHistory : inHistory),
};
