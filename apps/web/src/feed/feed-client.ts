import type { StreamConfig } from '@trade-terminal/protocol';

import { useAppStore } from '../stores/app-store.ts';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './feed-messages.ts';
import { getWsUrl } from './ws-url.ts';

// stats is indexed by the fields of frame-layout.ts; receivedAt is the
// performance.now() at which the frame arrived.
export interface LatestFrame {
  stats: Float64Array | null;
  receivedAt: number;
}

const latestFrame: LatestFrame = { stats: null, receivedAt: 0 };

let worker: Worker | null = null;
let isPullInFlight = false;

function post(message: MainToWorkerMessage): void {
  worker?.postMessage(message);
}

function handleWorkerMessage(event: MessageEvent<WorkerToMainMessage>): void {
  const message = event.data;
  const store = useAppStore.getState();

  switch (message.type) {
    case 'frame':
      latestFrame.stats = message.stats;
      latestFrame.receivedAt = performance.now();
      isPullInFlight = false;
      return;
    case 'meta':
      store.setMarkets(message.markets);
      store.setVenues(message.venues);
      store.setConfig(message.config);
      store.setLimits(message.limits);
      return;
    case 'conn':
      store.setConnection({
        state: message.state,
        attempt: message.attempt,
        retryAt:
          message.retryInMs === null ? null : Date.now() + message.retryInMs,
        lastMessageAt: message.lastMessageAt,
      });
      return;
    case 'log':
      store.addLogEntry({
        ts: message.ts,
        level: message.level,
        text: message.text,
      });
      return;
  }
}

function handleWorkerError(event: ErrorEvent): void {
  useAppStore.getState().addLogEntry({
    ts: Date.now(),
    level: 'error',
    text: `feed worker error: ${event.message}`,
  });
}

function handleAnimationFrame(): void {
  if (!isPullInFlight) {
    isPullInFlight = true;
    post({ type: 'pull' });
  }
  requestAnimationFrame(handleAnimationFrame);
}

function handleVisibilityChange(): void {
  post({ type: 'visibility', isHidden: document.hidden });
}

export function startFeed(): void {
  if (worker !== null) {
    return;
  }

  worker = new Worker(new URL('./worker/feed.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.addEventListener('message', handleWorkerMessage);
  worker.addEventListener('error', handleWorkerError);

  post({ type: 'init', url: getWsUrl() });
  handleVisibilityChange();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  requestAnimationFrame(handleAnimationFrame);
}

export function setConfig(config: Partial<StreamConfig>): void {
  post({ type: 'setConfig', rate: config.rate, markets: config.markets });
}

export function getLatestFrame(): Readonly<LatestFrame> {
  return latestFrame;
}
