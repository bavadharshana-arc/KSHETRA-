# KSHETRA GIS data layer

This directory holds the **geometry** half of the map's data — physically
shaped parcel boundaries and the project corridor centerline — kept
deliberately separate from the **intelligence** half (risk, blocker status,
priority, owner…), which continues to live entirely in the real, canonical
`Parcel`/`Project` records already used by the rest of the app
(`src/data/mockData.ts`, `AppContext`, the persistence API).

```
PARCEL GEOMETRY  (this directory)         ≠         AI / KSHETRA INTELLIGENCE
  parcels.geojson                                      Parcel.riskLevel
  projectCorridor.geojson                               Parcel.delayRiskScore
  spatialUtils.ts (real turf.js math)                   Parcel.priority, owner, status…
                         \                             /
                          parcelIntelligence.ts (join by parcel_id)
                                       ↓
                          GisMapView.tsx (renders the joined result)
```

## Files

- **`parcels.geojson`** — a `FeatureCollection` of `Polygon` features, one
  per real KSHETRA parcel (`P-0245`, `P-0189`, …), each carrying only
  `parcel_id` / `survey_no` / `village` as properties. Generated once by a
  scratch script (irregular, seeded-random field-boundary shapes, centered
  on and scaled to each parcel's real `centerCoordinate`/`areaAcres` so the
  demo geometry is at least internally consistent with the canonical
  non-geometric data it's joined to — never a regular hexagon/rectangle).
- **`projectCorridor.geojson`** — a `LineString` Feature whose coordinates
  are copied verbatim from the real `Project.corridorPath`. If the in-app
  route editor changes `corridorPath`, this file is a **derived export** and
  must be regenerated to match — it is not an independent source of truth.
- **`spatialUtils.ts`** — real spatial-intersection logic (turf.js):
  splitting the corridor into legs with true haversine lengths, finding
  each parcel's nearest leg, and filtering to parcels within a documented
  influence buffer. No file anywhere hardcodes "parcel X affects segment Y"
  — that relationship is always computed fresh from the actual coordinates.
- **`parcelIntelligence.ts`** — the one join point between a GeoJSON
  feature's `parcel_id` and the real `Parcel` record. Never stores or
  duplicates intelligence fields itself.

## Honesty requirement (this is a hackathon prototype)

`parcels.geojson`'s own `properties.status` field says so explicitly, and
every place this layer is labeled in the UI must say **"Demo cadastral
layer"** / **"Prototype GIS layer"** — never "official cadastral data",
"live government data", or "government-verified parcel boundary". This
geometry is synthetic, generated for demonstration purposes; it is not
sourced from Survey of India, Bhu-Naksha/ULPIN, or any state revenue
department cadastral system.

## Swapping in real cadastral data

To go from this demo layer to an authorized government cadastral export,
**replace `parcels.geojson` with the real file** (same `FeatureCollection`
of `Polygon` features). The only hard requirement is that each feature's
`properties.parcel_id` matches an existing KSHETRA `Parcel.id` so
`parcelIntelligence.ts`'s join keeps working — no other file needs to
change. Real cadastral parcels a real corridor doesn't actually pass
through simply won't be flagged as corridor-affected by
`spatialUtils.ts`'s real distance calculation, which is exactly the correct,
honest behavior.
