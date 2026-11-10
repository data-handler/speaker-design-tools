// Sealed (closed) box alignment and on-axis response from Thiele-Small
// parameters. Standard small-signal loudspeaker theory (R. Small, "Direct
// Radiator Loudspeaker System Analysis", JAES 1972): a sealed box turns the
// driver's free-air compliance into a stiffer one (box air acts as an extra
// spring), raising its resonance from Fs to a higher system resonance Fc,
// and raising Q from Qts to Qtc by the same factor. The resulting on-axis
// pressure response is a textbook second-order high-pass, -12 dB/octave
// below Fc, shaped above Fc by Qtc (flat for Qtc=0.707, peaking above it).

/**
 * @param {object} p
 * @param {number} p.fsHz - driver free-air resonance
 * @param {number} p.qts - driver total Q
 * @param {number} p.vasL - driver equivalent compliance volume, litres
 * @param {number} p.vbL - net internal box volume, litres (same unit as vasL; only their ratio matters)
 * @returns {{fcHz: number, qtc: number, alpha: number}}
 */
export function sealedBoxAlignment({ fsHz, qts, vasL, vbL }) {
  if (!(vbL > 0)) throw new Error('Box volume must be positive');
  const alpha = vasL / vbL;
  return {
    alpha,
    fcHz: fsHz * Math.sqrt(1 + alpha),
    qtc: qts * Math.sqrt(1 + alpha),
  };
}

/**
 * On-axis gain in dB relative to the flat passband, across the given
 * frequencies, for a sealed-box system.
 * @param {number[]|Float64Array} frequenciesHz
 */
export function sealedBoxResponseDb(frequenciesHz, params) {
  const { fcHz, qtc } = sealedBoxAlignment(params);
  const gainDb = new Float64Array(frequenciesHz.length);
  for (let i = 0; i < frequenciesHz.length; i++) {
    const omega = frequenciesHz[i] / fcHz;
    const omega2 = omega * omega;
    const numerator = omega2 * omega2;
    const denominator = (omega2 - 1) ** 2 + omega2 / (qtc * qtc);
    gainDb[i] = 10 * Math.log10(numerator / denominator);
  }
  return gainDb;
}

/**
 * Peak-to-peak-free (one-sided) cone excursion in mm for a constant sine
 * voltage drive, across the given frequencies.
 *
 * Below Fc the system is compliance-controlled: for a voltage-driven coil
 * (ignoring voice-coil inductance and back-EMF, the standard simplifying
 * assumption also used for the small-signal Fc/Qtc alignment above),
 * driving force Bl*V/Re is resisted only by the combined driver+box
 * stiffness, so excursion approaches a frequency-independent limit
 * xRef = Bl*V / (Re * Mms * (2*pi*Fc)^2). Above Fc the system is mass-
 * controlled and excursion falls at 12 dB/octave. The full curve is that
 * flat limit shaped by the same second-order response as the pressure
 * transfer function (a standard result: since p ~ -omega^2 * x, the
 * excursion response is the pressure response divided by omega^2,
 * i.e. a plain resonant low-pass of the same Fc and Qtc).
 *
 * @param {number[]|Float64Array} frequenciesHz
 * @param {object} params - sealedBoxAlignment params, plus:
 * @param {number} params.blTm - force factor, T*m
 * @param {number} params.reOhm - DC voice coil resistance, ohm
 * @param {number} params.mmsKg - moving mass including air load, kg
 * @param {number} params.voltageV - drive voltage, Vrms
 */
export function sealedBoxExcursionMm(frequenciesHz, params) {
  const { fcHz, qtc } = sealedBoxAlignment(params);
  const { blTm, reOhm, mmsKg, voltageV } = params;
  const omegaC = 2 * Math.PI * fcHz;
  const xRefM = (blTm * voltageV) / (reOhm * mmsKg * omegaC * omegaC);

  const excursionMm = new Float64Array(frequenciesHz.length);
  for (let i = 0; i < frequenciesHz.length; i++) {
    const omega = frequenciesHz[i] / fcHz;
    const omega2 = omega * omega;
    const denominator = Math.sqrt((1 - omega2) ** 2 + omega2 / (qtc * qtc));
    excursionMm[i] = (xRefM / denominator) * 1000;
  }
  return excursionMm;
}
