import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';

const INDEX_FILE = 'index.html';
const ASSETS_DIR = 'assets';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.map', 'application/json; charset=utf-8'],
]);
// A client that disconnects mid-download is not a server error.
const ABORTED_STREAM_CODE = 'ERR_STREAM_PREMATURE_CLOSE';
// Errors that mean the requested file is simply not there.
const MISSING_FILE_CODES = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);

interface OpenedFile {
  handle: FileHandle;
  size: number;
}

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => void;

function sendStatus(
  res: ServerResponse,
  status: number,
  text: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    MISSING_FILE_CODES.has(error.code)
  );
}

// Resolves to null when there is no regular file at the path.
async function openFile(filePath: string): Promise<OpenedFile | null> {
  let handle: FileHandle;
  try {
    handle = await open(filePath, 'r');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    if (info.isFile()) {
      return { handle, size: info.size };
    }
  } catch (error) {
    await handle.close();
    throw error;
  }
  await handle.close();
  return null;
}

function closeFile(handle: FileHandle): void {
  handle.close().catch((error: unknown) => {
    console.error(`static file close failed: ${describeError(error)}`);
  });
}

// pipeline passes undefined, not null, when the stream finished cleanly.
function handleStreamEnd(
  error: NodeJS.ErrnoException | null | undefined,
): void {
  if (error instanceof Error && error.code !== ABORTED_STREAM_CODE) {
    console.error(`static file stream error: ${error.message}`);
  }
}

function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: OpenedFile,
  relativePath: string,
): void {
  const isAsset = relativePath.startsWith(ASSETS_DIR + path.sep);
  res.writeHead(200, {
    'Content-Type':
      CONTENT_TYPES.get(path.extname(relativePath).toLowerCase()) ??
      DEFAULT_CONTENT_TYPE,
    'Content-Length': file.size,
    'Cache-Control': isAsset ? IMMUTABLE_CACHE : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });

  if (req.method === 'HEAD') {
    res.end();
    closeFile(file.handle);
    return;
  }
  pipeline(file.handle.createReadStream(), res, handleStreamEnd);
}

// Serves the built frontend from root; unknown paths without a file
// extension get index.html so client-side routes survive a reload.
export function createStaticHandler(root: string): StaticHandler {
  const rootPrefix = root + path.sep;

  const serve = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendStatus(res, 405, 'method not allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    } catch {
      sendStatus(res, 400, 'bad request');
      return;
    }
    if (decoded.includes('\0')) {
      sendStatus(res, 400, 'bad request');
      return;
    }

    // Normalizing a rooted path drops every ".." that would climb above it.
    const requested = path.normalize(`/${decoded}`).slice(1);
    const filePath = path.resolve(
      root,
      requested === '' ? INDEX_FILE : requested,
    );
    if (!filePath.startsWith(rootPrefix)) {
      sendStatus(res, 403, 'forbidden');
      return;
    }

    const relativePath = filePath.slice(rootPrefix.length);
    const file = await openFile(filePath);
    if (file !== null) {
      sendFile(req, res, file, relativePath);
      return;
    }

    const index =
      path.extname(relativePath) === ''
        ? await openFile(path.join(root, INDEX_FILE))
        : null;
    if (index === null) {
      sendStatus(res, 404, 'not found');
      return;
    }
    sendFile(req, res, index, INDEX_FILE);
  };

  return (req, res) => {
    serve(req, res).catch((error: unknown) => {
      console.error(`static request failed: ${describeError(error)}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendStatus(res, 500, 'internal server error');
    });
  };
}
