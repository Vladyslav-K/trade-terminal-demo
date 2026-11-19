import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { startFeed } from './feed/feed-client.ts';
import './index.css';
import { perfMonitor } from './perf/perf-monitor.ts';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

startFeed();
perfMonitor.start();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
