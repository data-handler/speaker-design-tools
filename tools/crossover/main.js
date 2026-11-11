import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { logSpace } from '../../src/diffraction.js';
import { parseFrd, parseZma } from '../../src/measurement-import.js';
import { resampleMagnitudePhase } from '../../src/resample.js';
import { networkTransferFunction } from '../../src/crossover-network.js';
import { complexMul, complexMagnitude, fromPolar, fromPolarDb, real } from '../../src/complex.js';
import { chartTheme } from '../../src/chart-theme.js';

const SCHEMA_VERSION = 1;
const KIND = 'crossover';

const DEFAULT_PROJECT = {
  schemaVersion: SCHEMA_VERSION,
  kind: KIND,
  name: 'Untitled crossover',
  frdText: '',
  frdFileName: '',
  zmaText: '',
  zmaFileName: '',
  nominalImpedanceOhm: 8,
  components: [],
};

// Component values are stored (and edited) in these practical units, and
// converted to SI only when calling the solver - so project files stay
// human-readable and match how people think about crossover parts.
const UNIT = {
  resistor: { label: 'Ω', toSi: (v) => v, fromSi: (v) => v },
  inductor: { label: 'mH', toSi: (v) => v / 1000, fromSi: (v) => v * 1000 },
  capacitor: { label: 'µF', toSi: (v) => v / 1e6, fromSi: (v) => v * 1e6 },
};
const COMMON_FREQS = logSpace(20, 20000, 400);

function loadProject() {
  try {
    const saved = localStorage.getItem('crossover-project');
    if (!saved) return { ...DEFAULT_PROJECT, components: [] };
    const parsed = JSON.parse(saved);
    if (parsed.kind !== KIND) return { ...DEFAULT_PROJECT, components: [] };
    // No migrations exist yet; add one per schemaVersion bump when needed.
    return { ...DEFAULT_PROJECT, ...parsed };
  } catch {
    return { ...DEFAULT_PROJECT, components: [] };
  }
}

function saveProject(project) {
  localStorage.setItem('crossover-project', JSON.stringify(project));
}

function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `${project.name || 'crossover'}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function computeCurves(project) {
  const frd = parseFrd(project.frdText);
  const { magnitudeDb: rawDb, phaseDeg: rawPhaseDeg } = resampleMagnitudePhase(frd, COMMON_FREQS);

  let loadImpedances;
  if (project.zmaText) {
    const zma = parseZma(project.zmaText);
    // resampleMagnitudePhase interpolates linearly in log-magnitude vs
    // log-frequency, which is exactly what impedance needs too (smooth
    // across a resonance peak); feed it 20*log10(ohms) and convert back
    // after, rather than duplicating the interpolation logic for ohms.
    const { magnitudeDb: zMagDb, phaseDeg: zPhaseDeg } = resampleMagnitudePhase(
      { frequenciesHz: zma.frequenciesHz, magnitudeDb: Array.from(zma.magnitudeOhm, (v) => 20 * Math.log10(v)), phaseDeg: zma.phaseDeg },
      COMMON_FREQS
    );
    loadImpedances = Array.from(zMagDb, (db, i) => fromPolar(10 ** (db / 20), zPhaseDeg[i]));
  } else {
    loadImpedances = Array.from(COMMON_FREQS, () => real(project.nominalImpedanceOhm));
  }

  const componentsSi = project.components.map((c) => ({ ...c, value: UNIT[c.type].toSi(c.value) }));
  const transferFunction = networkTransferFunction(COMMON_FREQS, componentsSi, loadImpedances);

  const filteredDb = new Float64Array(COMMON_FREQS.length);
  for (let i = 0; i < COMMON_FREQS.length; i++) {
    const driverComplex = fromPolarDb(rawDb[i], rawPhaseDeg[i]);
    const filteredComplex = complexMul(driverComplex, transferFunction[i]);
    filteredDb[i] = 20 * Math.log10(complexMagnitude(filteredComplex));
  }

  return { freqs: Array.from(COMMON_FREQS), rawDb: Array.from(rawDb), filteredDb: Array.from(filteredDb) };
}

function App() {
  let project = loadProject();

  const nameInput = el('input', { type: 'text', value: project.name, id: 'field-name' });
  const errorBox = el('p.error-text', { style: { display: 'none' } });
  const statusBox = el('p.hint');

  const frdInput = el('input', { type: 'file', accept: '.frd,text/plain', id: 'field-frd' });
  const frdStatus = el('small.hint', project.frdFileName ? `Loaded: ${project.frdFileName}` : 'No file loaded yet');
  const zmaInput = el('input', { type: 'file', accept: '.zma,text/plain', id: 'field-zma' });
  const zmaStatus = el('small.hint', project.zmaFileName ? `Loaded: ${project.zmaFileName}` : 'Optional — a flat nominal impedance is used if not provided');
  const nominalImpedanceInput = el('input', { type: 'number', min: 0.1, step: 'any', value: project.nominalImpedanceOhm, id: 'field-nominalImpedanceOhm' });

  const componentsContainer = el('div');

  const chartContainer = el('div');
  let chart;

  function renderComponents() {
    componentsContainer.textContent = '';
    project.components.forEach((component, index) => {
      const typeSelect = el('select', [
        el('option', { value: 'resistor' }, 'Resistor'),
        el('option', { value: 'inductor' }, 'Inductor'),
        el('option', { value: 'capacitor' }, 'Capacitor'),
      ]);
      typeSelect.value = component.type;
      const placementSelect = el('select', [el('option', { value: 'series' }, 'Series'), el('option', { value: 'shunt' }, 'Shunt (to return)')]);
      placementSelect.value = component.placement;
      const valueInput = el('input', { type: 'number', min: 0, step: 'any', value: component.value });
      const unitLabel = el('span.hint', UNIT[component.type].label);
      const removeButton = el('button.secondary', { type: 'button' }, 'Remove');

      typeSelect.addEventListener('change', () => {
        component.type = typeSelect.value;
        renderComponents();
        recompute();
      });
      placementSelect.addEventListener('change', () => {
        component.placement = placementSelect.value;
        recompute();
      });
      valueInput.addEventListener('input', () => {
        component.value = Number(valueInput.value);
        recompute();
      });
      removeButton.addEventListener('click', () => {
        project.components.splice(index, 1);
        renderComponents();
        recompute();
      });

      componentsContainer.appendChild(
        el('div.field-grid', { style: { marginBottom: '0.75rem', alignItems: 'end' } }, [
          el('label', [`Component ${index + 1}: type`, typeSelect]),
          el('label', ['Placement', placementSelect]),
          el('label', ['Value', valueInput, unitLabel]),
          el('label', [' ', removeButton]),
        ])
      );
    });
  }

  const addComponentButton = el('button.secondary', { type: 'button' }, 'Add component');
  addComponentButton.addEventListener('click', () => {
    project.components.push({ type: 'inductor', placement: 'series', value: 1.0 });
    renderComponents();
    recompute();
  });

  function recompute() {
    project.name = nameInput.value;
    project.nominalImpedanceOhm = Number(nominalImpedanceInput.value);
    saveProject(project);

    if (!project.frdText) {
      statusBox.textContent = 'Import a .frd file to see the response.';
      errorBox.style.display = 'none';
      chart.setData([[], [], []]);
      return;
    }

    try {
      const { freqs, rawDb, filteredDb } = computeCurves(project);
      chart.setData([freqs, rawDb, filteredDb]);
      statusBox.textContent = project.zmaText
        ? 'Using the imported impedance measurement.'
        : `No impedance measurement imported — using a flat ${project.nominalImpedanceOhm} Ω resistive load.`;
      errorBox.style.display = 'none';
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = '';
    }
  }

  nameInput.addEventListener('input', recompute);
  nominalImpedanceInput.addEventListener('input', recompute);

  frdInput.addEventListener('change', async () => {
    const file = frdInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      parseFrd(text); // validate before committing
      project.frdText = text;
      project.frdFileName = file.name;
      frdStatus.textContent = `Loaded: ${file.name}`;
      recompute();
    } catch (err) {
      errorBox.textContent = `Could not read ${file.name}: ${err.message}`;
      errorBox.style.display = '';
    }
  });

  zmaInput.addEventListener('change', async () => {
    const file = zmaInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      parseZma(text); // validate before committing
      project.zmaText = text;
      project.zmaFileName = file.name;
      zmaStatus.textContent = `Loaded: ${file.name}`;
      recompute();
    } catch (err) {
      errorBox.textContent = `Could not read ${file.name}: ${err.message}`;
      errorBox.style.display = '';
    }
  });

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
      nominalImpedanceInput.value = project.nominalImpedanceOhm;
      frdStatus.textContent = project.frdFileName ? `Loaded: ${project.frdFileName}` : 'No file loaded yet';
      zmaStatus.textContent = project.zmaFileName
        ? `Loaded: ${project.zmaFileName}`
        : 'Optional — a flat nominal impedance is used if not provided';
      renderComponents();
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
      el('fieldset', [
        el('legend', 'Driver measurement'),
        el('div.field-grid', [
          el('label', ['Response (.frd)', frdInput, frdStatus]),
          el('label', ['Impedance (.zma, optional)', zmaInput, zmaStatus]),
          el('label', ['Fallback nominal impedance (Ω)', nominalImpedanceInput, el('small.hint', 'Used only when no .zma is imported')]),
        ]),
      ]),
      el('fieldset', [
        el('legend', 'Crossover network (source side to driver side)'),
        componentsContainer,
        el('div.actions', [addComponentButton]),
      ]),
      errorBox,
      statusBox,
      el('div.actions', [exportButton, importButton, importInput]),
    ]),
    el('div.chart-panel', [el('h2', 'Driver response: raw vs. through the crossover'), chartContainer]),
  ]);

  renderComponents();
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
        { label: 'SPL (dB)', stroke: theme.inkMuted, grid: { stroke: theme.border, width: 1 }, font: `12px ${theme.fontSans}` },
      ],
      series: [
        {},
        { label: 'Raw (measured)', stroke: theme.inkMuted, width: 1, dash: [4, 3] },
        { label: 'Through crossover', stroke: theme.accent, width: 2 },
      ],
    },
    [[], [], []],
    chartContainer
  );
  new ResizeObserver(([entry]) => chart.setSize({ width: entry.contentRect.width, height: 360 })).observe(chartContainer);

  recompute();
}

App();
