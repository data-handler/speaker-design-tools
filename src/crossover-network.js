// Passive crossover network simulation via ABCD (chain/transmission)
// two-port matrices: standard electrical two-port network theory, not
// specific to acoustics. A network is an ordered list of series/shunt
// resistor/inductor/capacitor components between an ideal (zero source
// impedance) voltage source and a complex load impedance (a driver's own
// measured electrical impedance). Each element's ABCD matrix:
//
//   series impedance Z:  [[1, Z], [0, 1]]
//   shunt impedance Z:   [[1, 0], [1/Z, 1]]
//
// Cascading elements from source to load multiplies their matrices in that
// order. For the resulting network [[A, B], [C, D]] driving a load Z_load,
// the voltage transfer function (load voltage / source voltage) is:
//
//   H = Z_load / (A * Z_load + B)
//
// which is applied (by complex multiplication) to the driver's own measured
// anechoic response to get its response through this crossover section.

import { complexAdd, complexMul, complexDiv, complexInv, imaginary, real } from './complex.js';

function componentImpedance(component, omega) {
  switch (component.type) {
    case 'resistor':
      return real(component.value);
    case 'inductor':
      return imaginary(omega * component.value);
    case 'capacitor':
      return complexInv(imaginary(omega * component.value));
    default:
      throw new Error(`Unknown component type: ${component.type}`);
  }
}

function elementAbcd(component, omega) {
  const z = componentImpedance(component, omega);
  if (component.placement === 'series') {
    return [
      [real(1), z],
      [real(0), real(1)],
    ];
  }
  if (component.placement === 'shunt') {
    return [
      [real(1), real(0)],
      [complexInv(z), real(1)],
    ];
  }
  throw new Error(`Unknown placement: ${component.placement}`);
}

function multiplyAbcd(m1, m2) {
  const entry = (row, col) => complexAdd(complexMul(m1[row][0], m2[0][col]), complexMul(m1[row][1], m2[1][col]));
  return [
    [entry(0, 0), entry(0, 1)],
    [entry(1, 0), entry(1, 1)],
  ];
}

const IDENTITY_ABCD = [
  [real(1), real(0)],
  [real(0), real(1)],
];

/**
 * Voltage transfer function H(f) = V_load/V_source for a ladder network of
 * series/shunt components, at each given frequency.
 *
 * @param {number[]|Float64Array} frequenciesHz
 * @param {{type: 'resistor'|'inductor'|'capacitor', placement: 'series'|'shunt', value: number}[]} components
 *   ordered from the source side to the load side; value is ohms, henries
 *   or farads to match the component type
 * @param {[number, number][]} loadImpedances - complex impedance (ohms) at each frequency, same length/order as frequenciesHz
 * @returns {[number, number][]} complex transfer function values, one per frequency
 */
export function networkTransferFunction(frequenciesHz, components, loadImpedances) {
  if (loadImpedances.length !== frequenciesHz.length) {
    throw new Error('loadImpedances must have one entry per frequency');
  }
  const transferFunction = [];
  for (let i = 0; i < frequenciesHz.length; i++) {
    const omega = 2 * Math.PI * frequenciesHz[i];
    let abcd = IDENTITY_ABCD;
    for (const component of components) abcd = multiplyAbcd(abcd, elementAbcd(component, omega));

    const zLoad = loadImpedances[i];
    const [[A, B]] = abcd;
    const denominator = complexAdd(complexMul(A, zLoad), B);
    transferFunction.push(complexDiv(zLoad, denominator));
  }
  return transferFunction;
}
