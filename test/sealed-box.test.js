import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealedBoxAlignment, sealedBoxResponseDb, sealedBoxExcursionMm } from '../src/sealed-box.js';
import { logSpace } from '../src/diffraction.js';

const driver = { fsHz: 30, qts: 0.35, vasL: 60 };

test('rejects a zero or negative box volume', () => {
  assert.throws(() => sealedBoxAlignment({ ...driver, vbL: 0 }));
});

test('Fc and Qtc both rise by sqrt(1 + Vas/Vb), per Small (1972)', () => {
  const vbL = 20;
  const alpha = driver.vasL / vbL;
  const { fcHz, qtc, alpha: computedAlpha } = sealedBoxAlignment({ ...driver, vbL });
  assert.ok(Math.abs(computedAlpha - alpha) < 1e-9);
  assert.ok(Math.abs(fcHz - driver.fsHz * Math.sqrt(1 + alpha)) < 1e-9);
  assert.ok(Math.abs(qtc - driver.qts * Math.sqrt(1 + alpha)) < 1e-9);
});

test('a smaller box gives a higher Fc than a larger box', () => {
  const { fcHz: fcSmall } = sealedBoxAlignment({ ...driver, vbL: 15 });
  const { fcHz: fcLarge } = sealedBoxAlignment({ ...driver, vbL: 60 });
  assert.ok(fcSmall > fcLarge);
});

test('response is flat (0 dB) well above Fc', () => {
  const vbL = 20;
  const { fcHz } = sealedBoxAlignment({ ...driver, vbL });
  const [gain] = sealedBoxResponseDb([fcHz * 50], { ...driver, vbL });
  assert.ok(Math.abs(gain) < 0.01, `expected ~0 dB, got ${gain}`);
});

test('response rolls off at 12 dB/octave well below Fc', () => {
  const vbL = 20;
  const { fcHz } = sealedBoxAlignment({ ...driver, vbL });
  const [gainAt, gainAtHalf] = sealedBoxResponseDb([fcHz / 20, fcHz / 40], { ...driver, vbL });
  assert.ok(Math.abs(gainAt - gainAtHalf - 12.04) < 0.05, `expected ~12.04 dB/octave, got ${gainAt - gainAtHalf}`);
});

test('a Butterworth (Qtc = 0.707) box is down exactly 3.01 dB at Fc', () => {
  // Solve for the Vb that gives Qtc = 1/sqrt(2) with this driver's Qts, then
  // check the closed-form -3.01 dB point, independent of the alpha solve.
  const targetQtc = Math.SQRT1_2;
  const alpha = (targetQtc / driver.qts) ** 2 - 1;
  const vbL = driver.vasL / alpha;
  const { fcHz, qtc } = sealedBoxAlignment({ ...driver, vbL });
  assert.ok(Math.abs(qtc - targetQtc) < 1e-9);
  const [gainAtFc] = sealedBoxResponseDb([fcHz], { ...driver, vbL });
  assert.ok(Math.abs(gainAtFc + 3.0103) < 0.01, `expected -3.01 dB, got ${gainAtFc}`);
});

test('a higher Qtc alignment peaks above 0 dB near Fc; Butterworth does not', () => {
  const vbL = 20; // alpha = 3, qtc = 0.35*2 = 0.70 (~Butterworth, no peak)
  const peaky = { ...driver, qts: 0.6, vbL: 10 }; // alpha = 6, qtc = 0.6*sqrt(7) ≈ 1.59 (peaky)
  const freqs = logSpace(5, 500, 2000);
  const gains = sealedBoxResponseDb(freqs, peaky);
  const maxGain = Math.max(...gains);
  assert.ok(maxGain > 1, `expected a peak above 0 dB, got max ${maxGain} dB`);

  const flatGains = sealedBoxResponseDb(freqs, { ...driver, vbL });
  assert.ok(Math.max(...flatGains) < 0.1, `expected no peak, got max ${Math.max(...flatGains)} dB`);
});

test('excursion is flat well below Fc and falls at 12 dB/octave (6 dB/octave in mm) above it', () => {
  const params = { ...driver, vbL: 20, blTm: 7, reOhm: 6, mmsKg: 0.015, voltageV: 2.83 };
  const { fcHz } = sealedBoxAlignment(params);

  const [xLow, xLower] = sealedBoxExcursionMm([fcHz / 20, fcHz / 40], params);
  assert.ok(Math.abs(xLow - xLower) / xLow < 0.01, `expected near-flat excursion below Fc, got ${xLow} vs ${xLower}`);

  const [xHigh, xHigher] = sealedBoxExcursionMm([fcHz * 20, fcHz * 40], params);
  assert.ok(Math.abs(xHigh / xHigher - 4) < 0.05, `expected excursion to quarter per octave above Fc, got ratio ${xHigh / xHigher}`);
});

test('excursion scales linearly with drive voltage', () => {
  const params = { ...driver, vbL: 20, blTm: 7, reOhm: 6, mmsKg: 0.015 };
  const [xAt1V] = sealedBoxExcursionMm([30], { ...params, voltageV: 1 });
  const [xAt4V] = sealedBoxExcursionMm([30], { ...params, voltageV: 4 });
  assert.ok(Math.abs(xAt4V / xAt1V - 4) < 1e-9);
});
