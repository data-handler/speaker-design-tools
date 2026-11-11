import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertProject, removeProject, sortByRecency } from '../src/project-library.js';

test('upsertProject with no id creates a new record with a generated id', () => {
  const { records, id } = upsertProject([], { name: 'My first design', data: { foo: 1 } });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, id);
  assert.equal(records[0].name, 'My first design');
  assert.deepEqual(records[0].data, { foo: 1 });
  assert.ok(typeof records[0].updatedAt === 'number');
});

test('upsertProject with a matching id replaces that record in place, keeping array order', () => {
  const first = upsertProject([], { name: 'A', data: { v: 1 } });
  const second = upsertProject(first.records, { name: 'B', data: { v: 2 } });
  assert.equal(second.records.length, 2);

  const updated = upsertProject(second.records, { id: first.id, name: 'A renamed', data: { v: 3 } });
  assert.equal(updated.records.length, 2);
  assert.equal(updated.id, first.id);
  assert.equal(updated.records[0].name, 'A renamed');
  assert.deepEqual(updated.records[0].data, { v: 3 });
  assert.equal(updated.records[1].name, 'B'); // untouched, still in its original slot
});

test('upsertProject with an id that does not match any existing record creates a new one instead of throwing', () => {
  const { records } = upsertProject([{ id: 'does-not-exist', name: 'X', updatedAt: 0, data: {} }], {
    id: 'some-other-id',
    name: 'New one',
    data: {},
  });
  assert.equal(records.length, 2);
  assert.ok(records.some((r) => r.name === 'New one' && r.id !== 'some-other-id'));
});

test('upsertProject clones the data, so later mutating the original object does not change the saved record', () => {
  const liveProject = { name: 'A', value: 1 };
  const { records } = upsertProject([], { name: 'A', data: liveProject });
  liveProject.value = 999; // simulate the editor continuing to mutate its live project object
  assert.equal(records[0].data.value, 1);
});

test('upsertProject generates distinct ids for repeated new entries', () => {
  const a = upsertProject([], { name: 'A', data: {} });
  const b = upsertProject(a.records, { name: 'B', data: {} });
  assert.notEqual(a.id, b.id);
});

test('removeProject removes only the matching record', () => {
  const { records: afterA } = upsertProject([], { name: 'A', data: {} });
  const { records: afterB, id: idB } = upsertProject(afterA, { name: 'B', data: {} });
  const remaining = removeProject(afterB, idB);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].name, 'A');
});

test('removeProject with an id that does not exist is a no-op', () => {
  const { records } = upsertProject([], { name: 'A', data: {} });
  assert.deepEqual(removeProject(records, 'nope'), records);
});

test('sortByRecency orders most recently updated first without mutating the input', () => {
  const records = [
    { id: '1', name: 'old', updatedAt: 100, data: {} },
    { id: '2', name: 'newest', updatedAt: 300, data: {} },
    { id: '3', name: 'middle', updatedAt: 200, data: {} },
  ];
  const sorted = sortByRecency(records);
  assert.deepEqual(
    sorted.map((r) => r.name),
    ['newest', 'middle', 'old']
  );
  // original array order is untouched
  assert.equal(records[0].name, 'old');
});
