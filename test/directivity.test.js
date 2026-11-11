import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneWeights, powerResponseDb, nearestAngleIndex } from '../src/directivity.js';

test('zoneWeights always sums to 1 (the full front-hemisphere solid angle, 0 to 90 degrees), regardless of how many angles or how they are spaced', () => {
  for (const angles of [[0], [0, 90], [0, 45, 90], [0, 15, 30, 45, 60, 75, 90], [0, 10, 60, 90]]) {
    const weights = zoneWeights(angles);
    const sum = weights.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `angles ${angles}: weight sum ${sum}`);
  }
});

test('zoneWeights for [0, 45, 90] matches the hand-worked spherical-zone areas', () => {
  // Zone boundaries are at the midpoints: 0-22.5, 22.5-67.5, 67.5-90.
  const [w0, w45, w90] = zoneWeights([0, 45, 90]);
  const deg = Math.PI / 180;
  assert.ok(Math.abs(w0 - (Math.cos(0) - Math.cos(22.5 * deg))) < 1e-12);
  assert.ok(Math.abs(w45 - (Math.cos(22.5 * deg) - Math.cos(67.5 * deg))) < 1e-12);
  assert.ok(Math.abs(w90 - (Math.cos(67.5 * deg) - Math.cos(90 * deg))) < 1e-12);
});

test('zoneWeights for [0, 90] (only two measured angles) gives the 0-45 and 45-90 zone areas, not equal weights', () => {
  const [w0, w90] = zoneWeights([0, 90]);
  const deg = Math.PI / 180;
  assert.ok(Math.abs(w0 - (Math.cos(0) - Math.cos(45 * deg))) < 1e-12);
  assert.ok(Math.abs(w90 - (Math.cos(45 * deg) - Math.cos(90 * deg))) < 1e-12);
  // The 45-90 zone (nearer the "equator") sweeps more circumference per
  // degree than the 0-45 zone (nearer the pole/on-axis), so it must carry
  // more of the solid angle, not an equal half each.
  assert.ok(w90 > w0);
});

test('a single angle (on-axis only) gives the power response equal to that angle, exactly', () => {
  const onAxisDb = [90, 88, 85, 80, 70];
  const power = powerResponseDb([0], [onAxisDb]);
  assert.deepEqual(power, onAxisDb);
});

test('an omnidirectional source (identical response at every angle) gives that same response as the power response', () => {
  const dbAtEveryAngle = [91, 87, 83];
  const angles = [0, 30, 60, 90];
  const power = powerResponseDb(angles, angles.map(() => dbAtEveryAngle));
  for (let i = 0; i < dbAtEveryAngle.length; i++) {
    assert.ok(Math.abs(power[i] - dbAtEveryAngle[i]) < 1e-9);
  }
});

test('power response is always bounded between the loudest and quietest measured angle, at every frequency', () => {
  const angles = [0, 20, 45, 70, 90];
  const dbByAngle = [
    [90, 89, 85, 70],
    [90, 88, 83, 65],
    [89, 85, 78, 55],
    [87, 80, 68, 40],
    [84, 74, 58, 30],
  ];
  const power = powerResponseDb(angles, dbByAngle);
  for (let f = 0; f < 4; f++) {
    const atThisFreq = dbByAngle.map((row) => row[f]);
    const min = Math.min(...atThisFreq);
    const max = Math.max(...atThisFreq);
    assert.ok(power[f] >= min - 1e-9 && power[f] <= max + 1e-9, `freq index ${f}: power ${power[f]} not within [${min}, ${max}]`);
  }
});

test('worked example: angles [0, 60] with 0dB on-axis and -6.0206dB (half amplitude, quarter power) at 60 degrees', () => {
  // weight(0) = cos(0) - cos(30deg), weight(60) = cos(30deg) - cos(90deg)
  const deg = Math.PI / 180;
  const w0 = Math.cos(0) - Math.cos(30 * deg);
  const w60 = Math.cos(30 * deg) - Math.cos(90 * deg);
  const expectedEnergy = (w0 * 1 + w60 * 0.25) / (w0 + w60); // power ratios: 10^(0/10)=1, 10^(-6.0206/10)=0.25
  const expectedDb = 10 * Math.log10(expectedEnergy);

  const [power] = powerResponseDb([0, 60], [[0], [-6.0206]]);
  assert.ok(Math.abs(power - expectedDb) < 1e-6);
});

test('nearestAngleIndex picks the closest measured angle', () => {
  const angles = [0, 15, 30, 60, 90];
  assert.equal(nearestAngleIndex(angles, 0), 0);
  assert.equal(nearestAngleIndex(angles, 10), 1); // closer to 15 than 0
  assert.equal(nearestAngleIndex(angles, 5), 0); // closer to 0 than 15
  assert.equal(nearestAngleIndex(angles, 45), 2); // closer to 30 than 60
  assert.equal(nearestAngleIndex(angles, 90), 4);
  assert.equal(nearestAngleIndex(angles, 200), 4); // out of range clamps to the nearest end
});

test('nearestAngleIndex breaks an exact tie towards the earlier (more on-axis) angle', () => {
  assert.equal(nearestAngleIndex([0, 30], 15), 0);
  assert.equal(nearestAngleIndex([10, 20, 40], 30), 1);
});

test('nearestAngleIndex with a single angle always returns it', () => {
  assert.equal(nearestAngleIndex([0], 0), 0);
  assert.equal(nearestAngleIndex([0], 90), 0);
});
