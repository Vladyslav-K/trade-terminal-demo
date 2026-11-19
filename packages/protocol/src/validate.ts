import { MARKET_COUNTS, RATE_MAX, RATE_MIN, VENUE_COUNT } from './constants.ts';
import type {
  ClientMessage,
  FaultMessage,
  PingMessage,
  ResyncMessage,
  SetMessage,
} from './messages.ts';

const PING_ID_MAX = 2 ** 31 - 1;

type JsonObject = Record<string, unknown>;

interface BookRef {
  m: number;
  x: number;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readField(source: JsonObject, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

function isIntBetween(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function parseBookRef(source: JsonObject, marketCount: number): BookRef | null {
  const m = readField(source, 'm');
  const x = readField(source, 'x');
  if (
    !isIntBetween(m, 0, marketCount - 1) ||
    !isIntBetween(x, 0, VENUE_COUNT - 1)
  ) {
    return null;
  }
  return { m, x };
}

function parsePing(source: JsonObject): PingMessage | null {
  const id = readField(source, 'id');
  return isIntBetween(id, 0, PING_ID_MAX) ? { t: 'ping', id } : null;
}

function parseSet(source: JsonObject): SetMessage | null {
  const message: SetMessage = { t: 'set' };

  const rate = readField(source, 'rate');
  if (rate !== undefined) {
    if (!isIntBetween(rate, RATE_MIN, RATE_MAX)) {
      return null;
    }
    message.rate = rate;
  }

  const markets = readField(source, 'markets');
  if (markets !== undefined) {
    if (typeof markets !== 'number' || !MARKET_COUNTS.includes(markets)) {
      return null;
    }
    message.markets = markets;
  }

  return message;
}

function parseResync(
  source: JsonObject,
  marketCount: number,
): ResyncMessage | null {
  const book = parseBookRef(source, marketCount);
  return book ? { t: 'resync', m: book.m, x: book.x } : null;
}

function parseFault(
  source: JsonObject,
  marketCount: number,
): FaultMessage | null {
  const kind = readField(source, 'kind');
  if (kind === 'disconnect' || kind === 'stall') {
    return { t: 'fault', kind };
  }
  if (kind !== 'drop') {
    return null;
  }
  const book = parseBookRef(source, marketCount);
  return book ? { t: 'fault', kind: 'drop', m: book.m, x: book.x } : null;
}

// Returns a new object with known fields only; foreign keys are dropped.
export function parseClientMessage(
  raw: string,
  marketCount: number,
): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isJsonObject(data)) {
    return null;
  }

  switch (readField(data, 't')) {
    case 'ping':
      return parsePing(data);
    case 'set':
      return parseSet(data);
    case 'resync':
      return parseResync(data, marketCount);
    case 'fault':
      return parseFault(data, marketCount);
    default:
      return null;
  }
}
