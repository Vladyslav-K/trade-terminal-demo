import {
  DEFAULT_MARKETS,
  MARKET_COUNTS,
  RATE_DEFAULT,
  RATE_MAX,
  type MarketInfo,
  type StreamConfig,
  type StreamLimits,
  type VenueInfo,
} from '@trade-terminal/protocol';
import { create } from 'zustand';

export const EVENT_LOG_LIMIT = 200;

export type SortKey = 'edge' | 'prob' | 'shift' | 'volume';

export type Notional = 100 | 500 | 2000;

export type ConnectionState =
  'connecting' | 'live' | 'stale' | 'reconnecting' | 'offline' | 'incompatible';

export type LogLevel = 'info' | 'warn' | 'error';

// retryAt and lastMessageAt are Date.now() timestamps in ms.
export interface ConnectionInfo {
  state: ConnectionState;
  attempt: number;
  retryAt: number | null;
  lastMessageAt: number | null;
}

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  text: string;
}

interface AppState {
  selectedMarket: number;
  sortKey: SortKey;
  notional: Notional;
  config: StreamConfig;
  limits: StreamLimits;
  markets: MarketInfo[];
  venues: VenueInfo[];
  connection: ConnectionInfo;
  eventLog: LogEntry[];
  selectMarket: (marketId: number) => void;
  setSortKey: (sortKey: SortKey) => void;
  setNotional: (notional: Notional) => void;
  setConfig: (config: StreamConfig) => void;
  setLimits: (limits: StreamLimits) => void;
  setMarkets: (markets: MarketInfo[]) => void;
  setVenues: (venues: VenueInfo[]) => void;
  setConnection: (connection: ConnectionInfo) => void;
  addLogEntry: (entry: Omit<LogEntry, 'id'>) => void;
}

let nextLogId = 1;

export const useAppStore = create<AppState>()((set) => ({
  selectedMarket: 0,
  sortKey: 'edge',
  notional: 500,
  config: { rate: RATE_DEFAULT, markets: DEFAULT_MARKETS },
  limits: { maxRate: RATE_MAX, marketCounts: MARKET_COUNTS },
  markets: [],
  venues: [],
  connection: {
    state: 'connecting',
    attempt: 0,
    retryAt: null,
    lastMessageAt: null,
  },
  eventLog: [],
  selectMarket: (marketId) => set({ selectedMarket: marketId }),
  setSortKey: (sortKey) => set({ sortKey }),
  setNotional: (notional) => set({ notional }),
  setConfig: (config) => set({ config }),
  setLimits: (limits) => set({ limits }),
  setMarkets: (markets) => set({ markets }),
  setVenues: (venues) => set({ venues }),
  setConnection: (connection) => set({ connection }),
  addLogEntry: (entry) =>
    set((state) => ({
      eventLog: [
        { ...entry, id: nextLogId++ },
        ...state.eventLog.slice(0, EVENT_LOG_LIMIT - 1),
      ],
    })),
}));
