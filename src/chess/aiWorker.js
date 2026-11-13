/**
 * Web Worker wrapper around the pure AI search (src/chess/aiSearch.js).
 *
 * Protocol:
 *   main -> worker: { id, state, options }
 *   worker -> main: { id, result } | { id, error }
 *
 * Keeps minimax/quiescence off the render loop so the 3D scene never stalls.
 */

import { searchBestMove } from './aiSearch.js';

self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (!data || typeof data.id !== 'number') return;
  try {
    const result = searchBestMove(data.state, data.options || {});
    self.postMessage({ id: data.id, result });
  } catch (err) {
    self.postMessage({ id: data.id, error: String((err && err.message) || err) });
  }
});
