// Parsers for the .frd (frequency response: SPL + phase) and .zma
// (impedance magnitude + phase) file formats exported by REW, ARTA, CLIO,
// LIMP and others. There's no formal spec - the format originates with LEAP
// and has become a de facto standard by convention - but every source
// agrees on the core layout: one data row per frequency, three whitespace-
// separated columns, with any line starting '*' treated as a header/comment
// to skip. We're lenient beyond that (tabs as well as spaces, blank lines,
// a non-numeric stray header line even without a leading '*', extra trailing
// columns such as FRD's optional coherence value) since real-world files
// from various tools don't always follow the convention exactly, and being
// strict here would just mean rejecting otherwise-good data.

function parseDataLines(text) {
  const rows = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('*')) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 3) continue;
    const [frequencyHz, column2, phaseDeg] = tokens.map(Number);
    if (![frequencyHz, column2, phaseDeg].every(Number.isFinite)) continue;
    rows.push([frequencyHz, column2, phaseDeg]);
  }
  // The format is specified as already frequency-ascending, but sort
  // defensively anyway - downstream interpolation assumes it, and a
  // slightly out-of-order export shouldn't be a hard failure.
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
}

/**
 * @param {string} text
 * @returns {{frequenciesHz: Float64Array, magnitudeDb: Float64Array, phaseDeg: Float64Array}}
 */
export function parseFrd(text) {
  const rows = parseDataLines(text);
  if (rows.length === 0) throw new Error('No frequency/magnitude/phase data found in this .frd file');
  return {
    frequenciesHz: Float64Array.from(rows, (r) => r[0]),
    magnitudeDb: Float64Array.from(rows, (r) => r[1]),
    phaseDeg: Float64Array.from(rows, (r) => r[2]),
  };
}

/**
 * @param {string} text
 * @returns {{frequenciesHz: Float64Array, magnitudeOhm: Float64Array, phaseDeg: Float64Array}}
 */
export function parseZma(text) {
  const rows = parseDataLines(text);
  if (rows.length === 0) throw new Error('No frequency/impedance/phase data found in this .zma file');
  if (rows.some((r) => r[1] <= 0)) throw new Error('Impedance magnitude must be positive throughout a .zma file');
  return {
    frequenciesHz: Float64Array.from(rows, (r) => r[0]),
    magnitudeOhm: Float64Array.from(rows, (r) => r[1]),
    phaseDeg: Float64Array.from(rows, (r) => r[2]),
  };
}
