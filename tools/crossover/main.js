import { el, mount } from '../../vendor/redom/redom.es.min.js';
import uPlot from '../../vendor/uplot/uPlot.esm.js';
import { logSpace } from '../../src/diffraction.js';
import { parseFrd, parseZma } from '../../src/measurement-import.js';
import { resampleMagnitudePhase } from '../../src/resample.js';
import { networkTransferFunction } from '../../src/crossover-network.js';
import { complexMul, complexMagnitude, fromPolar, fromPolarDb, real } from '../../src/complex.js';
import { applyLevelDelayPolarity, sumResponses, distanceMmToDelayMs } from '../../src/driver-combine.js';
import { presetComponents } from '../../src/crossover-presets.js';
import { powerResponseDb, nearestAngleIndex } from '../../src/directivity.js';
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
    offAxis: [], // [{ angleDeg, frdText, frdFileName }, ...] - off-axis measurements for this driver's own directivity/power response
  };
}

// Fills in any fields a driver object is missing (an older saved/exported
// project, or one that predates a field this version added) with their
// defaults, without disturbing anything it already has. Additive fields
// like this don't need a schemaVersion bump - only an incompatible
// restructuring of the data does.
function normalizeDriver(driver) {
  return { ...defaultDriver(driver.name), ...driver };
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
    const project = { ...structuredClone(DEFAULT_PROJECT), ...parsed };
    project.drivers = project.drivers.map(normalizeDriver);
    return project;
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

// A driver's response through its own crossover network and its level/
// distance/polarity adjustments, for a given measured response (its own
// on-axis .frd, or one of its off-axis ones - the network, load impedance
// and alignment are all properties of the driver and crossover, not of the
// angle a particular measurement was taken at).
function computeFilteredResponse(driver, frdText) {
  const frd = parseFrd(frdText);
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

// A driver's response after its own crossover network and its level/
// distance/polarity adjustments - i.e. exactly what it contributes to the
// acoustic sum.
function computeDriverContribution(driver) {
  return computeFilteredResponse(driver, driver.frdText);
}

// This driver's filtered (complex) response at every angle it has a
// measurement for: 0 degrees (its main .frd) always, plus whichever
// off-axis angles have a measurement loaded, sorted ascending. Returns null
// only if there's no on-axis measurement at all (nothing to compute from).
// A driver with no off-axis measurements still gets a result - just a
// single angle (0) - so callers that combine several drivers (like
// computeSystemDirectivity below) don't need a separate case for "this
// driver's directivity isn't known": nearestAngleIndex naturally resolves
// to that single on-axis response at every angle, which is exactly the
// right stand-in assumption (unknown directivity -> treat as not changing
// with angle) without being told to.
function computeDriverAngleResponses(driver) {
  if (!driver.frdText) return null;
  const offAxisWithData = driver.offAxis.filter((m) => m.frdText);
  const anglesDeg = [0, ...offAxisWithData.map((m) => m.angleDeg)];
  const order = anglesDeg.map((_, i) => i).sort((a, b) => anglesDeg[a] - anglesDeg[b]);
  const frdTexts = [driver.frdText, ...offAxisWithData.map((m) => m.frdText)];
  return {
    anglesDeg: order.map((i) => anglesDeg[i]),
    responses: order.map((i) => computeFilteredResponse(driver, frdTexts[i])),
  };
}

// This driver's own directivity chart data: its angle family (in dB) plus
// the estimated power response across them. Returns null if there are no
// off-axis measurements loaded yet (directivity needs at least one angle
// beyond on-axis to say anything a plain on-axis chart doesn't already show).
function computeDriverDirectivity(driver) {
  const angleResponses = computeDriverAngleResponses(driver);
  if (!angleResponses || angleResponses.anglesDeg.length < 2) return null;

  const dbByAngle = angleResponses.responses.map((response) => Array.from(response, (c) => 20 * Math.log10(complexMagnitude(c))));
  return {
    anglesDeg: angleResponses.anglesDeg,
    dbByAngle,
    powerDb: powerResponseDb(angleResponses.anglesDeg, dbByAngle),
  };
}

// The whole system's (every contributing driver's) off-axis family and
// estimated power response, combining drivers that may not share the same
// measured angles: the target angle set is the union of every driver's own
// angles, and at each one, a driver that wasn't measured there contributes
// its own nearest measured angle instead (see nearestAngleIndex) - a driver
// with no off-axis measurements at all contributes its on-axis response at
// every target angle. Returns null if no driver has any off-axis data (the
// main on-axis-only chart already covers that case).
function computeSystemDirectivity(project) {
  const perDriverAngles = project.drivers.map(computeDriverAngleResponses).filter(Boolean);
  if (perDriverAngles.length === 0 || !perDriverAngles.some((d) => d.anglesDeg.length > 1)) return null;

  const angleSet = new Set([0]);
  for (const d of perDriverAngles) for (const angleDeg of d.anglesDeg) angleSet.add(angleDeg);
  const anglesDeg = Array.from(angleSet).sort((a, b) => a - b);

  const dbByAngle = anglesDeg.map((targetAngleDeg) => {
    const perDriverResponses = perDriverAngles.map((d) => d.responses[nearestAngleIndex(d.anglesDeg, targetAngleDeg)]);
    const summed = sumResponses(perDriverResponses);
    return Array.from(summed, (c) => 20 * Math.log10(complexMagnitude(c)));
  });

  return {
    anglesDeg,
    dbByAngle,
    powerDb: powerResponseDb(anglesDeg, dbByAngle),
  };
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
  const statusBox = el('p.hint', { id: 'main-status' });

  const driversContainer = el('div');
  const chartContainer = el('div');
  let chart;

  const systemDirectivityContainer = el('div', { id: 'system-directivity-chart' });
  const systemDirectivityStatus = el('p.hint', { id: 'system-directivity-status' });
  let systemDirectivityChart;

  // Rebuilt wholesale on every recompute() (not setData()-updated in place),
  // same reasoning as the per-driver directivity chart: the angle set this
  // chart needs can change with any edit anywhere in the project, so there
  // is no stable series count to update in place, and building the series
  // config and the data together in one synchronous step avoids the
  // series/data length mismatch the main chart had to guard against.
  function refreshSystemDirectivity() {
    systemDirectivityChart?.destroy();
    systemDirectivityChart = null;
    systemDirectivityContainer.textContent = '';

    const directivity = computeSystemDirectivity(project);
    if (!directivity) {
      systemDirectivityStatus.textContent =
        'Add at least one off-axis measurement to any driver above to see the system’s combined off-axis and estimated power response.';
      return;
    }

    const theme = chartTheme();
    const series = [{}];
    directivity.anglesDeg.forEach((angleDeg, i) => {
      series.push({ label: `${angleDeg}°`, stroke: theme.series[i % theme.series.length], width: 1.5, dash: angleDeg === 0 ? undefined : [4, 3] });
    });
    series.push({ label: 'Estimated power response', stroke: theme.accent, width: 2.5 });

    systemDirectivityChart = new uPlot(
      {
        width: systemDirectivityContainer.clientWidth || 600,
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
      [Array.from(COMMON_FREQS), ...directivity.dbByAngle, directivity.powerDb],
      systemDirectivityContainer
    );
    systemDirectivityStatus.textContent = `Combining every driver's off-axis family at ${directivity.anglesDeg.length} angle(s) (0–${Math.max(...directivity.anglesDeg)}°) — a driver measured at a different angle stands in its own nearest one, and a driver with no off-axis measurements is assumed not to change with angle.`;
  }

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
      el('option', { value: '3' }, '3rd order (18 dB/octave)'),
      el('option', { value: '4' }, '4th order (24 dB/octave)'),
    ]);
    const alignmentSelect = el('select', [
      el('option', { value: 'butterworth' }, 'Butterworth (Q=0.707)'),
      el('option', { value: 'linkwitz-riley' }, 'Linkwitz-Riley (Q=0.5)'),
    ]);
    const crossoverFreqInput = el('input', { type: 'number', min: 1, step: 'any', value: 2000 });
    const applyPresetButton = el('button.secondary', { type: 'button' }, 'Apply (replaces the network below)');

    // Linkwitz-Riley is only offered at 2nd order - at 3rd/4th order it's
    // Butterworth only (see the module-level comment in crossover-presets.js
    // for why Linkwitz-Riley isn't offered there yet).
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

  function directivityEditor(driver) {
    const rowsContainer = el('div');
    const chartContainer = el('div');
    const statusBox = el('small.hint');
    let chart;

    function renderRows() {
      rowsContainer.textContent = '';
      driver.offAxis.forEach((entry, index) => {
        const angleInput = el('input', { type: 'number', min: 0, max: 90, step: 'any', value: entry.angleDeg });
        const angleFrdInput = el('input', { type: 'file', accept: '.frd,text/plain' });
        const status = el('small.hint', entry.frdFileName ? `Loaded: ${entry.frdFileName}` : 'No file loaded yet');
        const removeButton = el('button.secondary', { type: 'button' }, 'Remove');

        angleInput.addEventListener('input', () => {
          entry.angleDeg = Number(angleInput.value);
          refresh();
        });
        angleFrdInput.addEventListener('change', async () => {
          const file = angleFrdInput.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            parseFrd(text); // validate before committing
            entry.frdText = text;
            entry.frdFileName = file.name;
            status.textContent = `Loaded: ${file.name}`;
            refresh();
          } catch (err) {
            errorBox.textContent = `Could not read ${file.name}: ${err.message}`;
            errorBox.style.display = '';
          }
        });
        removeButton.addEventListener('click', () => {
          driver.offAxis.splice(index, 1);
          renderRows();
          refresh();
        });

        rowsContainer.appendChild(
          el('div.field-grid', { style: { marginBottom: '0.75rem', alignItems: 'end' } }, [
            el('label', [`Angle ${index + 1}: degrees off-axis`, angleInput]),
            el('label', ['Response (.frd)', angleFrdInput, status]),
            el('label', [' ', removeButton]),
          ])
        );
      });
    }

    const addAngleButton = el('button.secondary', { type: 'button' }, 'Add an off-axis angle');
    addAngleButton.addEventListener('click', () => {
      driver.offAxis.push({ angleDeg: 30, frdText: '', frdFileName: '' });
      renderRows();
      refresh();
    });

    // This chart is only ever rebuilt wholesale (never setData()-updated in
    // place, unlike the main chart) - every edit here is an infrequent,
    // deliberate action (loading a file, typing an angle), not a per-frame
    // slider drag, so there's no performance reason to optimise it, and
    // building the series config and the data together in one synchronous
    // step sidesteps the series/data length mismatch the main chart had to
    // guard against.
    function refresh() {
      // recompute() saves the project and also refreshes the system-level
      // off-axis/power response chart, which depends on every driver's
      // off-axis data, not just this one's.
      recompute();
      chart?.destroy();
      chart = null;
      chartContainer.textContent = '';

      const directivity = computeDriverDirectivity(driver);
      if (!directivity) {
        statusBox.textContent = driver.frdText
          ? 'Add at least one off-axis measurement above to see this driver’s directivity and estimated power response.'
          : 'Import this driver’s on-axis response (above) first.';
        return;
      }

      const theme = chartTheme();
      const series = [{}];
      directivity.anglesDeg.forEach((angleDeg, i) => {
        series.push({ label: `${angleDeg}°`, stroke: theme.series[i % theme.series.length], width: 1.25, dash: angleDeg === 0 ? undefined : [4, 3] });
      });
      series.push({ label: 'Estimated power response', stroke: theme.accent, width: 2.25 });

      chart = new uPlot(
        {
          width: chartContainer.clientWidth || 600,
          height: 260,
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
        [Array.from(COMMON_FREQS), ...directivity.dbByAngle, directivity.powerDb],
        chartContainer
      );
      statusBox.textContent = `Showing ${directivity.anglesDeg.length} measured angle(s) (0–${Math.max(...directivity.anglesDeg)}°) and the estimated power response - an estimate assuming the driver is symmetric about its forward axis and only the front hemisphere matters, not a full-sphere sound-power measurement.`;
    }

    renderRows();
    refresh();

    // One long-lived observer rather than one per refresh() (which would
    // otherwise stack up, since refresh() only clears chartContainer's
    // children, not the container itself) - chart is reassigned by every
    // refresh(), so this always resizes whichever instance is current, and
    // does nothing if refresh() hasn't created one yet (no data loaded).
    new ResizeObserver(([entry]) => {
      if (!chart) return;
      const width = entry.contentRect.width;
      if (width === chart.width) return;
      requestAnimationFrame(() => {
        if (!chart) return;
        try {
          chart.setSize({ width, height: 260 });
        } catch {
          refresh();
        }
      });
    }).observe(chartContainer);

    return {
      element: el('div', [rowsContainer, el('div.actions', [addAngleButton]), statusBox, el('div.chart-panel', { style: { marginTop: '1rem' } }, [chartContainer])]),
      refresh,
    };
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

    // The off-axis/power-response chart depends on everything that affects
    // this driver's filtered response (on-axis .frd, impedance, network,
    // level, offset, polarity) - not just its own off-axis-specific
    // controls - so anything that calls recompute() below also has to
    // refresh it, or it goes stale the moment any of those change.
    const directivity = directivityEditor(driver);
    function recomputeAll() {
      recompute();
      directivity.refresh();
    }

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
      recomputeAll();
    });
    levelInput.addEventListener('input', () => {
      driver.levelDb = Number(levelInput.value);
      recomputeAll();
    });
    distanceInput.addEventListener('input', () => {
      driver.distanceMm = Number(distanceInput.value);
      recomputeAll();
    });
    invertCheckbox.addEventListener('change', () => {
      driver.invertPolarity = invertCheckbox.checked;
      recomputeAll();
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
        recomputeAll();
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
        recomputeAll();
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
      el('fieldset', [el('legend', 'Crossover network (source side to driver side)'), networkEditor(driver, recomputeAll)]),
      el('fieldset', [
        el('legend', 'Level & acoustic alignment'),
        el('div.field-grid', [
          el('label', ['Level trim (dB)', levelInput, el('small.hint', 'Pads this driver up or down relative to the others')]),
          el('label', ['Acoustic offset (mm)', distanceInput, el('small.hint', 'How much further this driver’s acoustic centre is from the listening position than the others, e.g. from baffle step or recess depth')]),
          el('label', ['Polarity', el('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' } }, [invertCheckbox, el('span.hint', { style: { margin: 0 } }, 'Inverted (+ to -)')])]),
        ]),
      ]),
      el('fieldset', [el('legend', 'Off-axis & power response (optional)'), directivity.element]),
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
    refreshSystemDirectivity();

    // Driver cards (and the directivityEditor inside each) are built by
    // renderDrivers(), which runs before rebuildChart() creates the main
    // chart - each driver's own construction-time refresh() already calls
    // this function, before there's a main chart to update. That's fine:
    // the saving and system-chart refresh above don't need it, and
    // rebuildChart() + recompute() right after will populate this part.
    if (!chart) return;

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
      project.drivers = project.drivers.map(normalizeDriver);
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
    el('div.chart-panel', [el('h2', 'System off-axis & power response'), systemDirectivityStatus, systemDirectivityContainer]),
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

  // Same long-lived-observer pattern for the system directivity chart,
  // which (like the per-driver one) is always rebuilt wholesale rather than
  // setData()-updated, so there's no series count to keep in sync here -
  // just guard against resizing (or self-healing) a chart that doesn't
  // exist yet because no driver has off-axis data loaded.
  new ResizeObserver(([entry]) => {
    if (!systemDirectivityChart) return;
    const width = entry.contentRect.width;
    if (width === systemDirectivityChart.width) return;
    requestAnimationFrame(() => {
      if (!systemDirectivityChart) return;
      try {
        systemDirectivityChart.setSize({ width, height: 380 });
      } catch {
        refreshSystemDirectivity();
      }
    });
  }).observe(systemDirectivityContainer);
}

App();
