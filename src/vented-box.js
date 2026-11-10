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
// Diaphragm (cone) excursion in a vented box -- notably the characteristic
// minimum right at Fb, where the port does most of the work -- needs a
// separate transfer function from the one here and isn't implemented yet;
// see the sealed-box module for the closed-box equivalent, which is solved.

const DEFAULT_LEAKAGE_Q = 1e6; // effectively lossless unless the caller overrides it

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
