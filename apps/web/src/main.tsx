import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { startFeed } from './feed/feed-client.ts';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

startFeed();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
