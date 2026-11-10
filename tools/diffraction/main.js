import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { baffleDiffractionDb, logSpace } from '../../src/diffraction.js';
import { chartTheme } from '../../src/chart-theme.js';

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

  const chartContainer = el('div');
  let chart;

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
      const data = computeCurve(project);
      chart.setData(data);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = '';
    }
  }

  nameInput.addEventListener('input', recompute);

  const exportButton = el('button', { type: 'button' }, 'Export project (.json)');
  exportButton.addEventListener('click', () => downloadJson(project));

  const importInput = el('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.kind !== KIND) throw new Error(`Expected kind "${KIND}", got "${parsed.kind}"`);
      project = { ...DEFAULT_PROJECT, ...parsed };
      nameInput.value = project.name;
      for (const { key } of FIELDS) inputs[key].value = project[key];
      recompute();
    } catch (err) {
      errorBox.textContent = `Could not load project: ${err.message}`;
      errorBox.style.display = '';
    }
  });
  const importButton = el('button.secondary', { type: 'button' }, 'Import project…');
  importButton.addEventListener('click', () => importInput.click());

  const root = el('div', [
    el('form', { onsubmit: (e) => e.preventDefault() }, [
      el('label', ['Project name', nameInput]),
      ...fieldsets,
      errorBox,
      el('div.actions', [exportButton, importButton, importInput]),
    ]),
    el('div.chart-panel', [el('h2', 'On-axis response'), chartContainer]),
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
      series: [{}, { label: 'On-axis response', stroke: theme.accent, width: 2 }],
    },
    [[1, 2], [0, 0]],
    chartContainer
  );
  new ResizeObserver(([entry]) => chart.setSize({ width: entry.contentRect.width, height: 360 })).observe(
    chartContainer
  );

  recompute();
}

App();
