import type {
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

export type MainToWorkerMessage =
  InitMessage | PullMessage | VisibilityMessage | SetConfigMessage;

// stats is indexed by the fields of frame-layout.ts.
export interface FrameMessage {
  type: 'frame';
  stats: Float64Array<ArrayBuffer>;
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
  FrameMessage | MetaMessage | ConnMessage | LogMessage;
