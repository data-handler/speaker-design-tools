// Combines several drivers' (already crossover-filtered) complex responses
// into one acoustic sum, after applying each driver's own level trim,
// acoustic time offset and polarity.
//
// Level trim is a plain gain in dB. Acoustic time offset models the
// difference in each driver's acoustic-centre distance from the listening
// position (or any other relative arrival-time difference) as a pure delay:
// a signal delayed by t seconds has its phase shifted by -2*pi*f*t radians
// at every frequency, with no change in magnitude. Polarity invert flips
// the signal's sign, equivalent to a 180 degree phase shift at every
// frequency.
import { complexMul, complexAdd, fromPolar, real } from './complex.js';

const SPEED_OF_SOUND_MPS = 343; // m/s, 20C dry air - matches diffraction.js/vented-box.js

/**
 * A physical acoustic-centre offset in mm (positive = further from the
 * listening position, so it arrives later) as a delay in ms. 343 m/s is
 * numerically identical to 343 mm/ms, so dividing the mm figure by the same
 * constant gives the delay in ms directly.
 */
export function distanceMmToDelayMs(distanceMm) {
  return distanceMm / SPEED_OF_SOUND_MPS;
}

/**
 * @param {Float64Array|number[]} frequenciesHz
 * @param {Array<[number, number]>} response complex response per frequency
 * @param {{levelDb?: number, delayMs?: number, invertPolarity?: boolean}} adjustments
 * @returns {Array<[number, number]>}
 */
export function applyLevelDelayPolarity(frequenciesHz, response, adjustments = {}) {
  const { levelDb = 0, delayMs = 0, invertPolarity = false } = adjustments;
  const gain = (invertPolarity ? -1 : 1) * 10 ** (levelDb / 20);
  return Array.from(frequenciesHz, (frequencyHz, i) => {
    const delayPhaseDeg = -360 * frequencyHz * (delayMs / 1000);
    return complexMul(complexMul(response[i], real(gain)), fromPolar(1, delayPhaseDeg));
  });
}

/**
 * Sums several drivers' complex responses (each already adjusted by
 * `applyLevelDelayPolarity` if needed) point-by-point.
 * @param {Array<Array<[number, number]>>} responses one array per driver, same length each
 * @returns {Array<[number, number]>}
 */
export function sumResponses(responses) {
  if (responses.length === 0) return [];
  const length = responses[0].length;
  const summed = new Array(length);
  for (let i = 0; i < length; i++) {
    let acc = [0, 0];
    for (const response of responses) acc = complexAdd(acc, response[i]);
    summed[i] = acc;
  }
  return summed;
}
