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

// 3rd and 4th order: the same voltage-divider method doesn't extend neatly
// past one reactive pair, so these are solved by matching the ladder's own
// ABCD-derived denominator polynomial (see networkTransferFunction in
// crossover-network.js) term-by-term against the standard normalized
// Butterworth polynomial for that order, then converting the resulting
// normalized component values back to this crossover's own R and w0. Only
// Butterworth is offered at 3rd/4th order - Linkwitz-Riley is only defined
// at even orders as the square of a half-order Butterworth response
// (confirmed for 2nd order in this module's tests), and whether/how that
// is realizable as a single passive ladder (rather than active, buffered
// stages) hasn't been worked out here, so it isn't offered rather than
// guessing.
//
// 3rd order low-pass (series L1, shunt C2, series L3, load R): the ABCD
// cascade gives H(jw) = R / [R(1-w^2 L1 C2) + jw((L1+L3) - w^2 L1 C2 L3)].
// The normalized (w0=1) 3rd-order Butterworth denominator is
// s^3+2s^2+2s+1, i.e. at s=jx: (1-2x^2) + j(2x-x^3). Matching coefficients
// of x, x^2 and x^3 (with x=w/w0) gives three equations in L1, C2, L3:
//   w0^2 L1 C2 = 2,  w0(L1+L3)/R = 2,  w0^3 L1 C2 L3 / R = 1
// solved below as L1 = 1.5R/w0, C2 = (4/3)/(Rw0), L3 = 0.5R/w0. High-pass
// uses the standard low-pass<->high-pass duality for an all-pole ladder
// (swap L<->C, with each dual value = 1/(w0^2 * the low-pass value) at the
// corresponding ladder position) rather than a separate derivation.
//
// 4th order low-pass (series L1, shunt C2, series L3, shunt C4) is solved
// the same way against the normalized 4th-order Butterworth denominator
// s^4 + a3 s^3 + a2 s^2 + a3 s + 1, where a3 = sqrt(4+2*sqrt(2)) and
// a2 = 2+sqrt(2) (the standard factored-quadratics form (s^2+2sin(22.5°)s+1)
// (s^2+2sin(67.5°)s+1) expanded). Matching the four coefficients gives:
//   w0^4 C4 L1 C2 L3 = 1,  w0^2(L1 C2 + C4(L1+L3)) = a2,
//   w0(L1+L3)/R = a3,  w0^3 L1 C2 L3 / R = a3
// which, working in R/w0-normalized units (l = L*w0/R, c = C*R*w0), solves
// cleanly: c4 = 1/a3 (since the first and third equations combine to give
// c4*a3=1), l1*c2 = a2-1, l3 = a3/(l1*c2), l1 = a3-l3, c2 = (l1*c2)/l1.
// Each step here was checked against networkTransferFunction's exact
// 1/(1+(f/fc)^6) (3rd order) and 1/(1+(f/fc)^8) (4th order) responses
// before being written down as these formulas (see this module's tests).

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

  if (order === 3) {
    const l1 = (1.5 * loadOhm) / omega0;
    const c2 = 4 / (3 * loadOhm * omega0);
    const l3 = (0.5 * loadOhm) / omega0;
    if (type === 'lowpass') {
      return [
        { type: 'inductor', placement: 'series', value: l1 * 1000 },
        { type: 'capacitor', placement: 'shunt', value: c2 * 1e6 },
        { type: 'inductor', placement: 'series', value: l3 * 1000 },
      ];
    }
    if (type === 'highpass') {
      return [
        { type: 'capacitor', placement: 'series', value: (1 / (omega0 * omega0 * l1)) * 1e6 },
        { type: 'inductor', placement: 'shunt', value: (1 / (omega0 * omega0 * c2)) * 1000 },
        { type: 'capacitor', placement: 'series', value: (1 / (omega0 * omega0 * l3)) * 1e6 },
      ];
    }
    throw new Error(`Unknown filter type: ${type}`);
  }

  if (order === 4) {
    const a3 = Math.sqrt(4 + 2 * Math.SQRT2);
    const a2 = 2 + Math.SQRT2;
    const c4n = 1 / a3;
    const l1c2n = a2 - 1;
    const l3n = a3 / l1c2n;
    const l1n = a3 - l3n;
    const c2n = l1c2n / l1n;

    const l1 = (l1n * loadOhm) / omega0;
    const c2 = c2n / (loadOhm * omega0);
    const l3 = (l3n * loadOhm) / omega0;
    const c4 = c4n / (loadOhm * omega0);
    if (type === 'lowpass') {
      return [
        { type: 'inductor', placement: 'series', value: l1 * 1000 },
        { type: 'capacitor', placement: 'shunt', value: c2 * 1e6 },
        { type: 'inductor', placement: 'series', value: l3 * 1000 },
        { type: 'capacitor', placement: 'shunt', value: c4 * 1e6 },
      ];
    }
    if (type === 'highpass') {
      return [
        { type: 'capacitor', placement: 'series', value: (1 / (omega0 * omega0 * l1)) * 1e6 },
        { type: 'inductor', placement: 'shunt', value: (1 / (omega0 * omega0 * c2)) * 1000 },
        { type: 'capacitor', placement: 'series', value: (1 / (omega0 * omega0 * l3)) * 1e6 },
        { type: 'inductor', placement: 'shunt', value: (1 / (omega0 * omega0 * c4)) * 1000 },
      ];
    }
    throw new Error(`Unknown filter type: ${type}`);
  }

  throw new Error(`Unsupported filter order: ${order}`);
}
