import { el, mount } from '../../vendor/redom/redom.es.min.js';

// Project file shape (schemaVersion is independent of app version; bump it
// and add a migration step whenever this shape changes).
const DEFAULT_PROJECT = {
  schemaVersion: 1,
  kind: 'diffraction',
  name: 'Untitled project',
  driver: { diameter_mm: 100, offsetX_mm: 0, offsetY_mm: 0 },
  baffle: { width_mm: 300, height_mm: 500 },
};

function Placeholder() {
  return el('article', [
    el('p', 'Tool UI not built yet — this is the app-shell skeleton.'),
    el('p', el('small', `Starting project shape: ${JSON.stringify(DEFAULT_PROJECT)}`)),
  ]);
}

mount(document.getElementById('app'), Placeholder());
