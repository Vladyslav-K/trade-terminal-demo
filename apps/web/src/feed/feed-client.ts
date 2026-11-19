import type { FaultKind, StreamConfig } from '@trade-terminal/protocol';

import { useAppStore } from '../stores/app-store.ts';
import type {
  MainToWorkerMessage,
  MetaMessage,
  WorkerToMainMessage,
} from './feed-messages.ts';
import { hotStore } from './hot-store.ts';
import { getWsUrl } from './ws-url.ts';

type AppState = ReturnType<typeof useAppStore.getState>;

let worker: Worker | null = null;
let isPullInFlight = false;

function post(message: MainToWorkerMessage): void {
  worker?.postMessage(message);
}

// The worker needs the selected market again after every meta: a new market
// list resets its history, and a reconnect may bring a shorter list.
function handleMeta(message: MetaMessage): void {
  const store = useAppStore.getState();
  if (message.markets.length !== store.markets.length) {
    hotStore.reset();
  }
  store.setMarkets(message.markets);
  store.setVenues(message.venues);
  store.setConfig(message.config);
  store.setLimits(message.limits);

  const { selectedMarket } = useAppStore.getState();
  const market = selectedMarket < message.markets.length ? selectedMarket : 0;
  if (market !== selectedMarket) {
    store.selectMarket(market);
    return;
  }
  post({ type: 'select', market });
}

function handleWorkerMessage(event: MessageEvent<WorkerToMainMessage>): void {
  const message = event.data;
  const store = useAppStore.getState();

  switch (message.type) {
    case 'frame':
      isPullInFlight = false;
      hotStore.applyFrame(message);
      return;
    case 'history':
      hotStore.applyHistory(message);
      return;
    case 'meta':
      handleMeta(message);
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

function handleAppStateChange(state: AppState, previous: AppState): void {
  if (state.selectedMarket !== previous.selectedMarket) {
    post({ type: 'select', market: state.selectedMarket });
  }
  if (state.notional !== previous.notional) {
    post({ type: 'setNotional', notional: state.notional });
  }
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
  post({ type: 'setNotional', notional: useAppStore.getState().notional });
  useAppStore.subscribe(handleAppStateChange);
  handleVisibilityChange();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  requestAnimationFrame(handleAnimationFrame);
}

export function setConfig(config: Partial<StreamConfig>): void {
  post({ type: 'setConfig', rate: config.rate, markets: config.markets });
}

export function injectFault(kind: FaultKind): void {
  post({ type: 'fault', kind });
}
