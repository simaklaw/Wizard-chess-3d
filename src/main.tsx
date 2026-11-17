import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Offline support: register the service worker. Skipped on localhost so the
// dev server never serves stale cached assets.
const swSupported = 'serviceWorker' in navigator;
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
if (swSupported && !isLocalDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href).href).catch(() => {
      /* offline caching is best-effort */
    });
  });
}
