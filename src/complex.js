// Complex numbers as [real, imag] pairs. Shared by anything doing AC
// circuit/transfer-function maths (vented-box excursion, crossover
// networks) so there's one tested implementation rather than several
// inline copies.

export const complexAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const complexSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const complexMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const complexDiv = (a, b) => {
  const denom = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / denom, (a[1] * b[0] - a[0] * b[1]) / denom];
};
export const complexInv = (a) => complexDiv([1, 0], a);
export const complexMagnitude = (a) => Math.hypot(a[0], a[1]);
export const complexPhaseRad = (a) => Math.atan2(a[1], a[0]);
export const imaginary = (x) => [0, x];
export const real = (x) => [x, 0];

/** A complex number from magnitude (linear, not dB) and phase in degrees. */
export function fromPolar(magnitude, phaseDeg) {
  const phaseRad = (phaseDeg * Math.PI) / 180;
  return [magnitude * Math.cos(phaseRad), magnitude * Math.sin(phaseRad)];
}

/** A complex number from a magnitude in dB (re: the given reference) and phase in degrees. */
export function fromPolarDb(magnitudeDb, phaseDeg, reference = 1) {
  return fromPolar(reference * 10 ** (magnitudeDb / 20), phaseDeg);
}

/** Magnitude in dB (re: the given reference) and phase in degrees, unwrapped relative to `previousPhaseDeg` if given. */
export function toPolarDb(a, reference = 1, previousPhaseDeg) {
  const magnitudeDb = 20 * Math.log10(complexMagnitude(a) / reference);
  let phaseDeg = (complexPhaseRad(a) * 180) / Math.PI;
  if (previousPhaseDeg !== undefined) {
    while (phaseDeg - previousPhaseDeg > 180) phaseDeg -= 360;
    while (phaseDeg - previousPhaseDeg < -180) phaseDeg += 360;
  }
  return { magnitudeDb, phaseDeg };
}
