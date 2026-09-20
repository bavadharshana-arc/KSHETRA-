import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Parcel } from '../../types';

/**
 * KSHETRA — the join boundary between PARCEL GEOMETRY and AI/KSHETRA
 * INTELLIGENCE (see src/data/geo/README.md for the full architecture
 * rationale). These are deliberately two separate data sources:
 *
 *   - Geometry: src/data/geo/parcels.geojson — a GIS layer, carrying only
 *     stable physical-parcel identity (parcel_id, survey_no, village).
 *     Swappable for an authorized government cadastral export without
 *     touching anything below this line.
 *   - Intelligence: the real, canonical `Parcel` record already living in
 *     AppContext (src/data/mockData.ts / the persistence API) — risk,
 *     status, owner, priority, etc. Exactly the same source every other
 *     KSHETRA view already reads (see the [[parcel-source-of-truth]]
 *     project convention: never a second, hardcoded copy of this data).
 *
 * `joinParcelGeometryToIntelligence` is the ONE place these two are
 * combined, by `parcel_id`, at render time — never persisted, never
 * duplicated.
 */

export interface ParcelGeometryProperties {
  parcel_id: string;
  survey_no: string;
  village: string;
}

export type ParcelGeoFeature = Feature<Polygon, ParcelGeometryProperties>;
export type ParcelGeoFeatureCollection = FeatureCollection<Polygon, ParcelGeometryProperties>;

/** One joined map feature: geometry-layer identity + (if found) the real
 * Parcel record. `intelligence` is `null` — never a fabricated stand-in —
 * when a GeoJSON feature's `parcel_id` has no matching real `Parcel` (e.g.
 * a cadastral layer that legitimately covers more ground than KSHETRA has
 * case data for). */
export interface ParcelMapFeature {
  geometry: ParcelGeometryProperties;
  feature: ParcelGeoFeature;
  intelligence: Parcel | null;
}

export function joinParcelGeometryToIntelligence(
  geojson: ParcelGeoFeatureCollection,
  parcels: Parcel[]
): ParcelMapFeature[] {
  const byId = new Map(parcels.map((p) => [p.id, p] as const));
  return geojson.features.map((feature) => ({
    geometry: feature.properties,
    feature,
    intelligence: byId.get(feature.properties.parcel_id) ?? null,
  }));
}

export type ParcelVisualStatus = 'high' | 'medium' | 'low' | 'unknown';

/** Maps a joined feature's real `Parcel.riskLevel` onto the map's fill
 * -color tier. Returns 'unknown' (rendered neutral, never a guessed color)
 * when there is no matched intelligence record at all. */
export function parcelVisualStatus(feature: ParcelMapFeature): ParcelVisualStatus {
  if (!feature.intelligence) return 'unknown';
  return feature.intelligence.riskLevel;
}
