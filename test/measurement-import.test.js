import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrd, parseZma } from '../src/measurement-import.js';

test('parses basic space-delimited .frd data', () => {
  const text = '20 80.5 170.2\n100 85.1 120.0\n1000 83.2 -45.0\n';
  const { frequenciesHz, magnitudeDb, phaseDeg } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100, 1000]);
  assert.deepEqual(Array.from(magnitudeDb), [80.5, 85.1, 83.2]);
  assert.deepEqual(Array.from(phaseDeg), [170.2, 120.0, -45.0]);
});

test('skips header/comment lines starting with *, and blank lines', () => {
  const text = '* Exported by Example Software v1\n* Frequency SPL Phase\n\n20 80 0\n100 85 0\n';
  const { frequenciesHz } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100]);
});

test('tolerates tabs as well as spaces, despite the strict spec saying spaces only', () => {
  const text = '20\t80.5\t170.2\n100\t85.1\t120.0\n';
  const { frequenciesHz } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100]);
});

test('ignores extra trailing columns (e.g. FRD coherence)', () => {
  const text = '20 80.5 170.2 0.98\n100 85.1 120.0 0.99\n';
  const { frequenciesHz, magnitudeDb, phaseDeg } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100]);
  assert.deepEqual(Array.from(magnitudeDb), [80.5, 85.1]);
  assert.deepEqual(Array.from(phaseDeg), [170.2, 120.0]);
});

test('sorts rows into frequency-ascending order even if the file is not', () => {
  const text = '1000 83.2 -45.0\n20 80.5 170.2\n100 85.1 120.0\n';
  const { frequenciesHz } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100, 1000]);
});

test('skips malformed lines rather than throwing', () => {
  const text = '20 80.5 170.2\nnot a data line\n100 85.1 120.0\n';
  const { frequenciesHz } = parseFrd(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 100]);
});

test('throws a clear error when no data rows are found', () => {
  assert.throws(() => parseFrd('* just a header\n'), /No frequency/);
  assert.throws(() => parseFrd(''), /No frequency/);
});

test('parses .zma impedance data', () => {
  const text = '20 32.5 60.1\n1000 6.2 5.0\n';
  const { frequenciesHz, magnitudeOhm, phaseDeg } = parseZma(text);
  assert.deepEqual(Array.from(frequenciesHz), [20, 1000]);
  assert.deepEqual(Array.from(magnitudeOhm), [32.5, 6.2]);
  assert.deepEqual(Array.from(phaseDeg), [60.1, 5.0]);
});

test('rejects .zma data with a non-positive impedance magnitude', () => {
  assert.throws(() => parseZma('20 0 0\n100 6 5\n'), /positive/);
  assert.throws(() => parseZma('20 -3 0\n100 6 5\n'), /positive/);
});
