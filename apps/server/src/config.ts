import { RATE_MAX, RATE_MIN } from '@trade-terminal/protocol';

export interface ServerConfig {
  port: number;
  host: string;
  // Normalized origins (scheme://host[:port]) allowed besides the same origin.
  allowedOrigins: string[];
  maxConnections: number;
  maxRate: number;
  // null means every session gets its own random seed.
  seed: number | null;
}

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
const DEFAULT_MAX_CONNECTIONS = 4;
const MAX_CONNECTIONS_LIMIT = 100;
const SEED_MAX = 2 ** 32 - 1;
const DIGITS = /^\d+$/;

function isSet(raw: string | undefined): raw is string {
  return raw !== undefined && raw.trim() !== '';
}

function readInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!isSet(raw)) {
    return fallback;
  }
  const text = raw.trim();
  const value = Number(text);
  if (!DIGITS.test(text) || value < min || value > max) {
    const range =
      max === Number.MAX_SAFE_INTEGER
        ? `${min} or more`
        : `from ${min} to ${max}`;
    throw new Error(
      `Invalid ${name}: expected an integer ${range}, got "${raw}"`,
    );
  }
  return value;
}

function toOrigin(entry: string): string {
  const url = URL.parse(entry);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(
      `Invalid ALLOWED_ORIGINS entry: expected an http(s) origin, got "${entry}"`,
    );
  }
  return url.origin;
}

// An empty ALLOWED_ORIGINS leaves only same-origin connections.
function readOrigins(raw: string | undefined): string[] {
  return (raw ?? DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map(toOrigin);
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return {
    port: readInt('PORT', env.PORT, DEFAULT_PORT, 1, 65535),
    host: isSet(env.HOST) ? env.HOST.trim() : DEFAULT_HOST,
    allowedOrigins: readOrigins(env.ALLOWED_ORIGINS),
    maxConnections: readInt(
      'MAX_CONNECTIONS',
      env.MAX_CONNECTIONS,
      DEFAULT_MAX_CONNECTIONS,
      1,
      MAX_CONNECTIONS_LIMIT,
    ),
    maxRate: Math.min(
      readInt(
        'MAX_RATE',
        env.MAX_RATE,
        RATE_MAX,
        RATE_MIN,
        Number.MAX_SAFE_INTEGER,
      ),
      RATE_MAX,
    ),
    seed: isSet(env.SEED) ? readInt('SEED', env.SEED, 0, 0, SEED_MAX) : null,
  };
}
