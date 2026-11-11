import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventedBoxAlignment, ventedBoxResponseDb, ventedBoxExcursionMm } from '../src/vented-box.js';
import { sealedBoxExcursionMm } from '../src/sealed-box.js';
import { logSpace } from '../src/diffraction.js';

const driver = { fsHz: 30, qts: 0.35, vasL: 60 };

test('rejects a zero box volume and a zero tuning frequency', () => {
  assert.throws(() => ventedBoxAlignment({ ...driver, vbL: 0, fbHz: 30 }));
  assert.throws(() => ventedBoxAlignment({ ...driver, vbL: 20, fbHz: 0 }));
});

test('lossless limit (Ql -> infinity) matches the textbook a1/a2/a3 formulas', () => {
  const params = { ...driver, vbL: 20, fbHz: 32, qLeakage: 1e9 };
  const { h, alpha, a1, a2, a3 } = ventedBoxAlignment(params);
  assert.ok(Math.abs(a1 - 1 / (h * driver.qts)) < 1e-6);
  assert.ok(Math.abs(a3 - 1 / driver.qts) < 1e-6);
  assert.ok(Math.abs(a2 - (1 + alpha + h * h) / h) < 1e-6);
});

test('response is flat (0 dB) well above Fb', () => {
  const params = { ...driver, vbL: 20, fbHz: 32 };
  const [gain] = ventedBoxResponseDb([32 * 50], params);
  assert.ok(Math.abs(gain) < 0.01, `expected ~0 dB, got ${gain}`);
});

test('response rolls off at 24 dB/octave well below Fb (fourth order)', () => {
  const params = { ...driver, vbL: 20, fbHz: 32 };
  const [gainAt, gainAtHalf] = ventedBoxResponseDb([32 / 20, 32 / 40], params);
  assert.ok(Math.abs(gainAt - gainAtHalf - 24.08) < 0.1, `expected ~24.08 dB/octave, got ${gainAt - gainAtHalf}`);
});

test('a precise Butterworth (B4) alignment reproduces the standard quartic coefficients 2.613/3.414/2.613/1 and is maximally flat', () => {
  // Standard 4th-order Butterworth denominator s^4 + 2.61312 s^3 + 3.41421 s^2
  // + 2.61312 s + 1 (from its pole angles, independent of this module), which
  // Small's vented-box equations reach at h=1 with qts = 1/2.61312 and
  // alpha = sqrt(2) in the lossless limit.
  const qts = 1 / 2.61312;
  const vasL = 60;
  const alpha = Math.SQRT2;
  const vbL = vasL / alpha;
  const fsHz = 30;
  const params = { fsHz, qts, vasL, vbL, fbHz: fsHz, qLeakage: 1e9 }; // h = fbHz/fsHz = 1

  const { a1, a2, a3 } = ventedBoxAlignment(params);
  assert.ok(Math.abs(a1 - 2.61312) < 1e-4, `a1 ${a1}`);
  assert.ok(Math.abs(a2 - 3.41421) < 1e-4, `a2 ${a2}`);
  assert.ok(Math.abs(a3 - 2.61312) < 1e-4, `a3 ${a3}`);

  // Maximally flat: no peak above 0 dB anywhere, and exactly -3.01 dB at the
  // normalized cutoff (Omega = f/Fb = 1, and here Fb = Fs).
  const freqs = logSpace(1, 2000, 4000);
  const gains = ventedBoxResponseDb(freqs, params);
  assert.ok(Math.max(...gains) < 0.05, `expected no peak, got max ${Math.max(...gains)} dB`);

  const [gainAtFb] = ventedBoxResponseDb([fsHz], params);
  assert.ok(Math.abs(gainAtFb + 3.0103) < 0.02, `expected -3.01 dB at Fb, got ${gainAtFb}`);
});

test('a high-Qts alignment peaks above 0 dB near Fb; the Butterworth one does not', () => {
  const peaky = { fsHz: 30, qts: 0.8, vasL: 60, vbL: 20, fbHz: 30 }; // high Qts -> C4-like peaking
  const freqs = logSpace(5, 500, 2000);
  const peakyMax = Math.max(...ventedBoxResponseDb(freqs, peaky));
  assert.ok(peakyMax > 1, `expected a peak above 0 dB, got max ${peakyMax} dB`);
});

// Excursion: no published closed-form was found (see the module comment), so
// these tests check it against physical facts that must hold regardless of
// the derivation's exact notation, rather than against a known-good number.

const AIR_DENSITY_KG_M3 = 1.2;
const SPEED_OF_SOUND_MPS = 343;
const excursionDriver = { fsHz: 30, qts: 0.35, vasL: 60 };
const excursionParams = { ...excursionDriver, vbL: 20, fbHz: 32, blTm: 7, reOhm: 6, sdM2: 0.02, voltageV: 2.83 };

function mmsKgFor(driver) {
  // Mas = 1 / (omegaS^2 * Cas), Mms = Mas * Sd^2 -- the standard mechanical/
  // acoustic conversion, computed independently of the module under test.
  const rhoC2 = AIR_DENSITY_KG_M3 * SPEED_OF_SOUND_MPS * SPEED_OF_SOUND_MPS;
  const Cas = driver.vasL / 1000 / rhoC2;
  const omegaS = 2 * Math.PI * driver.fsHz;
  const Mas = 1 / (omegaS * omegaS * Cas);
  return Mas * excursionParams.sdM2 * excursionParams.sdM2;
}

test('excursion converges to the sealed-box formula at high frequency (port effectively blocked)', () => {
  const freqs = [500, 1000, 1900];
  const vented = ventedBoxExcursionMm(freqs, excursionParams);
  const sealed = sealedBoxExcursionMm(freqs, {
    ...excursionDriver,
    vbL: excursionParams.vbL,
    blTm: excursionParams.blTm,
    reOhm: excursionParams.reOhm,
    mmsKg: mmsKgFor(excursionDriver),
    voltageV: excursionParams.voltageV,
  });
  for (let i = 0; i < freqs.length; i++) {
    assert.ok(
      Math.abs(vented[i] / sealed[i] - 1) < 0.01,
      `at ${freqs[i]} Hz expected vented (${vented[i]}) ~= sealed (${sealed[i]})`
    );
  }
});

test('excursion has a sharp local minimum exactly at Fb', () => {
  const freqs = logSpace(20, 50, 300);
  const excursion = ventedBoxExcursionMm(freqs, excursionParams);
  let minIndex = 0;
  for (let i = 1; i < excursion.length; i++) if (excursion[i] < excursion[minIndex]) minIndex = i;
  assert.ok(Math.abs(freqs[minIndex] - excursionParams.fbHz) < 1, `expected the minimum near Fb, got ${freqs[minIndex]} Hz`);

  const [atFb] = ventedBoxExcursionMm([excursionParams.fbHz], excursionParams);
  const [justBelow] = ventedBoxExcursionMm([excursionParams.fbHz * 0.9], excursionParams);
  const [justAbove] = ventedBoxExcursionMm([excursionParams.fbHz * 1.1], excursionParams);
  assert.ok(atFb < justBelow / 5 && atFb < justAbove / 5, 'expected a sharp dip, not just a local dip');
});

test('excursion rises steeply below Fb (the port stops providing control)', () => {
  const [atFb] = ventedBoxExcursionMm([excursionParams.fbHz], excursionParams);
  const [wellBelow] = ventedBoxExcursionMm([excursionParams.fbHz / 4], excursionParams);
  assert.ok(wellBelow > atFb * 10, `expected a steep rise below Fb, got ${wellBelow} vs dip ${atFb}`);
});
