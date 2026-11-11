import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkTransferFunction } from '../src/crossover-network.js';
import { complexMagnitude, real } from '../src/complex.js';
import { logSpace } from '../src/diffraction.js';

function magnitudeDb(complexValue) {
  return 20 * Math.log10(complexMagnitude(complexValue));
}

test('an empty network (no components) gives unity transfer regardless of load', () => {
  const [h] = networkTransferFunction([1000], [], [real(8)]);
  assert.ok(Math.abs(magnitudeDb(h)) < 1e-9, `expected 0 dB, got ${magnitudeDb(h)}`);
});

test('a single series resistor gives the textbook voltage-divider ratio', () => {
  const seriesR = 2;
  const loadR = 8;
  const [h] = networkTransferFunction([1000], [{ type: 'resistor', placement: 'series', value: seriesR }], [real(loadR)]);
  const expected = loadR / (loadR + seriesR);
  assert.ok(Math.abs(complexMagnitude(h) - expected) < 1e-9, `expected ${expected}, got ${complexMagnitude(h)}`);
});

test('a lone shunt component (nothing in series before it) has no effect with an ideal source', () => {
  // With a zero-impedance source, a shunt element in parallel with the load
  // can't change the voltage the source imposes there, whatever its value.
  const [h] = networkTransferFunction([1000], [{ type: 'capacitor', placement: 'shunt', value: 1e-6 }], [real(8)]);
  assert.ok(Math.abs(magnitudeDb(h)) < 1e-9, `expected 0 dB regardless of the shunt value, got ${magnitudeDb(h)}`);
});

test('first-order RC low-pass matches the textbook -3dB-at-fc, -6dB/octave response', () => {
  const resistorOhm = 100;
  const capacitorFarad = 1e-6;
  const fc = 1 / (2 * Math.PI * resistorOhm * capacitorFarad);
  const veryHighImpedanceLoad = [real(1e12)]; // effectively unloaded, to isolate the filter's own response

  const components = [
    { type: 'resistor', placement: 'series', value: resistorOhm },
    { type: 'capacitor', placement: 'shunt', value: capacitorFarad },
  ];

  const [atFc] = networkTransferFunction([fc], components, veryHighImpedanceLoad);
  assert.ok(Math.abs(magnitudeDb(atFc) + 3.0103) < 0.01, `expected -3.01 dB at fc, got ${magnitudeDb(atFc)}`);

  // Check against the exact single-pole formula directly, rather than an
  // approximate octave-to-octave slope (which hasn't reached the asymptotic
  // -6.02 dB/octave yet just a couple of octaves above fc: the true formula
  // gives -5.31 dB/octave there, not -6.02 - that's a property of the exact
  // response, not a tolerance issue).
  const freqs = logSpace(fc / 50, fc * 50, 200);
  const loads = Array.from(freqs, () => real(1e12));
  const transferFunction = networkTransferFunction(freqs, components, loads);
  for (let i = 0; i < freqs.length; i++) {
    const expectedDb = -10 * Math.log10(1 + (freqs[i] / fc) ** 2);
    assert.ok(
      Math.abs(magnitudeDb(transferFunction[i]) - expectedDb) < 0.01,
      `at ${freqs[i]} Hz expected ${expectedDb} dB, got ${magnitudeDb(transferFunction[i])}`
    );
  }
});

test('second-order Butterworth L-C low-pass (series L, shunt C) matches the standard maximally-flat response', () => {
  // A 2nd-order low-pass (series L, shunt C) into a resistive load R has
  // H(jw) = 1 / (1 - w^2*LC + jwL/R), i.e. a standard biquad with
  // w0 = 1/sqrt(LC) and Q = R*sqrt(C/L) (derived directly, not assumed).
  // Maximally flat (Butterworth) needs Q = 1/sqrt(2) with w0 = wc:
  //   L = R*sqrt(2)/wc  (from Q = R/(wc*L) = 1/sqrt(2))
  //   C = 1/(R*wc*sqrt(2))  (from LC = 1/wc^2)
  const loadOhm = 8;
  const fc = 2000;
  const wc = 2 * Math.PI * fc;
  const inductorHenry = (loadOhm * Math.SQRT2) / wc;
  const capacitorFarad = 1 / (loadOhm * wc * Math.SQRT2);
  const components = [
    { type: 'inductor', placement: 'series', value: inductorHenry },
    { type: 'capacitor', placement: 'shunt', value: capacitorFarad },
  ];
  const load = [real(loadOhm)];

  const [atFc] = networkTransferFunction([fc], components, load);
  assert.ok(Math.abs(magnitudeDb(atFc) + 3.0103) < 0.01, `expected -3.01 dB at fc, got ${magnitudeDb(atFc)}`);

  const freqs = logSpace(20, 20000, 500);
  const loads = Array.from(freqs, () => real(loadOhm));
  const transferFunction = networkTransferFunction(freqs, components, loads);
  for (let i = 0; i < freqs.length; i++) {
    const omega = freqs[i] / fc;
    const expectedDb = 10 * Math.log10(1 / (1 + omega ** 4));
    assert.ok(
      Math.abs(magnitudeDb(transferFunction[i]) - expectedDb) < 0.01,
      `at ${freqs[i]} Hz expected ${expectedDb} dB, got ${magnitudeDb(transferFunction[i])}`
    );
  }
});

test('rejects a loadImpedances array of the wrong length', () => {
  assert.throws(() => networkTransferFunction([100, 200], [], [real(8)]));
});

test('rejects an unknown component type or placement', () => {
  assert.throws(() => networkTransferFunction([100], [{ type: 'bogus', placement: 'series', value: 1 }], [real(8)]));
  assert.throws(() => networkTransferFunction([100], [{ type: 'resistor', placement: 'bogus', value: 1 }], [real(8)]));
});
