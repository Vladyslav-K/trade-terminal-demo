# Realtime Market Terminal

## What this is

A demo of a real-time trading terminal for prediction markets. The backend simulates up to 200 markets on two venues (Northbook and Kestrel) and streams randomized order book updates, trades and signals over a WebSocket at 100 to 20,000 messages per second. The frontend processes the stream and renders tables, an order book and charts.

The demo answers one question with numbers: how many messages per second the frontend sustains without degrading, and where the limit is. The built-in benchmark ramps the feed and reports that limit for the machine and browser it runs on.

## Quick start

Requirements: Node.js 24 and pnpm 12.21.

```sh
pnpm install
pnpm dev
```

- Frontend: http://localhost:3000
- Server: http://localhost:3001 (WebSocket `ws://localhost:3001/ws`, health check `GET /health`)

In dev both servers listen on all interfaces (`0.0.0.0`), so the demo also opens from outside a container. Outside the dev script the server binds to `127.0.0.1` unless `HOST` says otherwise.

Other commands:

| Command                                      | What it does                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm format`                                | Formats the code with Prettier                                   |
| `pnpm check-errors`                          | Runs ESLint and the TypeScript type check                        |
| `pnpm --filter @trade-terminal/server smoke` | Starts the gateway on a free port and checks the feed end to end |

## Production build

In production the server serves the built frontend itself: one process, one port, one origin.

```sh
pnpm build
WEB_DIST="$PWD/apps/web/dist" pnpm start
```

Open http://localhost:3001.

`WEB_DIST` must be an absolute path: pnpm starts the server from `apps/server`, so a relative path would point to the wrong place. The server ignores a relative or missing path, logs `WEB_DIST ignored: <reason>` and keeps serving the feed without the frontend. To accept connections from other machines, also set `HOST=0.0.0.0`.

## Docker

```sh
docker compose up --build
```

Open http://localhost:3001.

The image builds the frontend and starts the server with `HOST=0.0.0.0`, `PORT=3001` and `WEB_DIST=/app/apps/web/dist`. `docker-compose.yml` passes `ALLOWED_ORIGINS`, `MAX_CONNECTIONS` and `MAX_RATE` from the shell or from a `.env` file next to it, with defaults otherwise:

```sh
MAX_RATE=5000 MAX_CONNECTIONS=10 docker compose up --build
```

Without Compose:

```sh
docker build -t realtime-market-terminal .
docker run --rm -p 3001:3001 realtime-market-terminal
```

## Configuration

All settings are environment variables with defaults in code. The server stops with an error message when a number is out of range.

| Variable          | Default                                       | Description                                                                                                                                                                        |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | `3001`                                        | HTTP and WebSocket port, 1–65535.                                                                                                                                                  |
| `HOST`            | `127.0.0.1`                                   | Interface to bind. The dev script and the Docker image use `0.0.0.0`.                                                                                                              |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated `http(s)` origins that may open the WebSocket besides the page's own origin. An empty value allows only the same origin. Compose default: `http://localhost:3001`. |
| `MAX_CONNECTIONS` | `4`                                           | Simultaneous WebSocket connections, 1–100. Extra connections are closed with code `1013`.                                                                                          |
| `MAX_RATE`        | `20000`                                       | Highest rate in messages per second a client may request. At least `50`; values above `20000` are capped to `20000`.                                                               |
| `SEED`            | not set                                       | Simulation seed, 0–4294967295. Not set: every connection gets a random seed. Set: every connection replays the same sequence.                                                      |
| `WEB_DIST`        | not set                                       | Absolute path to the built frontend. Not set: the server serves only `/health` and `/ws`.                                                                                          |
| `VITE_WS_URL`     | not set                                       | Frontend build-time override of the WebSocket address, `ws://` or `wss://`. Not set: `ws://<host>:3001/ws` in dev and the page's own origin (`wss://` on HTTPS) in production.     |

The WebSocket handshake requires an `Origin` header that matches the page's own host or `ALLOWED_ORIGINS`; anything else gets `403`. In production the page and the WebSocket share one origin, so `ALLOWED_ORIGINS` is only needed for other domains.

## What you see

The screen is a fixed grid for desktop windows from 1280×738.

- **Top bar** — connection state (`CONNECTING`, `LIVE`, `STALE`, `RECONNECTING`, `OFFLINE`, `INCOMPATIBLE`), incoming messages per second, FPS and the p95 time from the server timestamp to the screen.
- **Markets** — a virtualized table of all markets: implied probability, its change over 60 seconds, best bid and ask across both venues, executable edge between the venues and a 60-second sparkline. Sort by edge, probability, shift or volume; the order freezes while the pointer is over the table. A click selects the market for the other panels.
- **Probability** — one-second candles of the selected market's probability, drawn with KLineChart. History starts when the page connects and keeps the last 10 minutes.
- **Depth (both venues)** — cumulative bid and ask depth of the selected market across both venues, drawn on canvas.
- **Order Book** — the top 10 bid and ask levels of the selected market on each venue with sizes, running totals, depth bars and the spread.
- **Trades** — the latest trades of the selected market, newest on top.
- **Signals** — cross-venue edge and fast probability moves across all markets. A click selects the market.
- **Performance** — FPS, frame time p99, long tasks, JS heap, incoming and server-sent rates, ingest p95, to-screen p95, worker busy time and book integrity, plus 60-second charts of FPS and messages per second.
- **Load** — the message rate (slider and presets), the number of markets (10 to 200) and the order size used for the edge calculation.
- **Fault injection** — drop one order book delta, close the connection, or stall the server for 10 seconds, with counters of gaps, resyncs and reconnects.
- **Benchmark** — the automatic ramp described below.
- **Event log** — connection events, gaps, resyncs and injected faults.

When data stops arriving, the data panels show an overlay with the age of the last update or the reconnect countdown.

## How it works

- **The worker owns the stream.** A Web Worker holds the WebSocket, parses every message and applies it to order books stored in preallocated typed arrays. The main thread never touches the socket or the raw messages.
- **Sequence numbers and resync.** Every order book delta carries a per-book sequence number. On a gap the worker marks that book as out of sync, ignores its deltas and requests a fresh snapshot. On a lost connection it reconnects with exponential backoff and jitter and resyncs every book. A ping every second measures round-trip time and the clock offset to the server; no data for 3 seconds marks the feed stale, 6 seconds drops the connection.
- **Conflation.** The worker computes market metrics (best prices, probability, 60-second shift, executable edge for the chosen order size) only for markets that changed, and only when a frame is requested, not on every message. At 20,000 messages per second and 60 frames per second this is hundreds of times less work.
- **Pull once per frame.** The main thread asks the worker for a frame from `requestAnimationFrame`, with at most one request in flight. The worker answers with typed arrays moved by transfer, without copying. In a background tab the frame loop stops and nothing piles up: the worker keeps its state current, and the first frame after the tab returns is already up to date.
- **Hot store.** Frames land in a small mutable store on the main thread with subscriptions per market and per topic. Stream data never enters React state, Context or Zustand; Zustand holds only cold state such as the selection, configuration and connection status.
- **Direct DOM writes.** Table cells, order book ladders, the trades tape and metrics are rendered once and then updated by writing `textContent` and `transform` through refs. Only the cells whose text changed are touched, and highlights animate only `opacity` and `transform`. The signals feed is the only stream panel rendered by React; it refreshes at most four times per second.
- **Canvas.** The depth chart, sparklines and metric charts are drawn on canvas. The probability chart uses KLineChart, which also draws on canvas.
- **Fixed memory.** History buffers are fixed-size ring buffers, so memory does not grow with the length of the session.

## Reading the benchmark

Press **Run benchmark** in the Benchmark panel. The run:

1. Sets the feed to 50 messages per second, waits 1 second and measures the baseline FPS for 2 seconds. The baseline is the display refresh rate (60, 120, 144 Hz).
2. Steps through 100, 250, 500, 1k, 2.5k, 5k, 10k and 20k messages per second (steps above `MAX_RATE` are skipped). Each step has 2 seconds of warm-up and 8 seconds of measurement.
3. Stops after the first `FAIL` and restores the rate that was set before the run.

A full run takes about 83 seconds. Hiding the tab, losing the connection or pressing **Cancel** aborts it.

Each step gets a verdict:

| Verdict    | Conditions                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PASS`     | FPS ≥ 90% of the baseline, data on screen within 100 ms (to-screen p95), ≥ 95% of the target rate received, long tasks ≤ 400 ms per 8 s. |
| `DEGRADED` | Not `PASS`, but FPS ≥ 50% of the baseline, data on screen within 1 s, ≥ 80% of the target rate received.                                 |
| `FAIL`     | Anything worse.                                                                                                                          |

The long task condition is skipped in browsers that do not report long tasks.

**Sustained limit** is the highest step that passed together with every step below it. `below 100 msg/s` means the first step did not pass; `(highest tested)` means every step passed.

The `server-limited` note marks a step where the server sent less than 95% of the target rate. The generator or the channel fell short at that step, not the frontend, so the step says nothing about the frontend's limit.

**View report** opens the full table: target and received rates, average FPS, frame p99, long tasks, ingest p95, to-screen p95, worker busy time, verdict and note. The first line records the browser, CPU cores, refresh rate and number of markets. **Copy as Markdown** copies the report.

Run the benchmark in a visible window on the hardware you care about. In a background tab or a headless browser the FPS numbers mean nothing.

## Limitations

- The data is synthetic: the simulation generates plausible prediction markets, not real ones.
- Locally there is no network latency; a remote server adds it to the to-screen time.
- The server sends one WebSocket frame per message, without batching or compression.
- There is no authentication.
- There is no order execution; the terminal only displays data.
- Multiple windows and draggable panels are not implemented.
- `Long tasks` and `Heap` are available only in Chromium-based browsers; elsewhere they show `n/a`.
- Benchmark results depend on the machine and the browser; the report records the environment for that reason.
- The layout targets desktop windows of at least 1280×738; smaller windows scroll.
