// Standard passive 1st- and 2nd-order crossover component values, derived
// directly from the filter's own transfer function rather than taken from a
// published component-value table - those tables are almost always for a
// doubly-terminated filter (equal source and load impedance), which a
// passive crossover driven by a near-zero-impedance amplifier is not.
//
// 2nd order (series L, shunt C to the driver, load R): a voltage divider
// gives H(jw) = 1/(1 - (w/w0)^2 + j(w/w0)/Q), w0 = 1/sqrt(LC), Q = R*sqrt(C/L)
// (this is the same relation test/crossover-network.test.js's Butterworth
// check already validates against the exact 1/(1+(f/fc)^4) response). Solving
// those two relations for L and C given a target w0 and Q:
//   L = R / (Q*w0),  C = Q / (R*w0)
// The high-pass (series C, shunt L) case gives the same denominator by the
// same algebra, so it uses the same L and C values with the elements swapped.
// 1st order (a single reactive element) is the Q->infinity-free special
// case, solved directly from its own one-pole transfer function.
//
// Butterworth (Q = 1/sqrt(2)) and Linkwitz-Riley (Q = 0.5) are the two
// standard 2nd-order alignments; LR's defining property - both outputs
// exactly -6.02dB at the crossover frequency, recombining to a flat 0dB sum
// in phase - is checked directly in this module's tests, not just assumed.
const Q_BUTTERWORTH = Math.SQRT1_2;
const Q_LINKWITZ_RILEY = 0.5;

export function alignmentQ(alignment) {
  if (alignment === 'linkwitz-riley') return Q_LINKWITZ_RILEY;
  if (alignment === 'butterworth') return Q_BUTTERWORTH;
  throw new Error(`Unknown alignment: ${alignment}`);
}

/**
 * @param {{type: 'lowpass'|'highpass', order: 1|2, alignment?: 'butterworth'|'linkwitz-riley', crossoverHz: number, loadOhm: number}} params
 * @returns {Array<{type: 'inductor'|'capacitor', placement: 'series'|'shunt', value: number}>} component values in the
 *   practical units (mH, uF) the crossover tool's component editor stores, source side to driver side.
 */
export function presetComponents({ type, order, alignment, crossoverHz, loadOhm }) {
  const omega0 = 2 * Math.PI * crossoverHz;

  if (order === 1) {
    if (type === 'lowpass') {
      return [{ type: 'inductor', placement: 'series', value: (loadOhm / omega0) * 1000 }];
    }
    if (type === 'highpass') {
      return [{ type: 'capacitor', placement: 'series', value: (1 / (loadOhm * omega0)) * 1e6 }];
    }
    throw new Error(`Unknown filter type: ${type}`);
  }

  if (order === 2) {
    const q = alignmentQ(alignment);
    const inductorMh = (loadOhm / (q * omega0)) * 1000;
    const capacitorUf = (q / (loadOhm * omega0)) * 1e6;
    if (type === 'lowpass') {
      return [
        { type: 'inductor', placement: 'series', value: inductorMh },
        { type: 'capacitor', placement: 'shunt', value: capacitorUf },
      ];
    }
    if (type === 'highpass') {
      return [
        { type: 'capacitor', placement: 'series', value: capacitorUf },
        { type: 'inductor', placement: 'shunt', value: inductorMh },
      ];
    }
    throw new Error(`Unknown filter type: ${type}`);
  }

  throw new Error(`Unsupported filter order: ${order}`);
}
