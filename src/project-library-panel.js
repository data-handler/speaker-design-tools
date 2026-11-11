// A self-contained "Saved projects" panel (Save / Save as new / Open /
// Delete / New), shared by all three tools, sitting on top of whichever
// single-slot autosave each tool already has. Built with RE:DOM directly
// (same "classic style" as the rest of this project), just factored into
// one function so this one feature isn't hand-duplicated three times -
// unlike most of this codebase's per-tool UI code, getting this one wrong
// risks actually losing someone's work, so it's worth keeping to one
// implementation.
import { el } from '../vendor/redom/redom.es.min.js';
import { upsertProject, removeProject, sortByRecency, loadLibrary, saveLibrary } from './project-library.js';

/**
 * @param {{
 *   kind: string,
 *   nameInput: HTMLInputElement,
 *   getProjectData: () => object,
 *   applyProjectData: (data: object) => void,
 *   defaultProjectData: object,
 * }} options
 * @returns {{element: HTMLElement}}
 */
export function createProjectLibraryPanel({ kind, nameInput, getProjectData, applyProjectData, defaultProjectData }) {
  let records = sortByRecency(loadLibrary(kind));
  let openId = null; // the library entry currently loaded into the editor, if any

  const listContainer = el('div');
  const listSummary = el('summary');
  const statusBox = el('small.hint');
  const saveButton = el('button.secondary', { type: 'button' });
  const saveAsNewButton = el('button.secondary', { type: 'button' }, 'Save as new');
  const newButton = el('button.secondary', { type: 'button' }, 'New');

  function confirmSwitch() {
    return confirm('This will replace what’s in the editor now. Save it to your library first if you want to keep it.');
  }

  function updateSaveButton() {
    saveButton.textContent = openId ? 'Save' : 'Save as new project';
  }

  function renderList() {
    listContainer.textContent = '';
    listSummary.textContent = records.length === 0 ? 'Saved designs (none yet)' : `Saved designs (${records.length})`;
    if (records.length === 0) {
      listContainer.appendChild(el('p.hint', 'Nothing saved yet — name and save the design below to add one.'));
      return;
    }
    for (const record of records) {
      const isOpen = record.id === openId;
      // Not disabled even when already open: clicking it is also how you
      // discard unsaved edits and revert to the last-saved version of the
      // design you're currently working on.
      const openButton = el('button.secondary', { type: 'button' }, isOpen ? 'Revert to saved' : 'Open');
      const deleteButton = el('button.secondary', { type: 'button' }, 'Delete');

      openButton.addEventListener('click', () => {
        if (!confirmSwitch()) return;
        applyProjectData(structuredClone(record.data));
        openId = record.id;
        renderList();
        updateSaveButton();
        statusBox.textContent = `Opened "${record.name}".`;
      });
      deleteButton.addEventListener('click', () => {
        if (!confirm(`Delete "${record.name}"? This can’t be undone.`)) return;
        records = removeProject(records, record.id);
        saveLibrary(kind, records);
        if (openId === record.id) openId = null;
        renderList();
        updateSaveButton();
        statusBox.textContent = `Deleted "${record.name}".`;
      });

      listContainer.appendChild(
        el('div.field-grid', { style: { alignItems: 'center', marginBottom: '0.5rem' } }, [
          el('span', [record.name, el('br'), el('small.hint', { style: { margin: 0 } }, `Saved ${new Date(record.updatedAt).toLocaleString()}`)]),
          el('div.actions', { style: { margin: 0 } }, [openButton, deleteButton]),
        ])
      );
    }
  }

  function doSave(forceNew) {
    const name = nameInput.value || 'Untitled';
    const { records: next, id } = upsertProject(records, {
      id: forceNew ? undefined : openId,
      name,
      data: getProjectData(),
    });
    records = sortByRecency(next);
    openId = id;
    saveLibrary(kind, records);
    renderList();
    updateSaveButton();
    statusBox.textContent = `Saved "${name}".`;
  }

  saveButton.addEventListener('click', () => doSave(false));
  saveAsNewButton.addEventListener('click', () => doSave(true));
  newButton.addEventListener('click', () => {
    if (!confirmSwitch()) return;
    applyProjectData(structuredClone(defaultProjectData));
    openId = null;
    renderList();
    updateSaveButton();
    statusBox.textContent = 'Started a new project.';
  });

  renderList();
  updateSaveButton();

  // Browsing/opening a saved design comes first, deliberately before the
  // name field: a saved design already has its own name, so leading with
  // "name this" and only mentioning "or open one" as an afterthought had it
  // backwards - opening one replaces the name (and everything else) anyway.
  // Naming and saving *this* design is the second, separate step, once you
  // know that's what you're doing.
  const element = el('div', [
    el('p.hint', 'Open a design you’ve saved before:'),
    el('details', [listSummary, listContainer]),
    el('p.hint', { style: { marginTop: '1rem' } }, 'Or keep working on this one - name it and save it to come back to later:'),
    el('label', ['Project name', nameInput]),
    el('div.actions', [saveButton, saveAsNewButton, newButton]),
    statusBox,
  ]);

  return { element };
}
