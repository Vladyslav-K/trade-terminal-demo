// m is a market index, x is a venue index, ts is the server Date.now() in ms.

export type PriceLevel = [price: number, size: number];

export type TradeSide = 'b' | 's';

export type ErrorCode = 'invalid' | 'unsupported' | 'rate_limited';

export type FaultKind = 'drop' | 'disconnect' | 'stall';

export interface StreamConfig {
  rate: number;
  markets: number;
}

export interface StreamLimits {
  maxRate: number;
  marketCounts: readonly number[];
}

export interface VenueInfo {
  code: string;
  name: string;
}

export interface MarketInfo {
  id: number;
  title: string;
  category: string;
}

export interface HelloMessage {
  t: 'hello';
  v: number;
  now: number;
  config: StreamConfig;
  limits: StreamLimits;
  venues: VenueInfo[];
  markets: MarketInfo[];
  depth: number;
}

// Bids are sorted by price descending, asks ascending.
export interface SnapshotMessage {
  t: 'snap';
  m: number;
  x: number;
  seq: number;
  ts: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}

// seq grows by 1 per delta of the (m, x) book; a level with size 0 is removed.
export interface DeltaMessage {
  t: 'd';
  m: number;
  x: number;
  seq: number;
  ts: number;
  b: PriceLevel[];
  a: PriceLevel[];
}

// side is the taker side.
export interface TradeMessage {
  t: 'tr';
  m: number;
  x: number;
  ts: number;
  p: number;
  s: number;
  side: TradeSide;
}

// buy and sell are venue indexes, value is the edge in ticks.
export interface EdgeSignalMessage {
  t: 'sig';
  id: number;
  m: number;
  ts: number;
  kind: 'edge';
  buy: number;
  sell: number;
  value: number;
}

// value is the fair price move in ticks.
export interface ShiftSignalMessage {
  t: 'sig';
  id: number;
  m: number;
  ts: number;
  kind: 'shift';
  dir: 1 | -1;
  value: number;
}

export type SignalMessage = EdgeSignalMessage | ShiftSignalMessage;

export interface StatsMessage {
  t: 'stats';
  ts: number;
  sent: number;
  rate: number;
  buffered: number;
  throttled: number;
}

export interface PongMessage {
  t: 'pong';
  id: number;
  ts: number;
}

export interface ConfigMessage {
  t: 'cfg';
  config: StreamConfig;
  markets: MarketInfo[];
}

export interface ErrorMessage {
  t: 'err';
  code: ErrorCode;
  message: string;
}

export type ServerMessage =
  | HelloMessage
  | SnapshotMessage
  | DeltaMessage
  | TradeMessage
  | SignalMessage
  | StatsMessage
  | PongMessage
  | ConfigMessage
  | ErrorMessage;

export interface PingMessage {
  t: 'ping';
  id: number;
}

export interface SetMessage {
  t: 'set';
  rate?: number;
  markets?: number;
}

export interface ResyncMessage {
  t: 'resync';
  m: number;
  x: number;
}

export interface DropFaultMessage {
  t: 'fault';
  kind: 'drop';
  m: number;
  x: number;
}

export interface ConnectionFaultMessage {
  t: 'fault';
  kind: 'disconnect' | 'stall';
}

export type FaultMessage = DropFaultMessage | ConnectionFaultMessage;

export type ClientMessage =
  PingMessage | SetMessage | ResyncMessage | FaultMessage;
