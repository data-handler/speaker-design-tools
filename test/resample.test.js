import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resampleMagnitudePhase } from '../src/resample.js';

test('resampling onto the exact same frequency grid returns the same values', () => {
  const measured = {
    frequenciesHz: [20, 100, 1000, 10000],
    magnitudeDb: [80, 85, 83, 70],
    phaseDeg: [170, 120, -45, -170],
  };
  const { magnitudeDb, phaseDeg } = resampleMagnitudePhase(measured, measured.frequenciesHz);
  assert.deepEqual(Array.from(magnitudeDb), measured.magnitudeDb);
  // Phase may be shifted by a multiple of 360 by unwrapping, but must match modulo 360.
  for (let i = 0; i < phaseDeg.length; i++) {
    const diff = ((phaseDeg[i] - measured.phaseDeg[i] + 540) % 360) - 180;
    assert.ok(Math.abs(diff) < 1e-9, `phase mismatch at ${i}: ${phaseDeg[i]} vs ${measured.phaseDeg[i]}`);
  }
});

test('interpolates magnitude linearly in dB against log-frequency', () => {
  // Magnitude falls by exactly 20 dB per decade: construct it that way and
  // check the midpoint (in log-frequency, i.e. sqrt(20*2000)) lands exactly
  // halfway between the endpoints.
  const measured = { frequenciesHz: [20, 2000], magnitudeDb: [80, 60], phaseDeg: [0, 0] };
  const midFreq = Math.sqrt(20 * 2000);
  const { magnitudeDb } = resampleMagnitudePhase(measured, [midFreq]);
  assert.ok(Math.abs(magnitudeDb[0] - 70) < 1e-9, `expected 70 dB at the log-midpoint, got ${magnitudeDb[0]}`);
});

test('unwraps phase across the +-180 degree boundary instead of jumping', () => {
  // Phase crossing from 170 to -170 is really only a 20 degree change
  // (170 -> 180 -> 190 == -170), not a 340 degree jump.
  const measured = { frequenciesHz: [100, 200], magnitudeDb: [80, 80], phaseDeg: [170, -170] };
  const { phaseDeg } = resampleMagnitudePhase(measured, [Math.sqrt(100 * 200)]);
  assert.ok(Math.abs(phaseDeg[0] - 180) < 1e-9, `expected ~180 degrees at the midpoint, got ${phaseDeg[0]}`);
});

test('clamps to the nearest endpoint outside the measured range (flat extrapolation)', () => {
  const measured = { frequenciesHz: [20, 1000], magnitudeDb: [80, 60], phaseDeg: [10, -10] };
  const { magnitudeDb, phaseDeg } = resampleMagnitudePhase(measured, [5, 50000]);
  assert.equal(magnitudeDb[0], 80);
  assert.equal(magnitudeDb[1], 60);
  assert.equal(phaseDeg[0], 10);
  assert.equal(phaseDeg[1], -10);
});

test('throws with fewer than two measured points', () => {
  assert.throws(() => resampleMagnitudePhase({ frequenciesHz: [100], magnitudeDb: [80], phaseDeg: [0] }, [100]));
});
