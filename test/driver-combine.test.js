import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLevelDelayPolarity, sumResponses, distanceMmToDelayMs } from '../src/driver-combine.js';
import { complexMagnitude, fromPolar } from '../src/complex.js';

const freqs = [100, 1000, 5000, 15000];

test('two identical in-phase sources sum to +6.02 dB (doubled pressure)', () => {
  const response = freqs.map(() => fromPolar(1, 30));
  const summed = sumResponses([response, response]);
  for (let i = 0; i < freqs.length; i++) {
    const gainDb = 20 * Math.log10(complexMagnitude(summed[i]) / complexMagnitude(response[i]));
    assert.ok(Math.abs(gainDb - 20 * Math.log10(2)) < 1e-9, `expected +6.02 dB at ${freqs[i]} Hz, got ${gainDb}`);
  }
});

test('an inverted identical source cancels an in-phase one to silence', () => {
  const response = freqs.map(() => fromPolar(1, 47));
  const inverted = applyLevelDelayPolarity(freqs, response, { invertPolarity: true });
  const summed = sumResponses([response, inverted]);
  for (const [re, im] of summed) {
    assert.ok(Math.hypot(re, im) < 1e-9, 'expected near-perfect cancellation');
  }
});

test('a level trim of -6.02 dB halves the magnitude without touching phase', () => {
  const response = freqs.map(() => fromPolar(1, -12));
  const trimmed = applyLevelDelayPolarity(freqs, response, { levelDb: 20 * Math.log10(0.5) });
  for (let i = 0; i < freqs.length; i++) {
    assert.ok(Math.abs(complexMagnitude(trimmed[i]) - 0.5) < 1e-6);
    const phaseDeg = (Math.atan2(trimmed[i][1], trimmed[i][0]) * 180) / Math.PI;
    assert.ok(Math.abs(phaseDeg - -12) < 1e-6);
  }
});

test('a delay of exactly one period at a given frequency is equivalent to no delay', () => {
  const frequencyHz = 2000;
  const periodMs = 1000 / frequencyHz;
  const response = [fromPolar(1, 25)];
  const delayed = applyLevelDelayPolarity([frequencyHz], response, { delayMs: periodMs });
  assert.ok(Math.abs(delayed[0][0] - response[0][0]) < 1e-9);
  assert.ok(Math.abs(delayed[0][1] - response[0][1]) < 1e-9);
});

test('a delay of a quarter period shifts phase by -90 degrees', () => {
  const frequencyHz = 1000;
  const quarterPeriodMs = 1000 / frequencyHz / 4;
  const response = [fromPolar(1, 0)];
  const delayed = applyLevelDelayPolarity([frequencyHz], response, { delayMs: quarterPeriodMs });
  const phaseDeg = (Math.atan2(delayed[0][1], delayed[0][0]) * 180) / Math.PI;
  assert.ok(Math.abs(phaseDeg - -90) < 1e-9);
});

test('distanceMmToDelayMs: sound travels 343mm in 1ms', () => {
  assert.ok(Math.abs(distanceMmToDelayMs(343) - 1) < 1e-12);
});

test('sumResponses with a single driver is the identity', () => {
  const response = freqs.map((f) => fromPolar(1, f / 100));
  const summed = sumResponses([response]);
  for (let i = 0; i < freqs.length; i++) {
    assert.deepEqual(summed[i], response[i]);
  }
});
