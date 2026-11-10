import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baffleDiffractionDb, logSpace } from '../src/diffraction.js';

const square = { baffleWidthM: 0.3, baffleHeightM: 0.3, driverOffsetXM: 0.15, driverOffsetYM: 0.15 };

test('rejects a zero-sized baffle', () => {
  assert.throws(() => baffleDiffractionDb([100], { ...square, baffleWidthM: 0 }));
});

test('approaches -6.02 dB well below the baffle step', () => {
  // Low enough that the baffle is acoustically tiny: full-space radiation.
  const [gain] = baffleDiffractionDb([5], square);
  assert.ok(Math.abs(gain + 6.02) < 0.05, `expected ~-6.02 dB, got ${gain}`);
});

test('averages to ~0 dB well above the baffle step, with a finite driver', () => {
  // High enough that the baffle is acoustically huge: half-space radiation,
  // modulo ripple. Average over many cycles of ripple to see the trend.
  const freqs = logSpace(3000, 20000, 400);
  const gains = baffleDiffractionDb(freqs, { ...square, driverDiameterM: 0.1 });
  const mean = gains.reduce((a, b) => a + b, 0) / gains.length;
  assert.ok(Math.abs(mean) < 0.5, `expected mean ~0 dB, got ${mean}`);
});

test('first diffraction peak lands near where the nearest-edge path is half a wavelength', () => {
  const freqs = logSpace(400, 2000, 500);
  const gains = baffleDiffractionDb(freqs, square);
  let peakIndex = 0;
  for (let i = 1; i < gains.length; i++) if (gains[i] > gains[peakIndex]) peakIndex = i;
  const peakFreq = freqs[peakIndex];

  // Nearest edge is 0.15 m away (centred driver on a 0.3 m square); path
  // excess there is d + sqrt(d^2 + r^2) - r for listening distance r = 1 m.
  const d = 0.15;
  const r = 1;
  const pathExcess = d + Math.sqrt(d * d + r * r) - r;
  const expectedPeakFreq = 343 / (2 * pathExcess);

  assert.ok(Math.abs(peakFreq / expectedPeakFreq - 1) < 0.25, `peak at ${peakFreq} Hz vs expected ~${expectedPeakFreq} Hz`);
  assert.ok(gains[peakIndex] > 2 && gains[peakIndex] < 3.6, `peak gain ${gains[peakIndex]} dB out of expected range`);
});

test('a wider baffle steps at a lower frequency than a narrower one', () => {
  function stepFrequency(baffleWidthM, baffleHeightM) {
    const freqs = logSpace(20, 5000, 2000);
    const gains = baffleDiffractionDb(freqs, {
      baffleWidthM,
      baffleHeightM,
      driverOffsetXM: baffleWidthM / 2,
      driverOffsetYM: baffleHeightM / 2,
    });
    for (let i = 1; i < gains.length; i++) {
      if (gains[i - 1] < -3 && gains[i] >= -3) return freqs[i];
    }
    return Infinity;
  }
  assert.ok(stepFrequency(0.5, 0.5) < stepFrequency(0.3, 0.3));
});

test('an off-centre driver ripples less than a centred one', () => {
  function rippleSpread(driverOffsetXM, driverOffsetYM) {
    const freqs = logSpace(500, 4000, 400);
    const gains = baffleDiffractionDb(freqs, {
      baffleWidthM: 0.25,
      baffleHeightM: 0.4,
      driverOffsetXM,
      driverOffsetYM,
      driverDiameterM: 0.13,
    });
    return Math.max(...gains) - Math.min(...gains);
  }
  const centred = rippleSpread(0.125, 0.2);
  const offCentre = rippleSpread(0.09, 0.14);
  assert.ok(offCentre < centred, `expected off-centre (${offCentre}) < centred (${centred})`);
});
