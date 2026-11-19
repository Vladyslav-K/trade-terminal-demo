export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';

// Prices are integer ticks: 1 tick = 0.1¢ = 0.1% implied probability.
export const PRICE_MIN = 1;
export const PRICE_MAX = 999;
export const PRICE_TICKS = 1000;

export const VENUE_COUNT = 2;
export const BOOK_DEPTH = 25;

export const MAX_MARKETS = 200;
export const MARKET_COUNTS: readonly number[] = [10, 25, 50, 100, 200];
export const DEFAULT_MARKETS = 50;

// Rates are messages per second.
export const RATE_MIN = 50;
export const RATE_MAX = 20000;
export const RATE_DEFAULT = 500;
export const RATE_STEPS: readonly number[] = [
  100, 250, 500, 1000, 2500, 5000, 10000, 20000,
];

export const PING_INTERVAL_MS = 1000;
export const STALE_AFTER_MS = 3000;
export const DEAD_AFTER_MS = 6000;
export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 10000;
export const STALL_DURATION_MS = 10000;

export const CLOSE_RESTART = 1012;
export const CLOSE_OVER_CAPACITY = 1013;
export const CLOSE_POLICY = 1008;
