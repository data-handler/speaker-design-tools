import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetComponents } from '../src/crossover-presets.js';
import { networkTransferFunction } from '../src/crossover-network.js';
import { complexMagnitude, complexSub, real } from '../src/complex.js';
import { logSpace } from '../src/diffraction.js';

const LOAD_OHM = 8;
const FC_HZ = 2000;

function toSi(component) {
  return { ...component, value: component.type === 'inductor' ? component.value / 1000 : component.value / 1e6 };
}

function dbAt(components, frequenciesHz) {
  const si = components.map(toSi);
  const loads = Array.from(frequenciesHz, () => real(LOAD_OHM));
  const h = networkTransferFunction(frequenciesHz, si, loads);
  return Array.from(h, (c) => 20 * Math.log10(complexMagnitude(c)));
}

test('1st-order low-pass is -3.01dB at fc and matches 1/sqrt(1+(f/fc)^2) across the band', () => {
  const components = presetComponents({ type: 'lowpass', order: 1, crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  assert.equal(components.length, 1);
  const freqs = logSpace(20, 20000, 200);
  const db = dbAt(components, freqs);
  for (let i = 0; i < freqs.length; i++) {
    const expectedDb = 10 * Math.log10(1 / (1 + (freqs[i] / FC_HZ) ** 2));
    assert.ok(Math.abs(db[i] - expectedDb) < 1e-9, `at ${freqs[i]} Hz: got ${db[i]}, expected ${expectedDb}`);
  }
  // f = fc is -3.0103dB by construction of the formula just checked above
  // point-for-point; confirm directly rather than relying on a log-spaced
  // grid point landing exactly on fc.
  const [dbAtFc] = dbAt(components, [FC_HZ]);
  assert.ok(Math.abs(dbAtFc - -3.0103) < 1e-3);
});

test('1st-order high-pass is -3.01dB at fc and matches (f/fc)/sqrt(1+(f/fc)^2) across the band', () => {
  const components = presetComponents({ type: 'highpass', order: 1, crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  assert.equal(components.length, 1);
  const freqs = logSpace(20, 20000, 200);
  const db = dbAt(components, freqs);
  for (let i = 0; i < freqs.length; i++) {
    const x = freqs[i] / FC_HZ;
    const expectedDb = 10 * Math.log10(x ** 2 / (1 + x ** 2));
    assert.ok(Math.abs(db[i] - expectedDb) < 1e-9, `at ${freqs[i]} Hz: got ${db[i]}, expected ${expectedDb}`);
  }
});

test('2nd-order Butterworth low-pass matches the exact 1/(1+(f/fc)^4) response', () => {
  const components = presetComponents({ type: 'lowpass', order: 2, alignment: 'butterworth', crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  assert.equal(components.length, 2);
  const freqs = logSpace(20, 20000, 200);
  const db = dbAt(components, freqs);
  for (let i = 0; i < freqs.length; i++) {
    const expectedDb = 10 * Math.log10(1 / (1 + (freqs[i] / FC_HZ) ** 4));
    assert.ok(Math.abs(db[i] - expectedDb) < 1e-9, `at ${freqs[i]} Hz: got ${db[i]}, expected ${expectedDb}`);
  }
});

test('2nd-order Butterworth high-pass matches the exact (f/fc)^4/(1+(f/fc)^4) response', () => {
  const components = presetComponents({ type: 'highpass', order: 2, alignment: 'butterworth', crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  const freqs = logSpace(20, 20000, 200);
  const db = dbAt(components, freqs);
  for (let i = 0; i < freqs.length; i++) {
    const x4 = (freqs[i] / FC_HZ) ** 4;
    const expectedDb = 10 * Math.log10(x4 / (1 + x4));
    assert.ok(Math.abs(db[i] - expectedDb) < 1e-9, `at ${freqs[i]} Hz: got ${db[i]}, expected ${expectedDb}`);
  }
});

test('2nd-order Linkwitz-Riley low-pass and high-pass are both exactly -6.02dB at fc', () => {
  const lp = presetComponents({ type: 'lowpass', order: 2, alignment: 'linkwitz-riley', crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  const hp = presetComponents({ type: 'highpass', order: 2, alignment: 'linkwitz-riley', crossoverHz: FC_HZ, loadOhm: LOAD_OHM });
  const [lpDb] = dbAt(lp, [FC_HZ]);
  const [hpDb] = dbAt(hp, [FC_HZ]);
  assert.ok(Math.abs(lpDb - 20 * Math.log10(0.5)) < 1e-9);
  assert.ok(Math.abs(hpDb - 20 * Math.log10(0.5)) < 1e-9);
});

test('2nd-order Linkwitz-Riley: low-pass minus high-pass (one driver inverted) is exactly flat across the whole band', () => {
  // The defining Linkwitz-Riley property, and what tells it apart from
  // Butterworth: with one output's polarity inverted, the two recombine to
  // a perfectly flat (0dB) response at every frequency, not just near fc.
  // Derived and confirmed algebraically before writing this test: this
  // exact cancellation only happens at Q=0.5 (Linkwitz-Riley); Butterworth's
  // Q=1/sqrt(2) does not have it.
  const lp = presetComponents({ type: 'lowpass', order: 2, alignment: 'linkwitz-riley', crossoverHz: FC_HZ, loadOhm: LOAD_OHM }).map(toSi);
  const hp = presetComponents({ type: 'highpass', order: 2, alignment: 'linkwitz-riley', crossoverHz: FC_HZ, loadOhm: LOAD_OHM }).map(toSi);
  const freqs = logSpace(20, 20000, 300);
  const loads = Array.from(freqs, () => real(LOAD_OHM));
  const hLp = networkTransferFunction(freqs, lp, loads);
  const hHp = networkTransferFunction(freqs, hp, loads);
  for (let i = 0; i < freqs.length; i++) {
    const summed = complexSub(hLp[i], hHp[i]);
    assert.ok(Math.abs(complexMagnitude(summed) - 1) < 1e-9, `at ${freqs[i]} Hz: magnitude ${complexMagnitude(summed)}`);
  }
});

test('2nd-order Butterworth does NOT have the flat-sum property (sanity check that the LR test above is meaningful)', () => {
  const lp = presetComponents({ type: 'lowpass', order: 2, alignment: 'butterworth', crossoverHz: FC_HZ, loadOhm: LOAD_OHM }).map(toSi);
  const hp = presetComponents({ type: 'highpass', order: 2, alignment: 'butterworth', crossoverHz: FC_HZ, loadOhm: LOAD_OHM }).map(toSi);
  const loads = [real(LOAD_OHM)];
  const [hLp] = networkTransferFunction([FC_HZ], lp, loads);
  const [hHp] = networkTransferFunction([FC_HZ], hp, loads);
  const summed = complexSub(hLp, hHp);
  assert.ok(Math.abs(complexMagnitude(summed) - 1) > 0.01);
});

test('throws on an unsupported order', () => {
  assert.throws(() => presetComponents({ type: 'lowpass', order: 3, crossoverHz: FC_HZ, loadOhm: LOAD_OHM }));
});
