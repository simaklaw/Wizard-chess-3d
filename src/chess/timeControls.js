// Pure chess clock configuration & formatting.
// No DOM, no THREE, no engine state — safe to unit-test and reuse.

/**
 * Time control presets keyed by preset id.
 * discipline: bullet | blitz | rapid | classical | untimed
 */
export const TIME_CONTROLS = {
  bullet_1_0: { key: 'bullet_1_0', discipline: 'bullet', initialSeconds: 60, increment: 0, label: '1 min' },
  bullet_2_1: { key: 'bullet_2_1', discipline: 'bullet', initialSeconds: 120, increment: 1, label: '2 | 1' },
  blitz_3_0: { key: 'blitz_3_0', discipline: 'blitz', initialSeconds: 180, increment: 0, label: '3 min' },
  blitz_3_2: { key: 'blitz_3_2', discipline: 'blitz', initialSeconds: 180, increment: 2, label: '3 | 2' },
  blitz_5_0: { key: 'blitz_5_0', discipline: 'blitz', initialSeconds: 300, increment: 0, label: '5 min' },
  blitz_5_3: { key: 'blitz_5_3', discipline: 'blitz', initialSeconds: 300, increment: 3, label: '5 | 3' },
  rapid_10_0: { key: 'rapid_10_0', discipline: 'rapid', initialSeconds: 600, increment: 0, label: '10 min' },
  rapid_15_10: { key: 'rapid_15_10', discipline: 'rapid', initialSeconds: 900, increment: 10, label: '15 | 10' },
  rapid_30_0: { key: 'rapid_30_0', discipline: 'rapid', initialSeconds: 1800, increment: 0, label: '30 min' },
  classical_60_0: { key: 'classical_60_0', discipline: 'classical', initialSeconds: 3600, increment: 0, label: '60 min' },
  untimed: { key: 'untimed', discipline: 'untimed', initialSeconds: Infinity, increment: 0, label: 'Untimed' }
};

export const DEFAULT_TIME_CONTROL = 'rapid_10_0';

/**
 * Format remaining seconds as m:ss. Infinity / NaN renders as the untimed glyph.
 * @param {number} seconds
 * @returns {string}
 */
export function formatClockTime(seconds) {
  if (seconds === Infinity || Number.isNaN(seconds)) return '∞';
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
