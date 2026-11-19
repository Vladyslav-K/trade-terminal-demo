import { useSyncExternalStore } from 'react';

import { useAppStore, type ConnectionState } from '../stores/app-store.ts';

const TICK_MS = 200;

export type StaleKind = 'none' | 'stale' | 'lost' | 'offline' | 'incompatible';

// sinceMs is the time since the last message from the server, retryInMs the
// time left to the next reconnect attempt; null when unknown or, for
// retryInMs, while an attempt is running. Both are null for 'none'.
export interface StaleState {
  kind: StaleKind;
  sinceMs: number | null;
  retryInMs: number | null;
}

type ClockListener = () => void;

const STALE_KINDS: Record<ConnectionState, StaleKind> = {
  connecting: 'none',
  live: 'none',
  stale: 'stale',
  reconnecting: 'lost',
  offline: 'offline',
  incompatible: 'incompatible',
};

// One clock for every reader; it ticks only while someone is subscribed.
const clockListeners = new Set<ClockListener>();
let clockNow = 0;
let clockTimer = 0;

const handleClockTick = (): void => {
  clockNow = Date.now();
  clockListeners.forEach((listener) => listener());
};

const subscribeClock = (listener: ClockListener): (() => void) => {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockNow = Date.now();
    clockTimer = window.setInterval(handleClockTick, TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
    }
  };
};

const getClock = (): number => clockNow;

const subscribeNothing = (): (() => void) => () => {};

const getNoClock = (): number => 0;

const msSince = (from: number | null, now: number): number | null =>
  from === null ? null : Math.max(0, now - from);

const msUntil = (to: number | null, now: number): number | null =>
  to === null ? null : Math.max(0, to - now);

export function useIsStale(): boolean {
  return useAppStore((state) => STALE_KINDS[state.connection.state] !== 'none');
}

export function useStaleState(): StaleState {
  const connection = useAppStore((state) => state.connection);
  const kind = STALE_KINDS[connection.state];
  const isTicking = kind !== 'none';
  const now = useSyncExternalStore(
    isTicking ? subscribeClock : subscribeNothing,
    isTicking ? getClock : getNoClock,
  );

  if (!isTicking) {
    return { kind, sinceMs: null, retryInMs: null };
  }
  return {
    kind,
    sinceMs: msSince(connection.lastMessageAt, now),
    retryInMs: msUntil(connection.retryAt, now),
  };
}
