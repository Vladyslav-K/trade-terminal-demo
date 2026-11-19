// Field indexes of the stats array the worker sends with every frame.
// RECEIVED_*, BYTES_TOTAL, GAPS..CROSSED and BUSY_MS_TOTAL are cumulative for
// the worker lifetime. BYTES_TOTAL counts UTF-16 code units, which equals
// bytes for the ASCII stream messages.
export const RECEIVED_TOTAL = 0;
export const RECEIVED_DELTAS = 1;
export const RECEIVED_TRADES = 2;
export const RECEIVED_SIGNALS = 3;
export const BYTES_TOTAL = 4;
export const GAPS = 5;
export const RESYNCS = 6;
export const RECONNECTS = 7;
export const CROSSED = 8;
export const BUSY_MS_TOTAL = 9;
// Server ts to worker processing delay in ms over the last closed second.
export const INGEST_P50 = 10;
export const INGEST_P95 = 11;
export const INGEST_MAX = 12;
// Values of the latest server stats message.
export const SERVER_SENT = 13;
export const SERVER_BUFFERED = 14;
export const SERVER_THROTTLED = 15;
// Server clock minus client clock and the round trip of that estimate, in ms.
export const CLOCK_OFFSET = 16;
export const RTT = 17;
// Server ts of the oldest data message since the previous frame; 0 if none.
export const OLDEST_TS = 18;
// Date.now() of the last message from the server; 0 if none yet.
export const LAST_MESSAGE_AT = 19;
export const STAT_FIELDS = 20;

// Fields of one markets row. Prices and PROB, SHIFT, EDGE are in ticks.
// NaN means no data: no level on that side, no price on either venue, or no
// sparkline point 60 s ago. EDGE and EDGE_SIZE are 0 while a book is missing.
// EDGE_DIR is the buy venue: 0 buys on A and sells on B, 1 the opposite.
// VOLUME is the traded size since the market list was loaded; LAST_TS is the
// server ts of the last book update or trade, 0 if none.
export const ROW_MARKET = 0;
export const ROW_BID_A = 1;
export const ROW_ASK_A = 2;
export const ROW_BID_B = 3;
export const ROW_ASK_B = 4;
export const ROW_PROB = 5;
export const ROW_SHIFT = 6;
export const ROW_EDGE = 7;
export const ROW_EDGE_SIZE = 8;
export const ROW_EDGE_DIR = 9;
export const ROW_VOLUME = 10;
export const ROW_LAST_TS = 11;
export const ROW_FIELDS = 12;

export const BOOK_SIDE_BID = 0;
export const BOOK_SIDE_ASK = 1;

// Ladders hold (price, size) pairs per venue and side, best level first;
// a missing level is (0, 0).
export const LADDER_ROWS = 10;

// Depth holds (price, cumulative size of both venues) pairs per side, best
// price first; a missing point is (0, 0).
export const DEPTH_POINTS = 40;

// Sparkline points are one per second, oldest first; NaN means no price.
export const SPARK_POINTS = 60;

export const CANDLE_HISTORY = 600;
// Candle time is the server time in seconds; prices are ticks.
export const CANDLE_TIME = 0;
export const CANDLE_OPEN = 1;
export const CANDLE_HIGH = 2;
export const CANDLE_LOW = 3;
export const CANDLE_CLOSE = 4;
export const CANDLE_FIELDS = 5;

export const TRADE_TS = 0;
export const TRADE_VENUE = 1;
export const TRADE_PRICE = 2;
export const TRADE_SIZE = 3;
export const TRADE_SIDE = 4;
export const TRADE_FIELDS = 5;
export const TRADE_HISTORY = 50;
// Values of TRADE_SIDE, the taker side.
export const TRADE_SIDE_BUY = 1;
export const TRADE_SIDE_SELL = -1;

// For SIGNAL_KIND_EDGE, A and B are the buy and sell venues and VALUE is the
// edge in ticks. For SIGNAL_KIND_SHIFT, A is the direction (1 or -1), B is 0
// and VALUE is the size of the move in ticks.
export const SIGNAL_ID = 0;
export const SIGNAL_MARKET = 1;
export const SIGNAL_TS = 2;
export const SIGNAL_KIND = 3;
export const SIGNAL_A = 4;
export const SIGNAL_B = 5;
export const SIGNAL_VALUE = 6;
export const SIGNAL_FIELDS = 7;
export const SIGNAL_HISTORY = 100;
export const SIGNAL_KIND_EDGE = 0;
export const SIGNAL_KIND_SHIFT = 1;

export function ladderIndex(venue: number, side: number, row: number): number {
  return ((venue * 2 + side) * LADDER_ROWS + row) * 2;
}

export function depthIndex(side: number, point: number): number {
  return (side * DEPTH_POINTS + point) * 2;
}
