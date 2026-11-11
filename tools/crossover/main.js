import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { logSpace } from '../../src/diffraction.js';
import { parseFrd, parseZma } from '../../src/measurement-import.js';
import { resampleMagnitudePhase } from '../../src/resample.js';
import { networkTransferFunction } from '../../src/crossover-network.js';
import { complexMul, complexMagnitude, fromPolar, fromPolarDb, real } from '../../src/complex.js';
import { applyLevelDelayPolarity, sumResponses, distanceMmToDelayMs } from '../../src/driver-combine.js';
import { presetComponents } from '../../src/crossover-presets.js';
import { chartTheme } from '../../src/chart-theme.js';

const SCHEMA_VERSION = 2;
const KIND = 'crossover';

// Component values are stored (and edited) in these practical units, and
// converted to SI only when calling the solver - so project files stay
// human-readable and match how people think about crossover parts.
const UNIT = {
  resistor: { label: 'Ω', toSi: (v) => v, fromSi: (v) => v },
  inductor: { label: 'mH', toSi: (v) => v / 1000, fromSi: (v) => v * 1000 },
  capacitor: { label: 'µF', toSi: (v) => v / 1e6, fromSi: (v) => v * 1e6 },
};
const COMMON_FREQS = logSpace(20, 20000, 400);

// Quick-filter values come out of exact floating-point maths; round them to
// a sane number of significant figures before showing them - a real build
// rounds to the nearest stocked part anyway, and 15 digits of precision on
// a textbook starting value is just noise.
function roundToSignificantFigures(value, figures) {
  if (value === 0) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(value)));
  const factor = 10 ** (figures - magnitude);
  return Math.round(value * factor) / factor;
}

function defaultDriver(name) {
  return {
    name,
    frdText: '',
    frdFileName: '',
    zmaText: '',
    zmaFileName: '',
    nominalImpedanceOhm: 8,
    components: [],
    levelDb: 0,
    distanceMm: 0,
    invertPolarity: false,
  };
}

const DEFAULT_PROJECT = {
  schemaVersion: SCHEMA_VERSION,
  kind: KIND,
  name: 'Untitled crossover',
  drivers: [defaultDriver('Woofer')],
};

// v1 projects stored a single driver's fields directly on the project.
// Migrations are additive and kept even once nothing writes v1 any more,
// so an old exported project file still opens.
function migrateProject(parsed) {
  if (parsed.schemaVersion === 1) {
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: KIND,
      name: parsed.name,
      drivers: [
        {
          ...defaultDriver('Driver 1'),
          frdText: parsed.frdText || '',
          frdFileName: parsed.frdFileName || '',
          zmaText: parsed.zmaText || '',
          zmaFileName: parsed.zmaFileName || '',
          nominalImpedanceOhm: parsed.nominalImpedanceOhm ?? 8,
          components: parsed.components || [],
        },
      ],
    };
  }
  return parsed;
}

function loadProject() {
  try {
    const saved = localStorage.getItem('crossover-project');
    if (!saved) return structuredClone(DEFAULT_PROJECT);
    const parsed = migrateProject(JSON.parse(saved));
    if (parsed.kind !== KIND) return structuredClone(DEFAULT_PROJECT);
    return { ...structuredClone(DEFAULT_PROJECT), ...parsed };
  } catch {
    return structuredClone(DEFAULT_PROJECT);
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

// A driver's response after its own crossover network and its level/
// distance/polarity adjustments - i.e. exactly what it contributes to the
// acoustic sum.
function computeDriverContribution(driver) {
  const frd = parseFrd(driver.frdText);
  const { magnitudeDb: rawDb, phaseDeg: rawPhaseDeg } = resampleMagnitudePhase(frd, COMMON_FREQS);

  let loadImpedances;
  if (driver.zmaText) {
    const zma = parseZma(driver.zmaText);
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
    loadImpedances = Array.from(COMMON_FREQS, () => real(driver.nominalImpedanceOhm));
  }

  const componentsSi = driver.components.map((c) => ({ ...c, value: UNIT[c.type].toSi(c.value) }));
  const transferFunction = networkTransferFunction(COMMON_FREQS, componentsSi, loadImpedances);

  const throughNetwork = Array.from(COMMON_FREQS, (_f, i) => complexMul(fromPolarDb(rawDb[i], rawPhaseDeg[i]), transferFunction[i]));
  return applyLevelDelayPolarity(COMMON_FREQS, throughNetwork, {
    levelDb: driver.levelDb,
    delayMs: distanceMmToDelayMs(driver.distanceMm),
    invertPolarity: driver.invertPolarity,
  });
}

// Returns null if no driver has a measurement loaded yet. One entry per
// driver is always returned in perDriverDb, in project.drivers order (null
// for a driver with no .frd yet) - this has to line up 1:1 with the chart's
// series config (one series per driver, built once in rebuildChart() and
// not rebuilt just because an individual driver's data changes), or uPlot's
// own internal per-series bookkeeping goes out of sync with the data array.
function computeProjectCurves(project) {
  const responses = project.drivers.map((driver) => (driver.frdText ? computeDriverContribution(driver) : null));
  const withData = responses.filter(Boolean);
  if (withData.length === 0) return null;

  const summed = sumResponses(withData);
  return {
    freqs: Array.from(COMMON_FREQS),
    perDriverDb: responses.map((response) =>
      response ? Array.from(response, (c) => 20 * Math.log10(complexMagnitude(c))) : Array.from(COMMON_FREQS, () => null)
    ),
    summedDb: Array.from(summed, (c) => 20 * Math.log10(complexMagnitude(c))),
  };
}

function App() {
  let project = loadProject();

  const nameInput = el('input', { type: 'text', value: project.name, id: 'field-name' });
  const errorBox = el('p.error-text', { style: { display: 'none' } });
  const statusBox = el('p.hint');

  const driversContainer = el('div');
  const chartContainer = el('div');
  let chart;

  function networkEditor(driver, onChange) {
    const container = el('div');

    function renderComponents() {
      container.textContent = '';
      driver.components.forEach((component, index) => {
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
          onChange();
        });
        placementSelect.addEventListener('change', () => {
          component.placement = placementSelect.value;
          onChange();
        });
        valueInput.addEventListener('input', () => {
          component.value = Number(valueInput.value);
          onChange();
        });
        removeButton.addEventListener('click', () => {
          driver.components.splice(index, 1);
          renderComponents();
          onChange();
        });

        container.appendChild(
          el('div.field-grid', { style: { marginBottom: '0.75rem', alignItems: 'end' } }, [
            el('label', [`Component ${index + 1}: type`, typeSelect]),
            el('label', ['Placement', placementSelect]),
            el('label', ['Value', valueInput, unitLabel]),
            el('label', [' ', removeButton]),
          ])
        );
      });
    }

    const addComponentButton = el('button.secondary', { type: 'button' }, 'Add component');
    addComponentButton.addEventListener('click', () => {
      driver.components.push({ type: 'inductor', placement: 'series', value: 1.0 });
      renderComponents();
      onChange();
    });

    // Quick filter: calculates standard textbook component values for a
    // single filter section and replaces the list below with them, as a
    // starting point to fine-tune against the real (not purely resistive)
    // measured response - not a substitute for the chart above.
    const filterTypeSelect = el('select', [el('option', { value: 'lowpass' }, 'Low-pass'), el('option', { value: 'highpass' }, 'High-pass')]);
    const orderSelect = el('select', [
      el('option', { value: '1' }, '1st order (6 dB/octave)'),
      el('option', { value: '2' }, '2nd order (12 dB/octave)'),
    ]);
    const alignmentSelect = el('select', [
      el('option', { value: 'butterworth' }, 'Butterworth (Q=0.707)'),
      el('option', { value: 'linkwitz-riley' }, 'Linkwitz-Riley (Q=0.5)'),
    ]);
    const crossoverFreqInput = el('input', { type: 'number', min: 1, step: 'any', value: 2000 });
    const applyPresetButton = el('button.secondary', { type: 'button' }, 'Apply (replaces the network below)');

    function updateAlignmentEnabled() {
      alignmentSelect.disabled = orderSelect.value !== '2';
    }
    orderSelect.addEventListener('change', updateAlignmentEnabled);
    updateAlignmentEnabled();

    applyPresetButton.addEventListener('click', () => {
      const components = presetComponents({
        type: filterTypeSelect.value,
        order: Number(orderSelect.value),
        alignment: alignmentSelect.value,
        crossoverHz: Number(crossoverFreqInput.value),
        loadOhm: driver.nominalImpedanceOhm,
      });
      driver.components = components.map((c) => ({ ...c, value: roundToSignificantFigures(c.value, 3) }));
      renderComponents();
      onChange();
    });

    const quickFilter = el('div', { style: { marginBottom: '1.25rem' } }, [
      el('div.field-grid', { style: { alignItems: 'end' } }, [
        el('label', ['Quick filter: type', filterTypeSelect]),
        el('label', ['Order', orderSelect]),
        el('label', ['Alignment', alignmentSelect]),
        el('label', ['Crossover frequency (Hz)', crossoverFreqInput]),
        el('label', [' ', applyPresetButton]),
      ]),
      el(
        'small.hint',
        'Calculates standard component values assuming the nominal impedance above as a resistive load - a starting point, not a substitute for checking the chart against the real (imported) response.'
      ),
    ]);

    renderComponents();
    return el('div', [quickFilter, container, el('div.actions', [addComponentButton])]);
  }

  function driverCard(driver, index, seriesColor) {
    const nameField = el('input', { type: 'text', value: driver.name });
    const colorDot = el('span.driver-color-dot', { style: { background: seriesColor } });
    const removeButton = el('button.secondary', { type: 'button' }, 'Remove this driver');

    const frdInput = el('input', { type: 'file', accept: '.frd,text/plain' });
    const frdStatus = el('small.hint', driver.frdFileName ? `Loaded: ${driver.frdFileName}` : 'No file loaded yet');
    const zmaInput = el('input', { type: 'file', accept: '.zma,text/plain' });
    const zmaStatus = el('small.hint', driver.zmaFileName ? `Loaded: ${driver.zmaFileName}` : 'Optional — a flat nominal impedance is used if not provided');
    const nominalImpedanceInput = el('input', { type: 'number', min: 0.1, step: 'any', value: driver.nominalImpedanceOhm });

    const levelInput = el('input', { type: 'number', step: 'any', value: driver.levelDb });
    const distanceInput = el('input', { type: 'number', step: 'any', value: driver.distanceMm });
    const invertCheckbox = el('input', { type: 'checkbox', checked: driver.invertPolarity });

    nameField.addEventListener('input', () => {
      driver.name = nameField.value;
      recompute();
    });
    // Rebuilding the chart (to pick up the new legend label) on every
    // keystroke would recreate the canvas while the user is still typing;
    // 'change' (on blur/Enter) is enough and avoids that.
    nameField.addEventListener('change', () => {
      rebuildChart();
      recompute();
    });
    removeButton.addEventListener('click', () => {
      const atIndex = project.drivers.indexOf(driver);
      if (atIndex !== -1) project.drivers.splice(atIndex, 1);
      renderDrivers();
      rebuildChart();
      recompute();
    });
    nominalImpedanceInput.addEventListener('input', () => {
      driver.nominalImpedanceOhm = Number(nominalImpedanceInput.value);
      recompute();
    });
    levelInput.addEventListener('input', () => {
      driver.levelDb = Number(levelInput.value);
      recompute();
    });
    distanceInput.addEventListener('input', () => {
      driver.distanceMm = Number(distanceInput.value);
      recompute();
    });
    invertCheckbox.addEventListener('change', () => {
      driver.invertPolarity = invertCheckbox.checked;
      recompute();
    });

    frdInput.addEventListener('change', async () => {
      const file = frdInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        parseFrd(text); // validate before committing
        driver.frdText = text;
        driver.frdFileName = file.name;
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
        driver.zmaText = text;
        driver.zmaFileName = file.name;
        zmaStatus.textContent = `Loaded: ${file.name}`;
        recompute();
      } catch (err) {
        errorBox.textContent = `Could not read ${file.name}: ${err.message}`;
        errorBox.style.display = '';
      }
    });

    return el('details.driver-card', { open: true }, [
      el('summary', [colorDot, nameField, removeButton]),
      el('fieldset', [
        el('legend', 'Driver measurement'),
        el('div.field-grid', [
          el('label', ['Response (.frd)', frdInput, frdStatus]),
          el('label', ['Impedance (.zma, optional)', zmaInput, zmaStatus]),
          el('label', [
            'Nominal impedance (Ω)',
            nominalImpedanceInput,
            el('small.hint', 'Used as a flat fallback when no .zma is imported, and as the assumed load for quick-filter component calculations'),
          ]),
        ]),
      ]),
      el('fieldset', [el('legend', 'Crossover network (source side to driver side)'), networkEditor(driver, recompute)]),
      el('fieldset', [
        el('legend', 'Level & acoustic alignment'),
        el('div.field-grid', [
          el('label', ['Level trim (dB)', levelInput, el('small.hint', 'Pads this driver up or down relative to the others')]),
          el('label', ['Acoustic offset (mm)', distanceInput, el('small.hint', 'How much further this driver’s acoustic centre is from the listening position than the others, e.g. from baffle step or recess depth')]),
          el('label', ['Polarity', el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' } }, [invertCheckbox, el('span.hint', { style: { margin: 0 } }, 'Inverted (+ to -)')])]),
        ]),
      ]),
    ]);
  }

  function renderDrivers() {
    driversContainer.textContent = '';
    const theme = chartTheme();
    project.drivers.forEach((driver, index) => {
      driversContainer.appendChild(driverCard(driver, index, theme.series[index % theme.series.length]));
    });
  }

  const addDriverButton = el('button.secondary', { type: 'button' }, 'Add a driver');
  addDriverButton.addEventListener('click', () => {
    project.drivers.push(defaultDriver(`Driver ${project.drivers.length + 1}`));
    renderDrivers();
    rebuildChart();
    recompute();
  });

  function rebuildChart() {
    chart?.destroy();
    chartContainer.textContent = '';
    const theme = chartTheme();
    const series = [{}];
    project.drivers.forEach((driver, index) => {
      series.push({ label: driver.name, stroke: theme.series[index % theme.series.length], width: 1.5, dash: [4, 3] });
    });
    series.push({ label: 'Summed (acoustic total)', stroke: theme.accent, width: 2.5 });

    chart = new uPlot(
      {
        width: chartContainer.clientWidth,
        height: 380,
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
        series,
      },
      [[], ...project.drivers.map(() => []), []],
      chartContainer
    );
  }

  function recompute() {
    project.name = nameInput.value;
    saveProject(project);

    const curves = computeProjectCurves(project);
    if (!curves) {
      statusBox.textContent = project.drivers.length
        ? 'Import a .frd file for at least one driver to see the response.'
        : 'Add a driver to begin.';
      errorBox.style.display = 'none';
      chart.setData([[], ...project.drivers.map(() => []), []]);
      return;
    }

    try {
      chart.setData([curves.freqs, ...curves.perDriverDb, curves.summedDb]);
      const missingFrd = project.drivers.filter((d) => !d.frdText).length;
      statusBox.textContent = missingFrd
        ? `Showing ${project.drivers.length - missingFrd} of ${project.drivers.length} drivers — the rest have no .frd imported yet.`
        : 'Showing the summed acoustic response of all drivers.';
      errorBox.style.display = 'none';
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
      const parsed = migrateProject(JSON.parse(await file.text()));
      if (parsed.kind !== KIND) throw new Error(`Expected kind "${KIND}", got "${parsed.kind}"`);
      project = { ...structuredClone(DEFAULT_PROJECT), ...parsed };
      nameInput.value = project.name;
      renderDrivers();
      rebuildChart();
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
      driversContainer,
      el('div.actions', [addDriverButton]),
      errorBox,
      statusBox,
      el('div.actions', [exportButton, importButton, importInput]),
    ]),
    el('div.chart-panel', [el('h2', 'Driver and summed response'), chartContainer]),
  ]);

  renderDrivers();
  mount(document.getElementById('app'), root);
  rebuildChart();
  recompute();

  // A single long-lived observer, rather than one per rebuildChart() call -
  // chart is reassigned on every rebuild, so this always resizes the current
  // one. ResizeObserver always fires once immediately on observe() even when
  // nothing has changed, and can also fire from a vertical scrollbar
  // appearing as driver cards are added - skip same-size calls, and defer
  // the rest to the next animation frame (uPlot's own setData/setSize both
  // queue their actual redraw as a microtask, so calling setSize() straight
  // from the observer can land mid-commit of an unrelated setData() from
  // the same tick; a pending microtask always resolves before the next
  // frame, so this ordering is enough to avoid that race).
  new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    if (width === chart.width) return;
    requestAnimationFrame(() => {
      try {
        chart.setSize({ width, height: 380 });
      } catch {
        rebuildChart();
        recompute();
      }
    });
  }).observe(chartContainer);
}

App();
