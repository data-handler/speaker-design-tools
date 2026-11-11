// Estimates a driver's "power response" - its output averaged over the
// angles it radiates into, rather than just on-axis - from a handful of
// measured off-axis angles. This assumes the driver is axisymmetric about
// its forward axis (true for a round driver in the horizontal plane, an
// approximation off-axis for anything else) and that only the front
// hemisphere (0-90 degrees off-axis) matters, so it is an estimate of
// directivity/early-reflections behaviour, not a lab-grade full-sphere
// sound power measurement.
//
// Each measured angle is treated as representative of the annular zone of
// the hemisphere between the midpoints to its neighbouring angles (0 and 90
// degrees at the ends). The solid angle of a zone between colatitudes a and
// b, integrated over a full revolution, is proportional to cos(a)-cos(b)
// (the standard spherical-zone area formula) - not a naive equal-weight or
// sin(theta)-per-point average, both of which would over- or under-count
// angles depending on local spacing.
//
// Power (energy) is proportional to magnitude squared, i.e. 10^(dB/10), so
// the weighted average is done in that domain and converted back to dB -
// plain dB values must never be averaged directly.

/**
 * @param {number[]} anglesDeg sorted ascending, each in [0, 90]
 * @returns {number[]} one solid-angle weight per angle, summing to exactly cos(0)-cos(90) = 1
 */
export function zoneWeights(anglesDeg) {
  const boundaries = [0];
  for (let i = 0; i < anglesDeg.length - 1; i++) boundaries.push((anglesDeg[i] + anglesDeg[i + 1]) / 2);
  boundaries.push(90);

  return anglesDeg.map((_, i) => {
    const a = (boundaries[i] * Math.PI) / 180;
    const b = (boundaries[i + 1] * Math.PI) / 180;
    return Math.cos(a) - Math.cos(b);
  });
}

/**
 * @param {number[]} anglesDeg sorted ascending, each in [0, 90] - must include 0
 * @param {number[][]} magnitudeDbByAngle one array per angle (same order), each a magnitude-dB
 *   curve over the same frequency grid
 * @returns {number[]} the estimated power response, in dB, over that same frequency grid
 */
export function powerResponseDb(anglesDeg, magnitudeDbByAngle) {
  const weights = zoneWeights(anglesDeg);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const freqCount = magnitudeDbByAngle[0].length;

  return Array.from({ length: freqCount }, (_, f) => {
    let energy = 0;
    for (let i = 0; i < anglesDeg.length; i++) energy += weights[i] * 10 ** (magnitudeDbByAngle[i][f] / 10);
    return 10 * Math.log10(energy / weightSum);
  });
}

/**
 * The index of whichever of anglesDeg is closest to targetAngleDeg (ties
 * broken towards the earlier, more on-axis entry). Used to combine several
 * drivers' off-axis measurements into one system-level directivity estimate
 * when they weren't measured at the same angles: each driver stands in its
 * nearest own measured angle for a target angle it doesn't have, rather
 * than interpolating between measured angles (which, done on a complex
 * response, risks distorting phase right where it matters most - near a
 * directivity null).
 * @param {number[]} anglesDeg
 * @param {number} targetAngleDeg
 * @returns {number}
 */
export function nearestAngleIndex(anglesDeg, targetAngleDeg) {
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < anglesDeg.length; i++) {
    const diff = Math.abs(anglesDeg[i] - targetAngleDeg);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}
