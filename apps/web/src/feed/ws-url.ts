import { WS_PATH } from '@trade-terminal/protocol';

const DEV_SERVER_PORT = 3001;

export function getWsUrl(): string {
  const override: unknown = import.meta.env.VITE_WS_URL;

  if (typeof override === 'string' && override.trim() !== '') {
    const url = URL.parse(override.trim());
    if (url === null || (url.protocol !== 'ws:' && url.protocol !== 'wss:')) {
      throw new Error(
        `Invalid VITE_WS_URL: expected a ws:// or wss:// URL, got "${override}"`,
      );
    }
    return url.href;
  }

  if (import.meta.env.DEV) {
    return `ws://${location.hostname}:${DEV_SERVER_PORT}${WS_PATH}`;
  }

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${WS_PATH}`;
}
