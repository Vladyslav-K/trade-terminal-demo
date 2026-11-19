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
