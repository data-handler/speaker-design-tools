import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { logSpace } from '../../src/diffraction.js';
import { sealedBoxAlignment, sealedBoxResponseDb, sealedBoxExcursionMm } from '../../src/sealed-box.js';
import { ventedBoxAlignment, ventedBoxResponseDb } from '../../src/vented-box.js';

const SCHEMA_VERSION = 1;
const KIND = 'box';

const DEFAULT_PROJECT = {
  schemaVersion: SCHEMA_VERSION,
  kind: KIND,
  name: 'Untitled box',
  boxType: 'sealed',
  fsHz: 30,
  qts: 0.35,
  vasL: 60,
  vbL: 20,
  fbHz: 32,
  blTm: 7,
  reOhm: 6,
  mmsGrams: 15,
  voltageV: 2.83,
};

const DRIVER_FIELDS = [
  { key: 'fsHz', label: 'Fs - free-air resonance (Hz)', min: 1 },
  { key: 'qts', label: 'Qts - total Q', min: 0.05 },
  { key: 'vasL', label: 'Vas - compliance volume (L)', min: 0.1 },
];

const BOX_FIELDS = {
  sealed: [{ key: 'vbL', label: 'Vb - net box volume (L)', min: 0.1 }],
  vented: [
    { key: 'vbL', label: 'Vb - net box volume (L)', min: 0.1 },
    { key: 'fbHz', label: 'Fb - port tuning frequency (Hz)', min: 1 },
  ],
};

const EXCURSION_FIELDS = [
  { key: 'blTm', label: 'Bl - force factor (T·m)', min: 0.1 },
  { key: 'reOhm', label: 'Re - DC resistance (Ω)', min: 0.1 },
  { key: 'mmsGrams', label: 'Mms - moving mass (g)', min: 0.1 },
  { key: 'voltageV', label: 'Drive voltage (Vrms)', min: 0.01 },
];

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

function activeFields(project) {
  return project.boxType === 'vented'
    ? [...DRIVER_FIELDS, ...BOX_FIELDS.vented]
    : [...DRIVER_FIELDS, ...BOX_FIELDS.sealed, ...EXCURSION_FIELDS];
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

  const fieldsContainer = el('div', { class: 'grid' });
  const errorBox = el('p', { style: { color: 'var(--pico-del-color)', display: 'none' } });
  const summaryBox = el('p');

  const responseChartContainer = el('div');
  const excursionChartContainer = el('div');
  const excursionArticle = el('article', [el('h4', 'Cone excursion (peak, for the given drive voltage)'), excursionChartContainer]);
  let responseChart;
  let excursionChart;

  function rebuildFields() {
    fieldsContainer.textContent = '';
    for (const key of Object.keys(inputs)) delete inputs[key];
    for (const { key, label, min } of activeFields(project)) {
      const input = el('input', {
        type: 'number',
        min,
        step: 'any',
        value: project[key],
        id: `field-${key}`,
      });
      input.addEventListener('input', recompute);
      inputs[key] = input;
      fieldsContainer.appendChild(el('label', [label, input]));
    }
    excursionArticle.style.display = project.boxType === 'sealed' ? '' : 'none';
  }

  function recompute() {
    for (const { key, min } of activeFields(project)) {
      const value = Number(inputs[key].value);
      if (!Number.isFinite(value) || value < (min ?? -Infinity)) {
        errorBox.textContent = `${inputs[key].id} must be a number ≥ ${min}`;
        errorBox.style.display = '';
        return;
      }
      project[key] = value;
    }
    project.name = nameInput.value;
    project.boxType = boxTypeSelect.value;
    errorBox.style.display = 'none';
    saveProject(project);

    try {
      const freqs = logSpace(10, 2000, 500);
      const sealedParams = { fsHz: project.fsHz, qts: project.qts, vasL: project.vasL, vbL: project.vbL };

      if (project.boxType === 'vented') {
        const { h, alpha } = ventedBoxAlignment({ ...sealedParams, fbHz: project.fbHz });
        summaryBox.textContent = `h (Fb/Fs) = ${h.toFixed(3)}, α (Vas/Vb) = ${alpha.toFixed(3)}`;
        const gains = ventedBoxResponseDb(freqs, { ...sealedParams, fbHz: project.fbHz });
        responseChart.setData([Array.from(freqs), Array.from(gains)]);
      } else {
        const { fcHz, qtc } = sealedBoxAlignment(sealedParams);
        summaryBox.textContent = `Fc = ${fcHz.toFixed(1)} Hz, Qtc = ${qtc.toFixed(3)}`;
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
      for (const { key } of activeFields(project)) inputs[key].value = project[key];
      recompute();
    } catch (err) {
      errorBox.textContent = `Could not load project: ${err.message}`;
      errorBox.style.display = '';
    }
  });
  const importButton = el('button', { type: 'button', class: 'secondary' }, 'Import project…');
  importButton.addEventListener('click', () => importInput.click());

  const root = el('div', [
    el('form', { onsubmit: (e) => e.preventDefault() }, [
      el('label', ['Project name', nameInput]),
      el('label', ['Box type', boxTypeSelect]),
      fieldsContainer,
      errorBox,
      summaryBox,
      el('div', { class: 'grid' }, [exportButton, importButton, importInput]),
    ]),
    el('article', [el('h4', 'On-axis response'), responseChartContainer]),
    excursionArticle,
  ]);

  rebuildFields();
  mount(document.getElementById('app'), root);

  const chartOptionsFor = (yLabel) => ({
    width: responseChartContainer.clientWidth,
    height: 320,
    scales: { x: { time: false, distr: 3 /* log */ } },
    axes: [
      { label: 'Frequency (Hz)', values: (_u, vals) => vals.map((v) => (v >= 1000 ? `${v / 1000}k` : v)) },
      { label: yLabel },
    ],
    series: [{}, { label: yLabel, stroke: '#1095c1', width: 2 }],
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
