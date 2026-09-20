import { useMemo } from 'react';
import * as turf from '@turf/turf';
import { useApp } from '../context/AppContext';
import parcelsGeoJsonRaw from '../data/geo/parcels.geojson?raw';
import {
  joinParcelGeometryToIntelligence,
  type ParcelGeoFeatureCollection,
} from '../data/geo/parcelIntelligence';
import { computeParcelCorridorRelation, type ParcelCorridorRelation } from '../data/geo/corridorRelation';
import type { Parcel } from '../types';

const PARCELS_GEOJSON: ParcelGeoFeatureCollection = JSON.parse(parcelsGeoJsonRaw);

/**
 * KSHETRA — corridor-wide construction-readiness aggregation.
 *
 * "Acquired" (a LARR statutory-stage status) is NOT the same thing as
 * "construction-ready". This hook answers the second question from the SAME
 * spatial truth used everywhere else (`data/geo/corridorRelation.ts`):
 *
 *   - A parcel contributes corridor length ONLY when its footprint actually
 *     overlaps the active corridor's nominal ROW footprint, and only the
 *     overlapped length (never a whole corridor leg).
 *   - A parcel merely NEAR the corridor (proximity buffer) or outside it
 *     contributes nothing to blocked/partial/ready length.
 *   - The corridor is the ACTIVE `project.corridorPath`, so switching
 *     alignment recomputes everything.
 *
 * Honesty boundary: real parcel polygon geometry exists ONLY for the 8 demo
 * seed parcels. A project whose parcels don't match any polygon has no
 * geometry to compute from — `available` is false and nothing is invented.
 * Downstream workfront impact (what a blocked parcel does to the stretch of
 * road beyond its own footprint) is NOT computed by this prototype.
 */

export type LegReadiness = 'ready' | 'partial' | 'blocked';

/** One parcel's overlapped corridor stretch, classified by that parcel's existing risk band. */
export interface ConstructionReadinessSegment {
  parcelId: string;
  status: LegReadiness;
  lengthKm: number;
  /** [lat, lng] polylines for map drawing. */
  coords: [number, number][][];
}

export interface ConstructionReadinessResult {
  available: boolean;
  reason?: string;
  totalCorridorKm: number;
  readyKm: number;
  partialKm: number;
  blockedKm: number;
  /** Corridor length with no overlapping surveyed parcel: NOT assessed (neither ready nor blocked). */
  unsurveyedKm: number;
  readyPct: number;
  blockedPct: number;
  /** Parcels whose footprint overlaps the ROW, by existing risk band. */
  affectedParcels: { ready: number; partial: number; blocked: number };
  /** Parcels near (proximity buffer) but not overlapping the ROW. */
  proximityParcels: number;
  /** Parcels with geometry that are outside both the ROW and the proximity buffer. */
  outsideParcels: number;
  blockedSegments: ConstructionReadinessSegment[];
  partialSegments: ConstructionReadinessSegment[];
  readySegments: ConstructionReadinessSegment[];
  /** Spatial relation per parcel id (only parcels with geometry). Missing id ⇒ impact unavailable. */
  relations: Record<string, ParcelCorridorRelation>;
}

const EMPTY = (reason: string): ConstructionReadinessResult => ({
  available: false,
  reason,
  totalCorridorKm: 0,
  readyKm: 0,
  partialKm: 0,
  blockedKm: 0,
  unsurveyedKm: 0,
  readyPct: 0,
  blockedPct: 0,
  affectedParcels: { ready: 0, partial: 0, blocked: 0 },
  proximityParcels: 0,
  outsideParcels: 0,
  blockedSegments: [],
  partialSegments: [],
  readySegments: [],
  relations: {},
});

export const useConstructionReadiness = (): ConstructionReadinessResult => {
  const { project, parcels } = useApp();

  return useMemo(() => {
    if (!project.corridorPath || project.corridorPath.length < 2) {
      return EMPTY('No corridor alignment drawn for this project yet.');
    }

    const matched = joinParcelGeometryToIntelligence(PARCELS_GEOJSON, parcels).filter(
      (jp) => jp.intelligence !== null
    );

    if (matched.length === 0) {
      return EMPTY(
        "No surveyed cadastral geometry is available yet for this project's parcels: construction-readiness cannot be computed from real polygons. (Demo parcel geometry exists only for the flagship corridor's 8 seed parcels.)"
      );
    }

    const corridorLine = turf.lineString(project.corridorPath.map(([lat, lng]) => [lng, lat]));
    const totalCorridorKm = +turf.length(corridorLine, { units: 'kilometers' }).toFixed(2);

    const relations: Record<string, ParcelCorridorRelation> = {};
    const blockedSegments: ConstructionReadinessSegment[] = [];
    const partialSegments: ConstructionReadinessSegment[] = [];
    const readySegments: ConstructionReadinessSegment[] = [];
    const affectedParcels = { ready: 0, partial: 0, blocked: 0 };
    let proximityParcels = 0;
    let outsideParcels = 0;
    let readyKm = 0;
    let partialKm = 0;
    let blockedKm = 0;

    for (const jp of matched) {
      const parcel = jp.intelligence as Parcel;
      const rel = computeParcelCorridorRelation(jp.feature, project.corridorPath);
      relations[parcel.id] = rel;

      if (rel.relation === 'proximity') proximityParcels += 1;
      else if (rel.relation === 'outside') outsideParcels += 1;
      if (rel.relation !== 'intersects') continue;

      const status: LegReadiness =
        parcel.riskLevel === 'high' ? 'blocked' : parcel.riskLevel === 'medium' ? 'partial' : 'ready';
      const seg: ConstructionReadinessSegment = {
        parcelId: parcel.id,
        status,
        lengthKm: rel.directLengthKm,
        coords: rel.directSegments,
      };
      if (status === 'blocked') { blockedSegments.push(seg); blockedKm += rel.directLengthKm; affectedParcels.blocked += 1; }
      else if (status === 'partial') { partialSegments.push(seg); partialKm += rel.directLengthKm; affectedParcels.partial += 1; }
      else { readySegments.push(seg); readyKm += rel.directLengthKm; affectedParcels.ready += 1; }
    }

    readyKm = +readyKm.toFixed(2);
    partialKm = +partialKm.toFixed(2);
    blockedKm = +blockedKm.toFixed(2);
    const unsurveyedKm = Math.max(0, +(totalCorridorKm - readyKm - partialKm - blockedKm).toFixed(2));

    return {
      available: true,
      totalCorridorKm,
      readyKm,
      partialKm,
      blockedKm,
      unsurveyedKm,
      readyPct: totalCorridorKm > 0 ? Math.round((readyKm / totalCorridorKm) * 100) : 0,
      blockedPct: totalCorridorKm > 0 ? Math.round((blockedKm / totalCorridorKm) * 100) : 0,
      affectedParcels,
      proximityParcels,
      outsideParcels,
      blockedSegments,
      partialSegments,
      readySegments,
      relations,
    };
  }, [project.corridorPath, parcels]);
};
