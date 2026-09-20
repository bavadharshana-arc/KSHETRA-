import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { RiskLevel } from '../../types';

/**
 * KSHETRA — the single source of spatial truth for "how does this parcel
 * relate to the active corridor?". Used by the readiness hook, the GIS view
 * and the case-story strip so they can never disagree.
 *
 * Four separate questions are kept apart on purpose:
 *   1. PARCEL RISK           — the existing computed exposure band (not here)
 *   2. SPATIAL RELATION      — intersects / proximity / outside / unavailable
 *   3. DIRECT IMPACT         — only when the parcel footprint overlaps the ROW
 *   4. DOWNSTREAM WORKFRONT  — NOT computed by this prototype
 *
 * HONESTY:
 *  - The project has no legal ROW boundary. `NOMINAL_ROW_WIDTH_METERS` is a
 *    planning ASSUMPTION (the project's stated 60 m right-of-way) applied as a
 *    centreline buffer. It is not a surveyed or legal footprint.
 *  - "Nearest corridor segment" is never used as evidence of impact.
 *  - A direct-impact length is the length of corridor whose nominal ROW
 *    footprint actually overlaps the parcel polygon — never a whole leg.
 */
export const NOMINAL_ROW_WIDTH_METERS = 60;
/** Explicit proximity buffer: within this distance a parcel is flagged as a
 * *potential* proximity concern only — no corridor length is attributed. */
export const PROXIMITY_BUFFER_METERS = 500;
const SAMPLE_STEP_METERS = 5;

export type SpatialRelation = 'intersects' | 'proximity' | 'outside' | 'unavailable';

export interface ParcelCorridorRelation {
  relation: SpatialRelation;
  /** Shortest distance from the parcel polygon to the corridor centreline (0 when it crosses it). null when unavailable. */
  distanceMeters: number | null;
  /** Length of corridor whose nominal ROW footprint overlaps the parcel. 0 unless relation === 'intersects'. */
  directLengthKm: number;
  /** The overlapped corridor stretches, as [lat, lng] polylines (for map drawing). */
  directSegments: [number, number][][];
}

const UNAVAILABLE: ParcelCorridorRelation = { relation: 'unavailable', distanceMeters: null, directLengthKm: 0, directSegments: [] };

type LngLat = [number, number];

/** Liang–Barsky clip of segment a→b (lng/lat) to a bbox; returns the parameter range inside, or null. */
function clipParam(a: LngLat, b: LngLat, bb: [number, number, number, number]): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - bb[0], bb[2] - a[0], a[1] - bb[1], bb[3] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

function boundarySamples(poly: Feature<Polygon>): LngLat[] {
  const ring = poly.geometry.coordinates[0];
  const line = turf.lineString(ring);
  const len = turf.length(line, { units: 'meters' });
  const n = Math.max(ring.length, Math.ceil(len / 10));
  const out: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(turf.along(line, (len * i) / n, { units: 'meters' }).geometry.coordinates as LngLat);
  }
  return out;
}

/**
 * Relates one parcel polygon to the ACTIVE corridor path ([lat, lng] waypoints).
 * Returns `unavailable` when either geometry is missing — never a guess.
 */
export function computeParcelCorridorRelation(
  parcel: Feature<Polygon> | null | undefined,
  corridorPath: [number, number][] | null | undefined,
  opts: { rowWidthMeters?: number; proximityMeters?: number } = {}
): ParcelCorridorRelation {
  if (!parcel || !parcel.geometry || !corridorPath || corridorPath.length < 2) return UNAVAILABLE;
  const half = (opts.rowWidthMeters ?? NOMINAL_ROW_WIDTH_METERS) / 2;
  const proximity = opts.proximityMeters ?? PROXIMITY_BUFFER_METERS;

  const coords: LngLat[] = corridorPath.map(([lat, lng]) => [lng, lat]);
  const line = turf.lineString(coords);

  // Distance from the parcel polygon to the centreline.
  let distance: number;
  if (turf.booleanIntersects(parcel, line)) {
    distance = 0;
  } else {
    distance = Infinity;
    for (const pt of boundarySamples(parcel)) {
      const d = turf.pointToLineDistance(pt, line, { units: 'meters' });
      if (d < distance) distance = d;
    }
  }
  const distanceMeters = Math.round(distance);

  if (distance > half) {
    return {
      relation: distance <= proximity ? 'proximity' : 'outside',
      distanceMeters,
      directLengthKm: 0,
      directSegments: []
    };
  }

  // The nominal ROW footprint overlaps the parcel: measure the overlapped
  // corridor stretch by sampling the centreline inside the parcel expanded by
  // half the ROW width.
  const expanded = turf.buffer(parcel, half, { units: 'meters' }) as Feature<Polygon>;
  const bb = turf.bbox(expanded) as [number, number, number, number];
  const segments: [number, number][][] = [];
  let totalMeters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const range = clipParam(a, b, bb);
    if (!range) continue;
    const legMeters = turf.distance(a, b, { units: 'meters' });
    const n = Math.max(1, Math.ceil(((range[1] - range[0]) * legMeters) / SAMPLE_STEP_METERS));
    const stepMeters = ((range[1] - range[0]) * legMeters) / n;
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length > 0) {
        segments.push(run);
        totalMeters += run.length * stepMeters;
      }
      run = [];
    };
    for (let k = 0; k <= n; k++) {
      const t = range[0] + ((range[1] - range[0]) * k) / n;
      const pt: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (turf.booleanPointInPolygon(pt, expanded)) run.push([pt[1], pt[0]]);
      else flush();
    }
    flush();
  }
  const directLengthKm = Math.max(0.01, +(totalMeters / 1000).toFixed(2));
  return { relation: 'intersects', distanceMeters, directLengthKm, directSegments: segments };
}

export interface ConstructionImpactText {
  /** "Outside active ROW · 203 m from centreline" etc. */
  spatial: string;
  /** Headline for the construction-impact row. */
  impact: string;
  /** Extra explanatory line (may be empty). */
  note: string;
  tone: 'blocked' | 'partial' | 'ready' | 'proximity' | 'none' | 'unavailable';
}

/** Presentation of a relation, keeping RISK, SPATIAL RELATION and IMPACT distinct. */
export function describeConstructionImpact(rel: ParcelCorridorRelation | null | undefined, riskLevel: RiskLevel): ConstructionImpactText {
  if (!rel || rel.relation === 'unavailable') {
    return {
      spatial: 'No surveyed geometry for this parcel',
      impact: 'Impact cannot be established from available geometry',
      note: '',
      tone: 'unavailable'
    };
  }
  const d = rel.distanceMeters ?? 0;
  if (rel.relation === 'intersects') {
    const word = riskLevel === 'high' ? 'BLOCKED' : riskLevel === 'medium' ? 'PARTIAL' : 'READY';
    return {
      spatial: `Overlaps nominal ${NOMINAL_ROW_WIDTH_METERS} m ROW footprint`,
      impact: `${word} · ${rel.directLengthKm} km of corridor`,
      note: `Length of corridor whose nominal ROW footprint overlaps this parcel (planning assumption, not a legal boundary).`,
      tone: riskLevel === 'high' ? 'blocked' : riskLevel === 'medium' ? 'partial' : 'ready'
    };
  }
  if (rel.relation === 'proximity') {
    return {
      spatial: `Outside active ROW · ${d} m from centreline`,
      impact: 'Potential proximity impact',
      note: `Within the ${PROXIMITY_BUFFER_METERS} m proximity buffer. No direct construction impact is established and no corridor length is attributed.`,
      tone: 'proximity'
    };
  }
  return {
    spatial: `Outside active ROW · ${d} m from centreline`,
    impact: 'No direct construction impact',
    note: '',
    tone: 'none'
  };
}
