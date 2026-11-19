// Formatters for the hot path: arithmetic and toFixed only, no Intl.
// Prices are ticks of 0.1¢; NaN, and a price of 0 or less, mean no data.

const NO_DATA = '—';
const MINUS = '−';
const VENUE_LETTERS: readonly string[] = ['A', 'B'];

const clockDate = new Date();

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) {
    return `00${value}`;
  }
  return value < 100 ? `0${value}` : String(value);
}

export function formatPrice(ticks: number): string {
  if (!Number.isFinite(ticks) || ticks <= 0) {
    return NO_DATA;
  }
  return `${(ticks / 10).toFixed(1)}¢`;
}

// Same as formatPrice without the ¢ sign.
export function formatPlainPrice(ticks: number): string {
  if (!Number.isFinite(ticks) || ticks <= 0) {
    return NO_DATA;
  }
  return (ticks / 10).toFixed(1);
}

// A change that rounds to zero has no sign.
export function formatSignedPrice(ticks: number): string {
  if (!Number.isFinite(ticks)) {
    return NO_DATA;
  }
  const text = (Math.abs(ticks) / 10).toFixed(1);
  if (text === '0.0') {
    return `${text}¢`;
  }
  return `${ticks > 0 ? '+' : MINUS}${text}¢`;
}

// Spread of one book in ticks. It has no plus sign, and a negative value,
// which only a broken book can produce, keeps its minus.
export function formatSpread(ticks: number): string {
  if (!Number.isFinite(ticks)) {
    return NO_DATA;
  }
  const text = (Math.abs(ticks) / 10).toFixed(1);
  return ticks < 0 && text !== '0.0' ? `${MINUS}${text}¢` : `${text}¢`;
}

// Venue index 0 is A, 1 is B.
export function formatVenue(venue: number): string {
  return VENUE_LETTERS[venue] ?? NO_DATA;
}

// Sign of a formatSignedPrice result: 1, -1, or 0 when the text has no sign.
export function signOfFormatted(text: string): number {
  if (text.startsWith('+')) {
    return 1;
  }
  return text.startsWith(MINUS) ? -1 : 0;
}

export function formatSize(size: number): string {
  if (!Number.isFinite(size)) {
    return NO_DATA;
  }
  const sign = size < 0 ? MINUS : '';
  const value = Math.abs(size);

  if (Math.round(value) < 1000) {
    return `${sign}${Math.round(value)}`;
  }
  const thousands = value / 1000;
  if (thousands < 9.95) {
    return `${sign}${thousands.toFixed(1)}k`;
  }
  if (thousands < 999.5) {
    return `${sign}${Math.round(thousands)}k`;
  }
  const millions = value / 1_000_000;
  if (millions < 9.95) {
    return `${sign}${millions.toFixed(1)}M`;
  }
  return `${sign}${Math.round(millions)}M`;
}

// Local time HH:MM:SS of a Date.now() timestamp; 0 means no data.
export function formatClock(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) {
    return NO_DATA;
  }
  clockDate.setTime(ts);
  return `${pad2(clockDate.getHours())}:${pad2(clockDate.getMinutes())}:${pad2(clockDate.getSeconds())}`;
}

// Local time HH:MM:SS.mmm of a Date.now() timestamp; 0 means no data.
export function formatClockMs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) {
    return NO_DATA;
  }
  clockDate.setTime(ts);
  return `${formatClock(ts)}.${pad3(clockDate.getMilliseconds())}`;
}
