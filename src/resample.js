// Interpolates frequency-response-like data (magnitude + phase vs
// frequency) onto a new set of frequencies: linear interpolation of
// magnitude in dB and of continuously-unwrapped phase, both against
// log(frequency) - the standard way to resample audio measurement data.
// Interpolating dB (rather than linear magnitude) and unwrapped phase
// (rather than phase wrapped to +-180 degrees) avoids artefacts that
// straight-line interpolation of the raw values would introduce,
// especially across a resonance or a wrap-around discontinuity.
//
// Frequencies outside the measured range are clamped to the nearest
// measured endpoint value (flat extrapolation) rather than guessed at.

function unwrapDegrees(phaseDeg) {
  const unwrapped = new Float64Array(phaseDeg.length);
  unwrapped[0] = phaseDeg[0];
  for (let i = 1; i < phaseDeg.length; i++) {
    let delta = phaseDeg[i] - phaseDeg[i - 1];
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    unwrapped[i] = unwrapped[i - 1] + delta;
  }
  return unwrapped;
}

function interpolateSorted(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/**
 * @param {{frequenciesHz: Float64Array|number[], magnitudeDb: Float64Array|number[], phaseDeg: Float64Array|number[]}} measured
 *   frequenciesHz must already be sorted ascending (parseFrd/parseZma guarantee this).
 * @param {Float64Array|number[]} targetFrequenciesHz
 * @returns {{magnitudeDb: Float64Array, phaseDeg: Float64Array}}
 */
export function resampleMagnitudePhase(measured, targetFrequenciesHz) {
  if (measured.frequenciesHz.length < 2) throw new Error('Need at least two measured points to resample');

  const logMeasuredFreqs = Float64Array.from(measured.frequenciesHz, Math.log);
  const unwrappedPhase = unwrapDegrees(measured.phaseDeg);

  const magnitudeDb = new Float64Array(targetFrequenciesHz.length);
  const phaseDeg = new Float64Array(targetFrequenciesHz.length);
  for (let i = 0; i < targetFrequenciesHz.length; i++) {
    const logF = Math.log(targetFrequenciesHz[i]);
    magnitudeDb[i] = interpolateSorted(logMeasuredFreqs, measured.magnitudeDb, logF);
    phaseDeg[i] = interpolateSorted(logMeasuredFreqs, unwrappedPhase, logF);
  }
  return { magnitudeDb, phaseDeg };
}
