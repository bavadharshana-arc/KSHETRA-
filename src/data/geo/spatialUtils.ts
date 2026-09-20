import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';

/**
 * KSHETRA — real spatial intersection helpers for the corridor/parcel GIS
 * layer. Every function here is a genuine geometric computation (via
 * turf.js) over the actual polygon/line coordinates in
 * src/data/geo/parcels.geojson and src/data/geo/projectCorridor.geojson —
 * never a hardcoded "parcel X affects segment Y" assertion. See
 * src/data/geo/README.md for the overall data-architecture rationale.
 */

/** One straight leg of the corridor centerline (between two consecutive
 * alignment waypoints), with its own real, haversine-derived length. This
 * is the unit "construction impact" is reported against — a corridor built
 * from only a handful of waypoints over tens of km is too coarse to
 * attribute impact at sub-leg precision honestly, so a whole leg's length
 * is the most granular real number this prototype can defensibly report. */
export interface CorridorLeg {
  index: number;
  line: Feature<LineString>;
  lengthKm: number;
}

/** Splits a corridor LineString feature into its individual legs (one per
 * consecutive coordinate pair), each with its own real length via
 * `turf.length`. */
export function getCorridorLegs(corridor: Feature<LineString>): CorridorLeg[] {
  const coords = corridor.geometry.coordinates;
  const legs: CorridorLeg[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const line = turf.lineString([coords[i], coords[i + 1]]);
    legs.push({ index: i, line, lengthKm: +turf.length(line, { units: 'kilometers' }).toFixed(2) });
  }
  return legs;
}

// NOTE: the former "nearest corridor leg" helpers were removed on purpose.
// Nearness to a leg is not evidence of construction impact; parcel↔corridor
// relationships are computed from geometry overlap in corridorRelation.ts.
