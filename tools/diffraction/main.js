import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { baffleDiffractionDb, logSpace } from '../../src/diffraction.js';
import { chartTheme } from '../../src/chart-theme.js';
import { createProjectLibraryPanel } from '../../src/project-library-panel.js';

const SCHEMA_VERSION = 1;
const KIND = 'diffraction';

const DEFAULT_PROJECT = {
  schemaVersion: SCHEMA_VERSION,
  kind: KIND,
  name: 'Example: 6.5" two-way baffle',
  baffleWidthMm: 300,
  baffleHeightMm: 500,
  driverOffsetXMm: 150,
  driverOffsetYMm: 150,
  driverDiameterMm: 130,
  listenDistanceMm: 1000,
};

const FIELD_GROUPS = [
  {
    legend: 'Baffle',
    fields: [
      { key: 'baffleWidthMm', label: 'Width (mm)', min: 50, hint: 'Edge to edge across the front panel' },
      { key: 'baffleHeightMm', label: 'Height (mm)', min: 50, hint: 'Edge to edge, top to bottom' },
    ],
  },
  {
    legend: 'Driver position',
    fields: [
      { key: 'driverOffsetXMm', label: 'Offset from left (mm)', min: 0, hint: 'Driver centre to the nearest side edge' },
      { key: 'driverOffsetYMm', label: 'Offset from top (mm)', min: 0, hint: 'Driver centre to the top edge' },
      { key: 'driverDiameterMm', label: 'Cone diameter (mm)', min: 0, hint: 'Softens ripple vs. treating the driver as a point source' },
    ],
  },
  {
    legend: 'Listening position',
    fields: [
      { key: 'listenDistanceMm', label: 'On-axis distance (mm)', min: 100, hint: 'Measurement/listening distance from the baffle' },
    ],
  },
];
const FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

function loadProject() {
  try {
    const saved = localStorage.getItem('diffraction-project');
    if (!saved) return { ...DEFAULT_PROJECT };
    const parsed = JSON.parse(saved);
    if (parsed.kind !== KIND) return { ...DEFAULT_PROJECT };
    // No migrations exist yet; add one per schemaVersion bump when needed.
    return { ...DEFAULT_PROJECT, ...parsed };
  } catch {
    return { ...DEFAULT_PROJECT };
  }
}

function saveProject(project) {
  localStorage.setItem('diffraction-project', JSON.stringify(project));
}

function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `${project.name || 'baffle'}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function computeCurve(project) {
  const freqs = logSpace(20, 20000, 400);
  const gainDb = baffleDiffractionDb(freqs, {
    baffleWidthM: project.baffleWidthMm / 1000,
    baffleHeightM: project.baffleHeightMm / 1000,
    driverOffsetXM: project.driverOffsetXMm / 1000,
    driverOffsetYM: project.driverOffsetYMm / 1000,
    driverDiameterM: project.driverDiameterMm / 1000,
    listenDistanceM: project.listenDistanceMm / 1000,
  });
  return [Array.from(freqs), Array.from(gainDb)];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
  return node;
}

// A draggable top-down view of the baffle: lets you reposition the driver by
// dragging, nudging with arrow keys, or typing in the numeric fields (both
// directions stay in sync). viewBox is set to the baffle's own mm
// dimensions, so SVG handles the pixel scaling and all the geometry below is
// just plain millimetres.
function createBaffleView({ onDrag }) {
  const outline = svgEl('rect', { class: 'baffle-outline', x: 0, y: 0 });
  const crosshairX = svgEl('line', { class: 'driver-crosshair' });
  const crosshairY = svgEl('line', { class: 'driver-crosshair' });
  const handle = svgEl('circle', { class: 'driver-handle', tabindex: '0', role: 'slider', 'aria-label': 'Driver position' });
  const svg = svgEl('svg', { class: 'baffle-view' });
  svg.append(outline, crosshairX, crosshairY, handle);

  let widthMm = 1;
  let heightMm = 1;
  let radiusMm = 1;

  function clientPointToMm(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * widthMm,
      y: ((clientY - rect.top) / rect.height) * heightMm,
    };
  }

  function startDrag(pointerEvent) {
    pointerEvent.preventDefault();
    handle.setPointerCapture(pointerEvent.pointerId);
    handle.focus();
    const move = (e) => onDrag(clientPointToMm(e.clientX, e.clientY));
    move(pointerEvent);
    handle.addEventListener('pointermove', move);
    handle.addEventListener(
      'pointerup',
      () => handle.removeEventListener('pointermove', move),
      { once: true }
    );
  }
  handle.addEventListener('pointerdown', startDrag);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    const deltas = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    onDrag({ x: handle._mmX + delta[0], y: handle._mmY + delta[1] });
  });

  function update(project) {
    widthMm = project.baffleWidthMm;
    heightMm = project.baffleHeightMm;
    radiusMm = project.driverDiameterMm / 2;
    svg.setAttribute('viewBox', `0 0 ${widthMm} ${heightMm}`);
    outline.setAttribute('width', widthMm);
    outline.setAttribute('height', heightMm);

    const x = project.driverOffsetXMm;
    const y = project.driverOffsetYMm;
    handle._mmX = x;
    handle._mmY = y;
    handle.setAttribute('cx', x);
    handle.setAttribute('cy', y);
    handle.setAttribute('r', radiusMm);
    handle.setAttribute('aria-valuetext', `${x.toFixed(0)}mm from left, ${y.toFixed(0)}mm from top`);
    crosshairX.setAttribute('x1', 0);
    crosshairX.setAttribute('x2', widthMm);
    crosshairX.setAttribute('y1', y);
    crosshairX.setAttribute('y2', y);
    crosshairY.setAttribute('x1', x);
    crosshairY.setAttribute('x2', x);
    crosshairY.setAttribute('y1', 0);
    crosshairY.setAttribute('y2', heightMm);

    const overlapsEdge = x - radiusMm < 0 || x + radiusMm > widthMm || y - radiusMm < 0 || y + radiusMm > heightMm;
    handle.setAttribute('stroke-dasharray', overlapsEdge ? '3 2' : 'none');
    return overlapsEdge;
  }

  return { element: svg, update };
}

function App() {
  let project = loadProject();
  const inputs = {};

  const fieldsets = FIELD_GROUPS.map(({ legend, fields }) =>
    el('fieldset', [
      el('legend', legend),
      el(
        'div.field-grid',
        fields.map(({ key, label, min, hint }) => {
          const input = el('input', { type: 'number', min, step: 'any', value: project[key], id: `field-${key}` });
          input.addEventListener('input', recompute);
          inputs[key] = input;
          return el('label', [label, input, el('small.hint', hint)]);
        })
      ),
    ])
  );

  const nameInput = el('input', { type: 'text', value: project.name, id: 'field-name' });
  const errorBox = el('p.error-text', { style: { display: 'none' } });
  const edgeWarning = el('p.error-text', { style: { display: 'none' } }, 'The driver overlaps the baffle edge.');

  const chartContainer = el('div');
  let chart;
  let pinnedLabel = el('span', 'No trace pinned');

  const baffleView = createBaffleView({
    onDrag: (mm) => {
      const margin = project.driverDiameterMm / 2;
      inputs.driverOffsetXMm.value = Math.max(margin, Math.min(project.baffleWidthMm - margin, mm.x)).toFixed(0);
      inputs.driverOffsetYMm.value = Math.max(margin, Math.min(project.baffleHeightMm - margin, mm.y)).toFixed(0);
      recompute();
    },
  });

  function recompute() {
    for (const { key, min } of FIELDS) {
      const value = Number(inputs[key].value);
      if (!Number.isFinite(value) || value < (min ?? -Infinity)) {
        errorBox.textContent = `${inputs[key].id} must be a number ≥ ${min}`;
        errorBox.style.display = '';
        return;
      }
      project[key] = value;
    }
    project.name = nameInput.value;
    errorBox.style.display = 'none';

    saveProject(project);
    try {
      const [freqs, gains] = computeCurve(project);
      const overlapsEdge = baffleView.update(project);
      edgeWarning.style.display = overlapsEdge ? '' : 'none';
      const pinned = chart.data[2] ?? freqs.map(() => null);
      chart.setData([freqs, gains, pinned]);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = '';
    }
  }

  nameInput.addEventListener('input', recompute);

  const pinButton = el('button.secondary', { type: 'button' }, 'Pin this trace');
  pinButton.addEventListener('click', () => {
    const [freqs, gains] = chart.data;
    chart.setData([freqs, gains, gains.slice()]);
    pinnedLabel.textContent = `Pinned: ${project.name}`;
  });
  const clearPinButton = el('button.secondary', { type: 'button' }, 'Clear pinned trace');
  clearPinButton.addEventListener('click', () => {
    const [freqs, gains] = chart.data;
    chart.setData([freqs, gains, freqs.map(() => null)]);
    pinnedLabel.textContent = 'No trace pinned';
  });

  const exportButton = el('button', { type: 'button' }, 'Export project (.json)');
  exportButton.addEventListener('click', () => downloadJson(project));

  function applyProject(parsed) {
    project = { ...DEFAULT_PROJECT, ...parsed };
    nameInput.value = project.name;
    for (const { key } of FIELDS) inputs[key].value = project[key];
    recompute();
  }

  const importInput = el('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.kind !== KIND) throw new Error(`Expected kind "${KIND}", got "${parsed.kind}"`);
      applyProject(parsed);
    } catch (err) {
      errorBox.textContent = `Could not load project: ${err.message}`;
      errorBox.style.display = '';
    }
  });
  const importButton = el('button.secondary', { type: 'button' }, 'Import project…');
  importButton.addEventListener('click', () => importInput.click());

  const projectLibraryPanel = createProjectLibraryPanel({
    kind: KIND,
    getProjectName: () => project.name,
    getProjectData: () => project,
    applyProjectData: applyProject,
    defaultProjectData: DEFAULT_PROJECT,
  });

  const root = el('div', [
    el('form', { onsubmit: (e) => e.preventDefault() }, [
      el('label', ['Project name', nameInput]),
      el('fieldset', [el('legend', 'Save or open a design'), projectLibraryPanel.element]),
      el(
        'small.hint',
        'Saved automatically in this browser as you work. Export a project file to back it up, move it to another device, or share it — clearing this browser’s site data will otherwise lose it.'
      ),
      el('div.actions', [exportButton, importButton, importInput]),
      ...fieldsets,
      errorBox,
    ]),
    el('div.chart-panel', [
      el('h2', 'Baffle layout'),
      baffleView.element,
      el('p.baffle-view-caption', 'Drag the driver to reposition it, or use arrow keys (hold Shift to move faster) once it has focus.'),
      edgeWarning,
    ]),
    el('div.chart-panel', [
      el('h2', 'On-axis response'),
      chartContainer,
      el('div.actions', [pinButton, clearPinButton, pinnedLabel]),
    ]),
  ]);

  mount(document.getElementById('app'), root);

  const theme = chartTheme();
  chart = new uPlot(
    {
      width: chartContainer.clientWidth,
      height: 360,
      scales: { x: { time: false, distr: 3 /* log */ } },
      axes: [
        {
          label: 'Frequency (Hz)',
          values: (_u, vals) => vals.map((v) => (v >= 1000 ? `${v / 1000}k` : v)),
          stroke: theme.inkMuted,
          grid: { stroke: theme.border, width: 1 },
          font: `12px ${theme.fontSans}`,
        },
        {
          label: 'Gain relative to infinite baffle (dB)',
          stroke: theme.inkMuted,
          grid: { stroke: theme.border, width: 1 },
          font: `12px ${theme.fontSans}`,
        },
      ],
      series: [
        {},
        { label: 'On-axis response', stroke: theme.accent, width: 2 },
        { label: 'Pinned', stroke: theme.inkMuted, width: 1, dash: [4, 3] },
      ],
    },
    [[1, 2], [0, 0], [null, null]],
    chartContainer
  );
  new ResizeObserver(([entry]) => chart.setSize({ width: entry.contentRect.width, height: 360 })).observe(
    chartContainer
  );

  recompute();
}

App();
