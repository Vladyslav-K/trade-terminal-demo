import { STATUS_CODES } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { randomInt } from 'node:crypto';
import type { Duplex } from 'node:stream';

import {
  CLOSE_OVER_CAPACITY,
  CLOSE_RESTART,
  WS_PATH,
} from '@trade-terminal/protocol';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import type { ServerConfig } from '../config.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';

const MAX_PAYLOAD_BYTES = 2048;
const HEARTBEAT_INTERVAL_MS = 15_000;
// Sockets that did not finish the close handshake by then are terminated.
const CLOSE_GRACE_MS = 1000;
const SEED_RANGE = 2 ** 32;

export type GatewayConfig = Pick<
  ServerConfig,
  'allowedOrigins' | 'maxConnections' | 'maxRate' | 'seed'
>;

export interface Gateway {
  // Resolves once every socket is closed.
  close(): Promise<void>;
}

function rejectUpgrade(socket: Duplex, status: number): void {
  socket.once('finish', () => socket.destroy());
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}\r\n` +
      'Connection: close\r\nContent-Length: 0\r\n\r\n',
  );
}

function handleSocketError(error: Error): void {
  console.error(`upgrade socket error: ${error.message}`);
}

export function createGateway(
  httpServer: Server,
  config: GatewayConfig,
): Gateway {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const allowedOrigins = new Set(config.allowedOrigins);
  const sessions = new Set<Session>();

  // Origin is required; it must be allow-listed or match the requested host.
  const isOriginAllowed = (request: IncomingMessage): boolean => {
    const { origin, host } = request.headers;
    if (origin === undefined) {
      return false;
    }
    if (allowedOrigins.has(origin)) {
      return true;
    }
    const url = URL.parse(origin);
    return (
      url !== null &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      host !== undefined &&
      url.host === host.toLowerCase()
    );
  };

  const handleConnection = (ws: WebSocket): void => {
    if (sessions.size >= config.maxConnections) {
      ws.on('error', (error) => {
        console.error(`rejected socket error: ${error.message}`);
      });
      ws.close(CLOSE_OVER_CAPACITY, 'server is at capacity');
      return;
    }

    const session = createSession(ws, {
      maxRate: config.maxRate,
      seed: config.seed ?? randomInt(SEED_RANGE),
      onClose: (code) => {
        sessions.delete(session);
        console.log(`session closed (${code})`);
      },
    });
    sessions.add(session);
    console.log(`session opened (${sessions.size}/${config.maxConnections})`);
  };

  const handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    socket.on('error', handleSocketError);

    const path = (request.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      rejectUpgrade(socket, 404);
      return;
    }
    if (!isOriginAllowed(request)) {
      rejectUpgrade(socket, 403);
      return;
    }

    socket.off('error', handleSocketError);
    wss.handleUpgrade(request, socket, head, handleConnection);
  };

  httpServer.on('upgrade', handleUpgrade);

  const heartbeatTimer = setInterval(() => {
    for (const session of sessions) {
      session.heartbeat();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      clearInterval(heartbeatTimer);
      httpServer.off('upgrade', handleUpgrade);
      for (const session of sessions) {
        session.close(CLOSE_RESTART, 'server is restarting');
      }
      const forceTimer = setTimeout(() => {
        for (const client of wss.clients) {
          client.terminate();
        }
      }, CLOSE_GRACE_MS);
      wss.close(() => {
        clearTimeout(forceTimer);
        resolve();
      });
    });

  return { close };
}
