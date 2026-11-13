import test from 'node:test';
import assert from 'node:assert/strict';

import { TIME_CONTROLS, DEFAULT_TIME_CONTROL, formatClockTime } from '../src/chess/timeControls.js';

test('TIME_CONTROLS covers all five disciplines with sane values', () => {
  const disciplines = new Set(Object.values(TIME_CONTROLS).map((c) => c.discipline));
  for (const d of ['bullet', 'blitz', 'rapid', 'classical', 'untimed']) {
    assert.ok(disciplines.has(d), `missing discipline ${d}`);
  }
  for (const [key, cfg] of Object.entries(TIME_CONTROLS)) {
    assert.equal(cfg.key, key, `key mismatch for ${key}`);
    assert.ok(cfg.initialSeconds > 0, `non-positive initialSeconds for ${key}`);
    assert.ok(cfg.increment >= 0, `negative increment for ${key}`);
    assert.ok(typeof cfg.label === 'string' && cfg.label.length > 0, `missing label for ${key}`);
  }
  assert.equal(TIME_CONTROLS.untimed.initialSeconds, Infinity);
});

test('DEFAULT_TIME_CONTROL is a valid preset', () => {
  assert.ok(TIME_CONTROLS[DEFAULT_TIME_CONTROL], 'DEFAULT_TIME_CONTROL must be a TIME_CONTROLS key');
  assert.equal(DEFAULT_TIME_CONTROL, 'rapid_10_0');
});

test('formatClockTime formats m:ss and handles untimed / edge cases', () => {
  assert.equal(formatClockTime(600), '10:00');
  assert.equal(formatClockTime(65), '1:05');
  assert.equal(formatClockTime(9.2), '0:10');
  assert.equal(formatClockTime(0), '0:00');
  assert.equal(formatClockTime(-5), '0:00');
  assert.equal(formatClockTime(3600), '60:00');
  assert.equal(formatClockTime(Infinity), '∞');
  assert.equal(formatClockTime(NaN), '∞');
});
