import type {
  FaultKind,
  MarketInfo,
  StreamConfig,
  StreamLimits,
  VenueInfo,
} from '@trade-terminal/protocol';

import type { ConnectionState, LogLevel } from '../stores/app-store.ts';

export interface InitMessage {
  type: 'init';
  url: string;
}

export interface PullMessage {
  type: 'pull';
}

export interface VisibilityMessage {
  type: 'visibility';
  isHidden: boolean;
}

export interface SetConfigMessage {
  type: 'setConfig';
  rate?: number;
  markets?: number;
}

export interface SelectMessage {
  type: 'select';
  market: number;
}

// notional is the size in contracts the executable edge is computed for.
export interface SetNotionalMessage {
  type: 'setNotional';
  notional: number;
}

// A drop fault hits the selected market on venue 0.
export interface FaultRequestMessage {
  type: 'fault';
  kind: FaultKind;
}

export type MainToWorkerMessage =
  | InitMessage
  | PullMessage
  | VisibilityMessage
  | SetConfigMessage
  | SelectMessage
  | SetNotionalMessage
  | FaultRequestMessage;

// The selected market's book slices and its open candle, laid out as
// described in frame-layout.ts.
export interface SelectedFrame {
  market: number;
  ladders: Int32Array<ArrayBuffer>;
  depth: Int32Array<ArrayBuffer>;
  candle: Float64Array<ArrayBuffer>;
}

// stats is indexed by the fields of frame-layout.ts. rows holds the markets
// changed since the previous frame, ROW_FIELDS values each; trades are new
// trades of the selected market and signals are new signals, oldest first.
// sparks comes once per second, SPARK_POINTS values per market. null means
// nothing changed.
export interface FrameMessage {
  type: 'frame';
  stats: Float64Array<ArrayBuffer>;
  rows: Float64Array<ArrayBuffer> | null;
  selected: SelectedFrame | null;
  trades: Float64Array<ArrayBuffer> | null;
  signals: Float64Array<ArrayBuffer> | null;
  sparks?: Float32Array<ArrayBuffer>;
}

// Closed candles and the latest trades of the market, oldest first.
export interface HistoryMessage {
  type: 'history';
  market: number;
  candles: Float64Array<ArrayBuffer>;
  trades: Float64Array<ArrayBuffer>;
}

export interface MetaMessage {
  type: 'meta';
  markets: MarketInfo[];
  venues: VenueInfo[];
  config: StreamConfig;
  limits: StreamLimits;
}

// lastMessageAt is a Date.now() timestamp in ms.
export interface ConnMessage {
  type: 'conn';
  state: ConnectionState;
  attempt: number;
  retryInMs: number | null;
  lastMessageAt: number | null;
}

export interface LogMessage {
  type: 'log';
  ts: number;
  level: LogLevel;
  text: string;
}

export type WorkerToMainMessage =
  FrameMessage | HistoryMessage | MetaMessage | ConnMessage | LogMessage;
