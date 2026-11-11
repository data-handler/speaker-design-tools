// A small saved-projects library, shared by all three tools, on top of the
// single-slot autosave each tool already has (which stays as-is - it's the
// safety net that restores your in-progress work on reopening a tab). This
// is the explicit, named "Save/Open/Delete" layer HANDOVER.md originally
// called for (as IndexedDB) but which was never actually built - a
// single-slot autosave plus a manual file export is not a substitute for
// keeping more than one design.
//
// Built on localStorage rather than IndexedDB: this project already uses
// localStorage everywhere else, with no prior IndexedDB code to build on,
// and the data here (plain-text project JSON, including any embedded .frd/
// .zma measurement text) is nowhere near localStorage's several-MB-per-origin
// ceiling even with a sizeable library. IndexedDB's async, transactional API
// is a lot of surface area to get right for a feature whose whole point is
// not losing someone's work - simplicity here is the safer choice.
//
// The functions below that take and return a plain records array are pure
// (no localStorage access) and unit-tested directly; loadLibrary/saveLibrary
// are the only functions that touch localStorage, and are exercised by the
// tools' own Playwright end-to-end tests instead, same as the rest of this
// project's browser-only code.

function generateProjectId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * @param {Array<{id: string, name: string, updatedAt: number, data: object}>} records
 * @param {{id?: string, name: string, data: object}} entry - id omitted (or not matching
 *   an existing record) creates a new entry; a matching id replaces that record in place.
 * @returns {{records: Array, id: string}} the new records array and the id that was written
 */
export function upsertProject(records, entry) {
  const id = entry.id && records.some((r) => r.id === entry.id) ? entry.id : generateProjectId();
  // Cloned defensively: the caller's project object is typically still being
  // live-edited after this call (it's the same object the editor keeps
  // mutating in place) - without this, a record "saved" here would silently
  // keep changing to match whatever the editor does next.
  const record = { id, name: entry.name, updatedAt: Date.now(), data: structuredClone(entry.data) };
  const index = records.findIndex((r) => r.id === id);
  const next = index === -1 ? [...records, record] : records.map((r, i) => (i === index ? record : r));
  return { records: next, id };
}

/**
 * @param {Array<{id: string}>} records
 * @param {string} id
 */
export function removeProject(records, id) {
  return records.filter((r) => r.id !== id);
}

/** Most recently saved first. */
export function sortByRecency(records) {
  return [...records].sort((a, b) => b.updatedAt - a.updatedAt);
}

const STORAGE_KEY_PREFIX = 'project-library:';

/** @param {string} kind - the tool's own project `kind` discriminator (e.g. "box", "crossover") */
export function loadLibrary(kind) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + kind);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLibrary(kind, records) {
  localStorage.setItem(STORAGE_KEY_PREFIX + kind, JSON.stringify(records));
}
