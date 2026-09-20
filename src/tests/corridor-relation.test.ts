import { describe, it, expect } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import {
  computeParcelCorridorRelation,
  describeConstructionImpact,
  NOMINAL_ROW_WIDTH_METERS,
  PROXIMITY_BUFFER_METERS
} from '../data/geo/corridorRelation';
import parcelsRaw from '../data/geo/parcels.geojson?raw';
import { INITIAL_PROJECT } from '../data/mockData';

const LAT0 = 11.75;
const M_PER_DEG_LAT = 111_000;
const M_PER_DEG_LNG = 111_000 * Math.cos((LAT0 * Math.PI) / 180);

/** ~100 m square whose centre is `northMeters` north of the corridor line, at lng `lng`. */
const square = (lng: number, northMeters: number, sizeM = 100): Feature<Polygon> => {
  const cLat = LAT0 + northMeters / M_PER_DEG_LAT;
  const h = sizeM / 2;
  const dLat = h / M_PER_DEG_LAT;
  const dLng = h / M_PER_DEG_LNG;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng - dLng, cLat - dLat], [lng + dLng, cLat - dLat], [lng + dLng, cLat + dLat], [lng - dLng, cLat + dLat], [lng - dLng, cLat - dLat]]]
    }
  };
};

// East–west corridor at LAT0, ~11 km long, as [lat, lng] waypoints.
const CORRIDOR: [number, number][] = [[LAT0, 78.0], [LAT0, 78.05], [LAT0, 78.1]];

describe('parcel ↔ corridor spatial relation', () => {
  it('parcel crossing the corridor → direct impact with the overlapped length (not a whole leg)', () => {
    const r = computeParcelCorridorRelation(square(78.02, 0), CORRIDOR);
    expect(r.relation).toBe('intersects');
    expect(r.distanceMeters).toBe(0);
    // ~100 m parcel + 30 m ROW half-width each side ≈ 0.16 km, nowhere near a 5 km leg
    expect(r.directLengthKm).toBeGreaterThan(0.1);
    expect(r.directLengthKm).toBeLessThan(0.25);
    expect(r.directSegments.length).toBeGreaterThan(0);
  });

  it('parcel beside the corridor but outside the ROW → proximity only, NO attributed length', () => {
    const r = computeParcelCorridorRelation(square(78.02, 200), CORRIDOR); // edge ≈ 150 m from centreline
    expect(r.relation).toBe('proximity');
    expect(r.directLengthKm).toBe(0);
    expect(r.directSegments).toEqual([]);
    expect(r.distanceMeters).toBeGreaterThan(NOMINAL_ROW_WIDTH_METERS / 2);
    expect(r.distanceMeters).toBeLessThanOrEqual(PROXIMITY_BUFFER_METERS);
    const t = describeConstructionImpact(r, 'medium');
    expect(t.impact).toBe('Potential proximity impact');
    expect(t.impact).not.toMatch(/km/);
  });

  it('parcel far from the corridor → no direct construction impact', () => {
    const r = computeParcelCorridorRelation(square(78.02, 3000), CORRIDOR);
    expect(r.relation).toBe('outside');
    expect(r.directLengthKm).toBe(0);
    const t = describeConstructionImpact(r, 'high');
    expect(t.impact).toBe('No direct construction impact');
    expect(t.spatial).toMatch(/Outside active ROW/);
  });

  it('risk and impact stay independent: a medium-risk parcel outside the ROW has no impact', () => {
    const t = describeConstructionImpact(computeParcelCorridorRelation(square(78.02, 3000), CORRIDOR), 'medium');
    expect(t.tone).toBe('none');
  });

  it('missing geometry → unavailable, never fabricated', () => {
    for (const rel of [
      computeParcelCorridorRelation(null, CORRIDOR),
      computeParcelCorridorRelation(square(78.02, 0), []),
      computeParcelCorridorRelation(square(78.02, 0), undefined)
    ]) {
      expect(rel.relation).toBe('unavailable');
      expect(rel.directLengthKm).toBe(0);
      expect(rel.distanceMeters).toBeNull();
      expect(describeConstructionImpact(rel, 'high').impact).toBe('Impact cannot be established from available geometry');
    }
  });

  it('changing the active alignment recalculates the relation', () => {
    const parcel = square(78.02, 0);
    const onOldRoute = computeParcelCorridorRelation(parcel, CORRIDOR);
    const movedRoute: [number, number][] = CORRIDOR.map(([lat, lng]) => [lat + 3000 / M_PER_DEG_LAT, lng]);
    const onNewRoute = computeParcelCorridorRelation(parcel, movedRoute);
    expect(onOldRoute.relation).toBe('intersects');
    expect(onNewRoute.relation).toBe('outside');
    expect(onNewRoute.directLengthKm).toBe(0);
  });

  it('impact word follows the existing risk band', () => {
    const rel = computeParcelCorridorRelation(square(78.02, 0), CORRIDOR);
    expect(describeConstructionImpact(rel, 'high').impact).toMatch(/^BLOCKED · /);
    expect(describeConstructionImpact(rel, 'medium').impact).toMatch(/^PARTIAL · /);
    expect(describeConstructionImpact(rel, 'low').impact).toMatch(/^READY · /);
  });
});

describe('seed data regression (real demo geometry vs the seed corridor)', () => {
  const fc = JSON.parse(parcelsRaw) as { features: Feature<Polygon, { parcel_id: string }>[] };
  const rel = (id: string) =>
    computeParcelCorridorRelation(fc.features.find(f => f.properties.parcel_id === id), INITIAL_PROJECT.corridorPath);

  it('P-0733 is NOT a direct construction impact and gets no 5.52 km attribution', () => {
    const r = rel('P-0733');
    expect(r.relation).not.toBe('intersects');
    expect(r.directLengthKm).toBe(0);
  });

  it('every intersecting seed parcel reports a short overlap, never a whole leg', () => {
    for (const f of fc.features) {
      const r = rel(f.properties.parcel_id);
      if (r.relation === 'intersects') expect(r.directLengthKm).toBeLessThan(0.5);
      else expect(r.directLengthKm).toBe(0);
    }
  });
});
