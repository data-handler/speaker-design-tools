// Vented (bass-reflex) box on-axis response from Thiele-Small parameters.
// Standard small-signal loudspeaker theory (R. Small, "Vented-Box
// Loudspeaker Systems, Part I: Small-Signal Analysis", JAES 1973). The
// combined driver+port acoustic output is a fourth-order high-pass:
//
//   G(s) = (sT0)^4 / [ (sT0)^4 + a1*(sT0)^3 + a2*(sT0)^2 + a3*(sT0) + 1 ]
//
// normalized to the box tuning frequency (T0 = 1 / (2*pi*Fb)), where, with
// h = Fb/Fs (tuning ratio), alpha = Vas/Vb (compliance ratio), Qts (driver
// total Q) and Ql (box leakage Q; Ql -> infinity models a perfectly sealed,
// lossless box):
//
//   a1 = (Ql + h*Qts) / (h*Ql*Qts)
//   a2 = (h + (alpha + 1 + h^2)*Ql*Qts) / (h*Ql*Qts)
//   a3 = (h*Ql + Qts) / (h*Ql*Qts)
//
// This gives -24 dB/octave below Fb (fourth order), flat (0 dB) well above
// it, and a shape in between set by Qts, h and alpha -- from a sharp dip
// just below Fb through to the familiar reflex "hump" above it, depending
// on alignment. Box leakage losses (Ql) are not modelled by default (Ql is
// left very large, i.e. an idealised lossless box); real boxes are usually
// a little more damped than this near Fb.
//
// Diaphragm (cone) excursion is a separate transfer function from the
// acoustic output above: solved below by going back to the acoustic-domain
// equivalent circuit (driver impedance Zd, box compliance Cab and port
// admittance Yap all meeting at the box-pressure node) and finding the
// driver's own volume velocity, rather than the combined driver+port
// output. A closed-form published equation wasn't found freely available,
// so this is validated instead against three physical facts that must
// hold regardless of the exact derivation's notation: it converges exactly
// to the sealed-box excursion formula at high frequency (where the port's
// mass reactance is large enough to effectively block it, and the box
// behaves as if sealed); it has a sharp minimum exactly at Fb (the port
// "unloads" the driver there, which is the entire point of a vent); and it
// rises steeply below Fb (the port stops providing control). See
// test/vented-box.test.js.

const DEFAULT_LEAKAGE_Q = 1e6; // effectively lossless unless the caller overrides it
const AIR_DENSITY_KG_M3 = 1.2;
const SPEED_OF_SOUND_MPS = 343;

const complexAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const complexMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const complexDiv = (a, b) => {
  const denom = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / denom, (a[1] * b[0] - a[0] * b[1]) / denom];
};
const complexInv = (a) => complexDiv([1, 0], a);
const complexMagnitude = (a) => Math.hypot(a[0], a[1]);
const imaginary = (x) => [0, x];

/**
 * @param {object} p
 * @param {number} p.fsHz - driver free-air resonance
 * @param {number} p.qts - driver total Q
 * @param {number} p.vasL - driver equivalent compliance volume, litres
 * @param {number} p.vbL - net internal box volume, litres (same unit as vasL; only their ratio matters)
 * @param {number} p.fbHz - port/box tuning frequency
 * @param {number} [p.qLeakage] - box leakage Q; default effectively lossless
 * @returns {{h: number, alpha: number, a1: number, a2: number, a3: number}}
 */
export function ventedBoxAlignment({ fsHz, qts, vasL, vbL, fbHz, qLeakage = DEFAULT_LEAKAGE_Q }) {
  if (!(vbL > 0)) throw new Error('Box volume must be positive');
  if (!(fbHz > 0)) throw new Error('Tuning frequency must be positive');

  const h = fbHz / fsHz;
  const alpha = vasL / vbL;
  const hQlQts = h * qLeakage * qts;

  return {
    h,
    alpha,
    a1: (qLeakage + h * qts) / hQlQts,
    a2: (h + (alpha + 1 + h * h) * qLeakage * qts) / hQlQts,
    a3: (h * qLeakage + qts) / hQlQts,
  };
}

/**
 * On-axis gain in dB relative to the flat passband, across the given
 * frequencies, for a vented-box system.
 * @param {number[]|Float64Array} frequenciesHz
 */
export function ventedBoxResponseDb(frequenciesHz, params) {
  const { a1, a2, a3 } = ventedBoxAlignment(params);
  const gainDb = new Float64Array(frequenciesHz.length);
  for (let i = 0; i < frequenciesHz.length; i++) {
    const omega = frequenciesHz[i] / params.fbHz;
    const omega2 = omega * omega;
    const omega3 = omega2 * omega;
    const omega4 = omega2 * omega2;

    const real = omega4 - a2 * omega2 + 1;
    const imag = a3 * omega - a1 * omega3;
    const denominatorMagSq = real * real + imag * imag;

    gainDb[i] = 10 * Math.log10((omega4 * omega4) / denominatorMagSq);
  }
  return gainDb;
}

/**
 * Peak driver-cone excursion in mm for a constant sine voltage drive, in a
 * vented box, across the given frequencies. See the module comment above
 * for the derivation and how it's validated.
 *
 * @param {number[]|Float64Array} frequenciesHz
 * @param {object} params - ventedBoxAlignment params, plus:
 * @param {number} params.blTm - force factor, T*m
 * @param {number} params.reOhm - DC voice coil resistance, ohm
 * @param {number} params.sdM2 - effective piston (cone) area, m^2
 * @param {number} params.voltageV - drive voltage, Vrms
 */
export function ventedBoxExcursionMm(frequenciesHz, params) {
  ventedBoxAlignment(params); // validates vbL/fbHz, throws consistently with the response function
  const { fsHz, qts, vasL, vbL, fbHz, qLeakage = DEFAULT_LEAKAGE_Q, blTm, reOhm, sdM2, voltageV } = params;

  const rhoC2 = AIR_DENSITY_KG_M3 * SPEED_OF_SOUND_MPS * SPEED_OF_SOUND_MPS;
  const Cas = vasL / 1000 / rhoC2;
  const Cab = vbL / 1000 / rhoC2;
  const omegaS = 2 * Math.PI * fsHz;
  const Mas = 1 / (omegaS * omegaS * Cas);
  const Ras = (omegaS * Mas) / qts;

  const omegaB = 2 * Math.PI * fbHz;
  const Map = 1 / (omegaB * omegaB * Cab);
  const Ral = qLeakage / (omegaB * Cab);

  const drivingPressure = (blTm * voltageV) / (reOhm * sdM2);

  const excursionMm = new Float64Array(frequenciesHz.length);
  for (let i = 0; i < frequenciesHz.length; i++) {
    const omega = 2 * Math.PI * frequenciesHz[i];

    const Zd = complexAdd(complexAdd([Ras, 0], imaginary(omega * Mas)), complexInv(imaginary(omega * Cas)));
    const Yd = complexInv(Zd);
    const Yab = imaginary(omega * Cab);
    const Yral = [1 / Ral, 0];
    const Ys = complexInv(imaginary(omega * Map));

    // Driver's own volume velocity: Pg*Yd*(Yab+Yral+Ys) / (Yd+Yab+Yral+Ys)
    const portSideAdmittance = complexAdd(Yab, complexAdd(Yral, Ys));
    const numerator = complexMul([drivingPressure, 0], complexMul(Yd, portSideAdmittance));
    const denominator = complexAdd(Yd, portSideAdmittance);
    const driverVolumeVelocity = complexDiv(numerator, denominator);

    const displacement = complexDiv(driverVolumeVelocity, imaginary(omega * sdM2));
    excursionMm[i] = complexMagnitude(displacement) * 1000;
  }
  return excursionMm;
}
