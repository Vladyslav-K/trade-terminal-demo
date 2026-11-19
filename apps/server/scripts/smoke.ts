import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import {
  CLOSE_OVER_CAPACITY,
  CLOSE_POLICY,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_TICKS,
  PROTOCOL_VERSION,
  RATE_MAX,
  VENUE_COUNT,
  WS_PATH,
} from '@trade-terminal/protocol';
import type {
  ClientMessage,
  PriceLevel,
  ServerMessage,
  StatsMessage,
} from '@trade-terminal/protocol';
import { WebSocket } from 'ws';

import { createGateway } from '../src/gateway/gateway.ts';

const ORIGIN = 'http://localhost:3000';
const FOREIGN_ORIGIN = 'http://foreign.example';
const MAX_CONNECTIONS = 2;
const RATE_RUNS = [500, 10_000];
const RUN_MS = 3000;
const RATE_TOLERANCE = 0.1;
const MARKET_CHANGE = 10;
const MARKET_CHANGE_RUN_MS = 1000;
const FLOOD_COMMANDS = 60;
const OVERSIZED_COMMAND_BYTES = 4096;
const WAIT_TIMEOUT_MS = 5000;
const POLL_MS = 20;
// Server-side close handshakes finish slightly after the client sees them.
const SETTLE_MS = 200;
const CLOSE_MESSAGE_TOO_BIG = 1009;
const UPGRADE_FAILED = -1;
const NO_BID = 0;
const NO_ASK = PRICE_TICKS;

type MessageType = ServerMessage['t'];
type MessageOf<T extends MessageType> = Extract<ServerMessage, { t: T }>;

interface Waiter {
  type: MessageType;
  accept(message: ServerMessage): boolean;
  resolve(message: ServerMessage): void;
}

interface TestClient {
  ws: WebSocket;
  closed: Promise<number>;
  send(message: ClientMessage): void;
  next<T extends MessageType>(
    type: T,
    accept?: (message: MessageOf<T>) => boolean,
  ): Promise<MessageOf<T>>;
}

interface LocalBook {
  bids: Int32Array;
  asks: Int32Array;
  bestBid: number;
  bestAsk: number;
  seq: number;
}

interface SequenceGap {
  m: number;
  x: number;
  expected: number;
  got: number;
}

// Rebuilds every book from snapshots and deltas and counts protocol violations.
interface FeedProbe {
  books: Map<number, LocalBook>;
  markets: number;
  windowData: number;
  windowStats: number;
  lastStats: StatsMessage | null;
  gaps: number;
  lastGap: SequenceGap | null;
  crossed: number;
  badPrices: number;
  unknownBooks: number;
  snapshotMismatches: number;
}

let failures = 0;

function check(name: string, isOk: boolean, details: string): void {
  console.log(`${isOk ? 'PASS' : 'FAIL'}  ${name}: ${details}`);
  if (!isOk) {
    failures += 1;
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${label}`)),
      WAIT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(
  predicate: () => boolean,
  label: string,
): Promise<void> {
  const deadline = performance.now() + WAIT_TIMEOUT_MS;
  while (!predicate()) {
    if (performance.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(POLL_MS);
  }
}

function openClient(
  url: string,
  origin: string | undefined,
  onMessage?: (message: ServerMessage) => void,
): TestClient {
  const ws = new WebSocket(url, origin === undefined ? {} : { origin });
  const waiters = new Set<Waiter>();

  ws.on('message', (data) => {
    const message = JSON.parse(String(data)) as ServerMessage;
    onMessage?.(message);
    for (const waiter of waiters) {
      if (waiter.type === message.t && waiter.accept(message)) {
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  });
  ws.on('error', (error) => {
    console.log(`client error: ${error.message}`);
  });
  const closed = new Promise<number>((resolve) => {
    ws.on('close', (code) => resolve(code));
  });

  const next = <T extends MessageType>(
    type: T,
    accept: (message: MessageOf<T>) => boolean = () => true,
  ): Promise<MessageOf<T>> =>
    withTimeout(
      new Promise<MessageOf<T>>((resolve) => {
        waiters.add({
          type,
          accept: (message) => accept(message as MessageOf<T>),
          resolve: (message) => resolve(message as MessageOf<T>),
        });
      }),
      `"${type}" message`,
    );

  return {
    ws,
    closed,
    next,
    send: (message) => ws.send(JSON.stringify(message)),
  };
}

async function closeClient(client: TestClient): Promise<void> {
  client.ws.close();
  await withTimeout(client.closed, 'client close');
}

// Resolves with the HTTP status of the upgrade response, 101 when the socket opened.
function upgradeStatus(
  url: string,
  origin: string | undefined,
): Promise<number> {
  return withTimeout(
    new Promise<number>((resolve) => {
      const ws = new WebSocket(url, origin === undefined ? {} : { origin });
      ws.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? UPGRADE_FAILED);
        ws.terminate();
      });
      ws.on('open', () => {
        ws.once('close', () => resolve(101));
        ws.close();
      });
      ws.on('error', () => resolve(UPGRADE_FAILED));
    }),
    `upgrade response from ${url}`,
  );
}

function isValidPrice(price: number): boolean {
  return Number.isInteger(price) && price >= PRICE_MIN && price <= PRICE_MAX;
}

function findLevel(
  levels: Int32Array,
  start: number,
  step: 1 | -1,
  empty: number,
): number {
  for (
    let price = start;
    price >= PRICE_MIN && price <= PRICE_MAX;
    price += step
  ) {
    if ((levels[price] ?? 0) > 0) {
      return price;
    }
  }
  return empty;
}

function createFeedProbe(): FeedProbe & {
  handle(message: ServerMessage): void;
  resetWindow(): void;
} {
  const probe: FeedProbe = {
    books: new Map(),
    markets: 0,
    windowData: 0,
    windowStats: 0,
    lastStats: null,
    gaps: 0,
    lastGap: null,
    crossed: 0,
    badPrices: 0,
    unknownBooks: 0,
    snapshotMismatches: 0,
  };

  const applyLevels = (
    book: LocalBook,
    bids: PriceLevel[],
    asks: PriceLevel[],
  ): void => {
    for (const [price, size] of bids) {
      if (!isValidPrice(price)) {
        probe.badPrices += 1;
        continue;
      }
      book.bids[price] = size;
      if (size > 0 && price > book.bestBid) {
        book.bestBid = price;
      } else if (size === 0 && price === book.bestBid) {
        book.bestBid = findLevel(book.bids, price - 1, -1, NO_BID);
      }
    }
    for (const [price, size] of asks) {
      if (!isValidPrice(price)) {
        probe.badPrices += 1;
        continue;
      }
      book.asks[price] = size;
      if (size > 0 && price < book.bestAsk) {
        book.bestAsk = price;
      } else if (size === 0 && price === book.bestAsk) {
        book.bestAsk = findLevel(book.asks, price + 1, 1, NO_ASK);
      }
    }
    if (
      book.bestBid !== NO_BID &&
      book.bestAsk !== NO_ASK &&
      book.bestBid >= book.bestAsk
    ) {
      probe.crossed += 1;
    }
  };

  const isKnownMarket = (m: number): boolean => m >= 0 && m < probe.markets;

  const handle = (message: ServerMessage): void => {
    switch (message.t) {
      case 'hello':
      case 'cfg':
        if (message.config.markets !== probe.markets) {
          probe.markets = message.config.markets;
          probe.books.clear();
        }
        return;
      case 'snap': {
        const key = message.m * VENUE_COUNT + message.x;
        const previous = probe.books.get(key);
        if (previous !== undefined && previous.seq !== message.seq) {
          probe.snapshotMismatches += 1;
        }
        const book: LocalBook = {
          bids: new Int32Array(PRICE_TICKS),
          asks: new Int32Array(PRICE_TICKS),
          bestBid: NO_BID,
          bestAsk: NO_ASK,
          seq: message.seq,
        };
        applyLevels(book, message.bids, message.asks);
        probe.books.set(key, book);
        return;
      }
      case 'd': {
        probe.windowData += 1;
        const book = probe.books.get(message.m * VENUE_COUNT + message.x);
        if (book === undefined) {
          probe.unknownBooks += 1;
          return;
        }
        if (message.seq !== book.seq + 1) {
          probe.gaps += 1;
          probe.lastGap = {
            m: message.m,
            x: message.x,
            expected: book.seq + 1,
            got: message.seq,
          };
        }
        book.seq = message.seq;
        applyLevels(book, message.b, message.a);
        return;
      }
      case 'tr':
      case 'sig':
        probe.windowData += 1;
        if (!isKnownMarket(message.m)) {
          probe.unknownBooks += 1;
        }
        return;
      case 'stats':
        probe.windowStats += 1;
        probe.lastStats = message;
        return;
      default:
        return;
    }
  };

  const resetWindow = (): void => {
    probe.windowData = 0;
    probe.windowStats = 0;
  };

  return Object.assign(probe, { handle, resetWindow });
}

async function checkStream(url: string): Promise<void> {
  const probe = createFeedProbe();
  const client = openClient(url, ORIGIN, probe.handle);

  const hello = await client.next('hello');
  check(
    'hello',
    hello.v === PROTOCOL_VERSION &&
      hello.markets.length === hello.config.markets,
    `protocol v${hello.v}, ${hello.config.markets} markets, ${hello.config.rate} msg/s`,
  );
  await waitUntil(
    () => probe.books.size === hello.config.markets * VENUE_COUNT,
    'initial snapshots',
  );

  for (const rate of RATE_RUNS) {
    client.send({ t: 'set', rate });
    await client.next('cfg', (message) => message.config.rate === rate);
    probe.resetWindow();
    const startedAt = performance.now();
    await delay(RUN_MS);
    const received =
      (probe.windowData * 1000) / (performance.now() - startedAt);
    check(
      `rate ${rate} msg/s`,
      Math.abs(received - rate) <= rate * RATE_TOLERANCE,
      `received ${Math.round(received)} msg/s, server reported ${probe.lastStats?.sent ?? 'nothing'}`,
    );
    check(
      `stats at ${rate} msg/s`,
      probe.windowStats >= Math.floor(RUN_MS / 1000) - 1 &&
        probe.lastStats?.rate === rate,
      `${probe.windowStats} stats messages, last ${JSON.stringify(probe.lastStats)}`,
    );
  }

  client.send({ t: 'resync', m: 0, x: 1 });
  const snapshot = await client.next(
    'snap',
    (message) => message.m === 0 && message.x === 1,
  );
  check(
    'resync',
    probe.snapshotMismatches === 0,
    `snapshot seq ${snapshot.seq}, mismatches ${probe.snapshotMismatches}`,
  );

  client.send({ t: 'set', markets: MARKET_CHANGE });
  const config = await client.next(
    'cfg',
    (message) => message.config.markets === MARKET_CHANGE,
  );
  await waitUntil(
    () => probe.books.size === MARKET_CHANGE * VENUE_COUNT,
    'snapshots after the market change',
  );
  await delay(MARKET_CHANGE_RUN_MS);
  check(
    'market change',
    config.markets.length === MARKET_CHANGE && probe.unknownBooks === 0,
    `${config.markets.length} markets, ${probe.books.size} books, ${probe.unknownBooks} messages for unknown books`,
  );

  check('sequence', probe.gaps === 0, `${probe.gaps} gaps`);
  check(
    'books',
    probe.crossed === 0 && probe.badPrices === 0,
    `${probe.crossed} crossed updates, ${probe.badPrices} prices out of range`,
  );

  await closeClient(client);
}

async function checkDroppedDelta(url: string): Promise<void> {
  const probe = createFeedProbe();
  const client = openClient(url, ORIGIN, probe.handle);

  const hello = await client.next('hello');
  await waitUntil(
    () => probe.books.size === hello.config.markets * VENUE_COUNT,
    'initial snapshots',
  );

  // The first delta comes from a busy book, so its next delta follows soon.
  const { m, x } = await client.next('d');
  client.send({ t: 'fault', kind: 'drop', m, x });
  await waitUntil(() => probe.gaps > 0, 'the gap after a dropped delta');
  const gap = probe.lastGap;
  check(
    'dropped delta',
    probe.gaps === 1 &&
      gap !== null &&
      gap.m === m &&
      gap.x === x &&
      gap.got === gap.expected + 1,
    `book ${m}/${x}, ${probe.gaps} gap(s), last ${JSON.stringify(gap)}`,
  );

  client.send({ t: 'resync', m, x });
  const snapshot = await client.next(
    'snap',
    (message) => message.m === m && message.x === x,
  );
  check(
    'resync after a dropped delta',
    gap !== null && snapshot.seq >= gap.expected,
    `snapshot seq ${snapshot.seq}, dropped seq ${gap?.expected ?? 'none'}`,
  );

  await closeClient(client);
}

async function checkUpgrades(url: string, port: number): Promise<void> {
  const foreign = await upgradeStatus(url, FOREIGN_ORIGIN);
  check('foreign origin rejected', foreign === 403, `HTTP ${foreign}`);

  const missing = await upgradeStatus(url, undefined);
  check('missing origin rejected', missing === 403, `HTTP ${missing}`);

  const sameOrigin = await upgradeStatus(url, `http://127.0.0.1:${port}`);
  check('same origin accepted', sameOrigin === 101, `HTTP ${sameOrigin}`);

  const wrongPath = await upgradeStatus(`ws://127.0.0.1:${port}/other`, ORIGIN);
  check('unknown path rejected', wrongPath === 404, `HTTP ${wrongPath}`);
  await delay(SETTLE_MS);

  const clients = Array.from({ length: MAX_CONNECTIONS }, () =>
    openClient(url, ORIGIN),
  );
  await Promise.all(clients.map((client) => client.next('hello')));
  const extra = openClient(url, ORIGIN);
  const code = await withTimeout(extra.closed, 'over-capacity close');
  check(
    'connection over the limit rejected',
    code === CLOSE_OVER_CAPACITY,
    `close code ${code}`,
  );
  await Promise.all(clients.map(closeClient));
  await delay(SETTLE_MS);
}

async function checkCommands(url: string): Promise<void> {
  const client = openClient(url, ORIGIN);
  await client.next('hello');

  client.ws.send('not json');
  const error = await client.next('err');
  check(
    'invalid command answered',
    error.code === 'invalid',
    `err ${error.code}`,
  );

  client.send({ t: 'ping', id: 7 });
  const pong = await client.next('pong', (message) => message.id === 7);
  check(
    'connection survives an invalid command',
    client.ws.readyState === WebSocket.OPEN,
    `pong ${pong.id}`,
  );

  for (let id = 0; id < FLOOD_COMMANDS; id++) {
    client.send({ t: 'ping', id });
  }
  const floodCode = await withTimeout(client.closed, 'command flood close');
  check(
    'command flood closes the connection',
    floodCode === CLOSE_POLICY,
    `close code ${floodCode}`,
  );
  await delay(SETTLE_MS);

  const oversized = openClient(url, ORIGIN);
  await oversized.next('hello');
  oversized.ws.send('x'.repeat(OVERSIZED_COMMAND_BYTES));
  const oversizedCode = await withTimeout(oversized.closed, 'oversized close');
  check(
    'oversized command closes the connection',
    oversizedCode === CLOSE_MESSAGE_TOO_BIG,
    `close code ${oversizedCode}`,
  );
}

async function main(): Promise<void> {
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const gateway = createGateway(server, {
    allowedOrigins: [ORIGIN],
    maxConnections: MAX_CONNECTIONS,
    maxRate: RATE_MAX,
    seed: null,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const url = `ws://127.0.0.1:${port}${WS_PATH}`;

  try {
    await checkStream(url);
    await checkDroppedDelta(url);
    await checkUpgrades(url, port);
    await checkCommands(url);
  } finally {
    await gateway.close();
    server.close();
  }
}

main().then(
  () => {
    console.log(
      failures === 0 ? 'smoke passed' : `smoke failed: ${failures} check(s)`,
    );
    process.exit(failures === 0 ? 0 : 1);
  },
  (error: unknown) => {
    console.error('smoke crashed:', error);
    process.exit(1);
  },
);
