import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { logSpace } from '../../src/diffraction.js';
import { sealedBoxAlignment, sealedBoxResponseDb, sealedBoxExcursionMm } from '../../src/sealed-box.js';
import { ventedBoxAlignment, ventedBoxResponseDb, ventedBoxExcursionMm } from '../../src/vented-box.js';
import { chartTheme } from '../../src/chart-theme.js';

const SCHEMA_VERSION = 1;
const KIND = 'box';

const DEFAULT_PROJECT = {
  schemaVersion: SCHEMA_VERSION,
  kind: KIND,
  name: 'Example: 6.5" woofer, sealed',
  boxType: 'sealed',
  fsHz: 30,
  qts: 0.35,
  vasL: 60,
  vbL: 20,
  fbHz: 32,
  blTm: 7,
  reOhm: 6,
  mmsGrams: 15,
  sdCm2: 133,
  voltageV: 2.83,
};

const DRIVER_FIELDS = [
  { key: 'fsHz', label: 'Fs - free-air resonance (Hz)', min: 1, hint: 'From the driver’s datasheet' },
  { key: 'qts', label: 'Qts - total Q', min: 0.05, hint: 'From the datasheet; typically 0.2–0.6' },
  { key: 'vasL', label: 'Vas - compliance volume (L)', min: 0.1, hint: 'From the datasheet' },
];

const BOX_FIELDS = {
  sealed: [{ key: 'vbL', label: 'Vb - net box volume (L)', min: 0.1, hint: 'After driver, bracing and port displacement' }],
  vented: [
    { key: 'vbL', label: 'Vb - net box volume (L)', min: 0.1, hint: 'After driver, bracing and port displacement' },
    { key: 'fbHz', label: 'Fb - port tuning frequency (Hz)', min: 1, hint: 'The Helmholtz resonance of box + port' },
  ],
};

const EXCURSION_FIELDS = {
  sealed: [
    { key: 'blTm', label: 'Bl - force factor (T·m)', min: 0.1, hint: 'From the datasheet' },
    { key: 'reOhm', label: 'Re - DC resistance (Ω)', min: 0.1, hint: 'From the datasheet' },
    { key: 'mmsGrams', label: 'Mms - moving mass (g)', min: 0.1, hint: 'Cone + voice coil + air load' },
    { key: 'voltageV', label: 'Drive voltage (Vrms)', min: 0.01, hint: 'e.g. 2.83V ≈ 1W into 8Ω' },
  ],
  vented: [
    { key: 'blTm', label: 'Bl - force factor (T·m)', min: 0.1, hint: 'From the datasheet' },
    { key: 'reOhm', label: 'Re - DC resistance (Ω)', min: 0.1, hint: 'From the datasheet' },
    { key: 'sdCm2', label: 'Sd - effective piston area (cm²)', min: 1, hint: 'From the datasheet' },
    { key: 'voltageV', label: 'Drive voltage (Vrms)', min: 0.01, hint: 'e.g. 2.83V ≈ 1W into 8Ω' },
  ],
};

function fieldGroups(project) {
  return [
    { legend: 'Driver (Thiele-Small)', fields: DRIVER_FIELDS },
    { legend: 'Enclosure', fields: BOX_FIELDS[project.boxType] },
    { legend: 'Drive signal (for excursion)', fields: EXCURSION_FIELDS[project.boxType] },
  ];
}

function loadProject() {
  try {
    const saved = localStorage.getItem('box-project');
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
  localStorage.setItem('box-project', JSON.stringify(project));
}

function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `${project.name || 'box'}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readoutItem(label, value, unit) {
  return el('div.readout-item', [
    el('span.readout-label', label),
    el('span.readout-value', [value, unit ? el('small', ` ${unit}`) : null]),
  ]);
}

function App() {
  let project = loadProject();
  const inputs = {};

  const nameInput = el('input', { type: 'text', value: project.name, id: 'field-name' });
  const boxTypeSelect = el('select', { id: 'field-boxType' }, [
    el('option', { value: 'sealed' }, 'Sealed (closed box)'),
    el('option', { value: 'vented' }, 'Vented (reflex, port)'),
  ]);
  boxTypeSelect.value = project.boxType;

  const fieldsetsContainer = el('div');
  const errorBox = el('p.error-text', { style: { display: 'none' } });
  const readout = el('div.readout');

  const responseChartContainer = el('div');
  const excursionChartContainer = el('div');
  const excursionPanel = el('div.chart-panel', [
    el('h2', 'Cone excursion (peak, for the given drive voltage)'),
    excursionChartContainer,
  ]);
  let responseChart;
  let excursionChart;

  function rebuildFields() {
    fieldsetsContainer.textContent = '';
    for (const key of Object.keys(inputs)) delete inputs[key];
    for (const { legend, fields } of fieldGroups(project)) {
      fieldsetsContainer.appendChild(
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
    }
  }

  function recompute() {
    for (const { fields } of fieldGroups(project)) {
      for (const { key, min } of fields) {
        const value = Number(inputs[key].value);
        if (!Number.isFinite(value) || value < (min ?? -Infinity)) {
          errorBox.textContent = `${inputs[key].id} must be a number ≥ ${min}`;
          errorBox.style.display = '';
          return;
        }
        project[key] = value;
      }
    }
    project.name = nameInput.value;
    project.boxType = boxTypeSelect.value;
    errorBox.style.display = 'none';
    saveProject(project);

    try {
      const freqs = logSpace(10, 2000, 500);
      const sealedParams = { fsHz: project.fsHz, qts: project.qts, vasL: project.vasL, vbL: project.vbL };
      readout.textContent = '';

      if (project.boxType === 'vented') {
        const ventedParams = { ...sealedParams, fbHz: project.fbHz };
        const { h, alpha } = ventedBoxAlignment(ventedParams);
        readout.appendChild(readoutItem('h (Fb/Fs)', h.toFixed(3)));
        readout.appendChild(readoutItem('α (Vas/Vb)', alpha.toFixed(3)));
        const gains = ventedBoxResponseDb(freqs, ventedParams);
        responseChart.setData([Array.from(freqs), Array.from(gains)]);

        const excursionParams = {
          ...ventedParams,
          blTm: project.blTm,
          reOhm: project.reOhm,
          sdM2: project.sdCm2 / 10000,
          voltageV: project.voltageV,
        };
        const excursion = ventedBoxExcursionMm(freqs, excursionParams);
        excursionChart.setData([Array.from(freqs), Array.from(excursion)]);
      } else {
        const { fcHz, qtc } = sealedBoxAlignment(sealedParams);
        readout.appendChild(readoutItem('Fc', fcHz.toFixed(1), 'Hz'));
        readout.appendChild(readoutItem('Qtc', qtc.toFixed(3)));
        const gains = sealedBoxResponseDb(freqs, sealedParams);
        responseChart.setData([Array.from(freqs), Array.from(gains)]);

        const excursionParams = {
          ...sealedParams,
          blTm: project.blTm,
          reOhm: project.reOhm,
          mmsKg: project.mmsGrams / 1000,
          voltageV: project.voltageV,
        };
        const excursion = sealedBoxExcursionMm(freqs, excursionParams);
        excursionChart.setData([Array.from(freqs), Array.from(excursion)]);
      }
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = '';
    }
  }

  boxTypeSelect.addEventListener('change', () => {
    project.boxType = boxTypeSelect.value;
    rebuildFields();
    recompute();
  });
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
      boxTypeSelect.value = project.boxType;
      rebuildFields();
      for (const { fields } of fieldGroups(project)) for (const { key } of fields) inputs[key].value = project[key];
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
      el('label', ['Box type', boxTypeSelect]),
      fieldsetsContainer,
      errorBox,
      readout,
      el(
        'small.hint',
        'Saved automatically in this browser as you work. Export a project file to back it up, move it to another device, or share it — clearing this browser’s site data will otherwise lose it.'
      ),
      el('div.actions', [exportButton, importButton, importInput]),
    ]),
    el('div.chart-panel', [el('h2', 'On-axis response'), responseChartContainer]),
    excursionPanel,
  ]);

  rebuildFields();
  mount(document.getElementById('app'), root);

  const theme = chartTheme();
  const chartOptionsFor = (yLabel) => ({
    width: responseChartContainer.clientWidth,
    height: 320,
    scales: { x: { time: false, distr: 3 /* log */ } },
    axes: [
      {
        label: 'Frequency (Hz)',
        values: (_u, vals) => vals.map((v) => (v >= 1000 ? `${v / 1000}k` : v)),
        stroke: theme.inkMuted,
        grid: { stroke: theme.border, width: 1 },
        font: `12px ${theme.fontSans}`,
      },
      { label: yLabel, stroke: theme.inkMuted, grid: { stroke: theme.border, width: 1 }, font: `12px ${theme.fontSans}` },
    ],
    series: [{}, { label: yLabel, stroke: theme.accent, width: 2 }],
  });

  responseChart = new uPlot(chartOptionsFor('Gain relative to infinite baffle (dB)'), [[1, 2], [0, 0]], responseChartContainer);
  excursionChart = new uPlot(
    { ...chartOptionsFor('Excursion (mm)'), width: excursionChartContainer.clientWidth },
    [[1, 2], [0, 0]],
    excursionChartContainer
  );

  new ResizeObserver(([entry]) => responseChart.setSize({ width: entry.contentRect.width, height: 320 })).observe(
    responseChartContainer
  );
  new ResizeObserver(([entry]) => excursionChart.setSize({ width: entry.contentRect.width, height: 320 })).observe(
    excursionChartContainer
  );

  recompute();
}

App();
