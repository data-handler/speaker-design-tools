// On-axis baffle-step / edge-diffraction response for a driver on a flat
// rectangular baffle, relative to an infinite baffle (half-space) reference.
//
// Model: J. Vanderkooy, "A Simple Theory of Cabinet Edge Diffraction",
// J. Audio Eng. Soc. 39(12), 1991. Sound radiated towards the baffle edge is
// re-radiated from the edge with half the driver's strength and inverted
// polarity, delayed by the extra distance travelled via the edge rather than
// straight to the listener. Splitting the perimeter into small arcs and
// weighting each arc by the fraction of the driver's radiated angle it
// subtends gives a discretised version of the edge source:
//
//   H(f) = 1 - (1/2) * sum_i( w_i * exp(-j * k * pathExcess_i) )
//
// where w_i sums to 1 around the full perimeter, k = 2*pi*f/c, and
// pathExcess_i is how much further sound travels via that arc of the edge
// than straight from the driver to the listener. |H(f)|, in dB, is -6.02 dB
// well below the baffle step (cabinet radiating into full space) rising to
// 0 dB well above it (driver radiating into the half-space of a baffle
// that's acoustically infinite at that wavelength), with diffraction ripple
// in between from the interference of direct and edge-delayed sound.
//
// A finite driver is approximated by averaging this over a small ring of
// source points across the cone, which softens the ripple a real (non-point)
// driver would not produce at full amplitude.

const SPEED_OF_SOUND = 343; // m/s, 20C dry air

/**
 * Perimeter arcs of a rectangular baffle as seen from a source point inside it.
 * @returns {{weight: number, distance: number}[]} weights sum to 1
 */
function baffleEdgeArcs(width, height, sourceX, sourceY, arcCount) {
  const perimeter = 2 * (width + height);
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  function pointAtPerimeterDistance(s) {
    let remaining = s;
    for (let side = 0; side < 4; side++) {
      const [x0, y0] = corners[side];
      const [x1, y1] = corners[(side + 1) % 4];
      const sideLength = Math.hypot(x1 - x0, y1 - y0);
      if (remaining <= sideLength) {
        const t = remaining / sideLength;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      }
      remaining -= sideLength;
    }
    return corners[0];
  }

  const boundaryPoints = [];
  for (let i = 0; i < arcCount; i++) {
    boundaryPoints.push(pointAtPerimeterDistance((i / arcCount) * perimeter));
  }

  const arcs = [];
  let totalWeight = 0;
  for (let i = 0; i < arcCount; i++) {
    const [ax, ay] = boundaryPoints[i];
    const [bx, by] = boundaryPoints[(i + 1) % arcCount];
    const angleA = Math.atan2(ay - sourceY, ax - sourceX);
    const angleB = Math.atan2(by - sourceY, bx - sourceX);
    let deltaAngle = angleB - angleA;
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

    const midX = (ax + bx) / 2 - sourceX;
    const midY = (ay + by) / 2 - sourceY;
    const weight = Math.abs(deltaAngle);
    totalWeight += weight;
    arcs.push({ weight, distance: Math.hypot(midX, midY) });
  }

  for (const arc of arcs) arc.weight /= totalWeight;
  return arcs;
}

/**
 * Source points approximating a finite driver cone: the centre plus a ring
 * at 0.7x the cone radius (an area-weighted compromise between the centre
 * and the rim, commonly used to tame point-source ripple exaggeration).
 */
function driverSourcePoints(centerX, centerY, coneDiameterM) {
  if (!(coneDiameterM > 0)) return [[centerX, centerY]];
  const ringRadius = 0.7 * (coneDiameterM / 2);
  const points = [[centerX, centerY]];
  const ringPointCount = 6;
  for (let i = 0; i < ringPointCount; i++) {
    const angle = (i / ringPointCount) * 2 * Math.PI;
    points.push([centerX + ringRadius * Math.cos(angle), centerY + ringRadius * Math.sin(angle)]);
  }
  return points;
}

/**
 * On-axis gain in dB relative to an infinite baffle, across the given
 * frequencies, for a driver mounted on a flat rectangular baffle.
 *
 * @param {number[]|Float64Array} frequenciesHz
 * @param {object} params
 * @param {number} params.baffleWidthM
 * @param {number} params.baffleHeightM
 * @param {number} params.driverOffsetXM - from the baffle's left edge
 * @param {number} params.driverOffsetYM - from the baffle's top edge
 * @param {number} [params.driverDiameterM] - cone diameter, for finite-source averaging
 * @param {number} [params.listenDistanceM=1] - on-axis listening/measurement distance
 * @param {number} [params.speedOfSoundMps=343]
 * @param {number} [params.arcCount=360] - perimeter discretisation; higher is more accurate, slower
 * @returns {Float64Array} gain in dB, same length as frequenciesHz
 */
export function baffleDiffractionDb(frequenciesHz, params) {
  const {
    baffleWidthM,
    baffleHeightM,
    driverOffsetXM,
    driverOffsetYM,
    driverDiameterM = 0,
    listenDistanceM = 1,
    speedOfSoundMps = SPEED_OF_SOUND,
    arcCount = 360,
  } = params;

  if (!(baffleWidthM > 0) || !(baffleHeightM > 0)) {
    throw new Error('Baffle width and height must be positive');
  }

  const margin = 1e-4;
  const sources = driverSourcePoints(driverOffsetXM, driverOffsetYM, driverDiameterM).map(([x, y]) => {
    const clampedX = Math.min(baffleWidthM - margin, Math.max(margin, x));
    const clampedY = Math.min(baffleHeightM - margin, Math.max(margin, y));
    const arcs = baffleEdgeArcs(baffleWidthM, baffleHeightM, clampedX, clampedY, arcCount);
    return arcs.map((arc) => ({
      weight: arc.weight,
      pathExcess: arc.distance + Math.hypot(arc.distance, listenDistanceM) - listenDistanceM,
    }));
  });

  const gainDb = new Float64Array(frequenciesHz.length);
  for (let i = 0; i < frequenciesHz.length; i++) {
    const wavenumber = (2 * Math.PI * frequenciesHz[i]) / speedOfSoundMps;

    let realSum = 0;
    let imagSum = 0;
    for (const arcs of sources) {
      let edgeReal = 0;
      let edgeImag = 0;
      for (const { weight, pathExcess } of arcs) {
        const phase = wavenumber * pathExcess;
        edgeReal += weight * Math.cos(phase);
        edgeImag -= weight * Math.sin(phase);
      }
      realSum += 1 - 0.5 * edgeReal;
      imagSum += -0.5 * edgeImag;
    }
    realSum /= sources.length;
    imagSum /= sources.length;

    gainDb[i] = 10 * Math.log10(realSum * realSum + imagSum * imagSum);
  }

  return gainDb;
}

/** Generates count frequencies log-spaced from minHz to maxHz, inclusive. */
export function logSpace(minHz, maxHz, count) {
  const result = new Float64Array(count);
  const logMin = Math.log(minHz);
  const logMax = Math.log(maxHz);
  for (let i = 0; i < count; i++) {
    result[i] = Math.exp(logMin + ((logMax - logMin) * i) / (count - 1));
  }
  return result;
}
