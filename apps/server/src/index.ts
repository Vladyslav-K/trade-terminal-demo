import { createServer } from 'node:http';

import { readConfig } from './config.ts';
import { createGateway } from './gateway/gateway.ts';

const SHUTDOWN_TIMEOUT_MS = 5000;

const config = readConfig(process.env);

const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const gateway = createGateway(server, config);

server.listen(config.port, config.host, () => {
  console.log(`listening on http://${config.host}:${config.port}`);
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`${signal} received, shutting down`);

  setTimeout(() => {
    console.error('shutdown timed out');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  void gateway.close().then(() => {
    server.close(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
