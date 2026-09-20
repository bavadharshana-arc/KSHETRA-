import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import * as turf from '@turf/turf';
import {
  Eye,
  AlertTriangle,
  RotateCcw,
  Search,
  Check,
  X,
  Route,
  Info,
  MapPin,
  Navigation,
  MousePointerClick,
  Plus,
  Undo2,
  Redo2,
  Layers
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Parcel } from '../../types';
import { AlignmentPointsPanel } from './AlignmentPointsPanel';
import parcelsGeoJsonRaw from '../../data/geo/parcels.geojson?raw';
import {
  joinParcelGeometryToIntelligence,
  type ParcelGeoFeatureCollection,
  type ParcelMapFeature,
} from '../../data/geo/parcelIntelligence';
import {
  describeConstructionImpact,
  NOMINAL_ROW_WIDTH_METERS,
  PROXIMITY_BUFFER_METERS
} from '../../data/geo/corridorRelation';

// Parsed once at module load — see src/data/geo/README.md for the full
// architecture. `?raw` (a core Vite feature) avoids needing any bundler
// config change to teach it the `.geojson` extension; these are ordinary
// JSON text files under the hood.
const PARCELS_GEOJSON: ParcelGeoFeatureCollection = JSON.parse(parcelsGeoJsonRaw);

import { ProjectAssessmentPanel } from './ProjectAssessmentPanel';
import { MapParcelIntel } from './MapParcelIntel';
import { labelPriority, labelSize, placeLabel } from '../../data/geo/labelLayout';
import { useConstructionReadiness } from '../../hooks/useConstructionReadiness';

export const GisMapView: React.FC = () => {
  const { 
    parcels, 
    project, 
    openParcelDetail,
    routeEditState,
    setDraftStartCoords,
    setDraftEndCoords,
    setRouteEditStep,
    updateDraftRoute,
    cancelRouteDraft,
    commitRouteDraft,
    undoAlignment,
    redoAlignment,
        canUndoAlignment,
    canRedoAlignment,
    alignments,
    settings
  } = useApp();
  const readiness = useConstructionReadiness();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const corridorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeEditLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedMapParcel, setSelectedMapParcel] = useState<Parcel | null>(null);
  const [mapFilter, setMapFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [mapSearch, setMapSearch] = useState<string>('');
  const [basemap, setBasemap] = useState<'standard' | 'satellite' | 'dark'>('satellite');
  const [showCorridorBuffer, setShowCorridorBuffer] = useState<boolean>(true);
    const [legendCollapsed, setLegendCollapsed] = useState<boolean>(false);
  const [showReadiness, setShowReadiness] = useState<boolean>(true);

  // GIS parcel geometry (src/data/geo/parcels.geojson) joined to the real,
  // canonical Parcel intelligence records already in AppContext — geometry
  // and AI/KSHETRA intelligence are two separate sources, combined here by
  // parcel_id only, never duplicated. See src/data/geo/README.md.
  const joinedParcels: ParcelMapFeature[] = useMemo(
    () => joinParcelGeometryToIntelligence(PARCELS_GEOJSON, parcels),
    [parcels]
  );

  // The corridor centerline split into real, haversine-measured legs, and
  // which of those legs each parcel is genuinely spatially closest to
  // (within a documented influence buffer) — a real turf.js computation
  // over actual coordinates every time, never a hardcoded "parcel X
  // affects segment Y" assertion.
    const projectAlignments = useMemo(() => alignments.filter(a => a.projectId === project.id), [alignments, project.id]);
  const activeAlignment = useMemo(
    () => projectAlignments.find(a => JSON.stringify(a.pathCoordinates) === JSON.stringify(project.corridorPath)) || null,
    [projectAlignments, project.corridorPath]
  );
  const recommendedAlignment = projectAlignments.find(a => a.isRecommended) || null;

  // Keep the selected parcel in step with the live record (risk band, status).
  useEffect(() => {
    setSelectedMapParcel(prev => {
      if (!prev) return prev;
      const live = parcels.find(p => p.id === prev.id);
      return live && live !== prev ? live : prev;
    });
  }, [parcels]);

  // Spatial truth for every parcel comes from the readiness hook (geometry
  // overlap with the ACTIVE route's nominal ROW). Nearest-leg is never used
  // as evidence of impact.
  const selectedRelation = selectedMapParcel && readiness.available ? readiness.relations[selectedMapParcel.id] : undefined;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [11.7580, 78.0460],
        zoom: 12,
        zoomControl: false
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Tile layer
      const standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      });
      standardLayer.addTo(map);

      const polygonsGroup = L.layerGroup().addTo(map);
      const corridorGroup = L.layerGroup().addTo(map);
      const routeEditGroup = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
      polygonsLayerGroupRef.current = polygonsGroup;
      corridorLayerGroupRef.current = corridorGroup;
      routeEditLayerGroupRef.current = routeEditGroup;

      // Ensure tiles render across view switches and resize
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 150);

      const handleResize = () => {
        map.invalidateSize();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  // Update Basemap Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; OpenStreetMap contributors';

    if (basemap === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri, Maxar, Earthstar Geographics';
    } else if (basemap === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; CARTO';
    }

        L.tileLayer(tileUrl, { attribution }).addTo(map);

    // Keep imagery a quiet background: flatten contrast/saturation so terrain
    // shading doesn't compete with the cadastral overlays, and add a roads
    // reference layer for orientation.
    const tilePane = map.getPane('tilePane');
    if (tilePane) tilePane.style.filter = basemap === 'satellite' ? 'saturate(0.7) brightness(0.9) contrast(0.88)' : '';
    if (basemap === 'satellite') {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        opacity: 0.7,
        pane: 'overlayPane'
      }).addTo(map).bringToBack();
    }
  }, [basemap]);

  // Fit map bounds when project changes or when draft route is initiated
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeEditState?.active && routeEditState.routeCoords && routeEditState.routeCoords.length > 1) {
      const bounds = L.latLngBounds(routeEditState.routeCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        } else if (!routeEditState?.active && joinedParcels.length > 0) {
      // Frame the surveyed parcels (and the corridor running through them) so
      // the cadastral polygons are legible; "Fit Corridor" shows the full route.
      const b = L.geoJSON(joinedParcels.map(jp => jp.feature) as never).getBounds().pad(0.3);
      if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
    } else if (!routeEditState?.active && project.corridorPath && project.corridorPath.length > 1) {
      const bounds = L.latLngBounds(project.corridorPath);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [project.id, routeEditState?.active]);

  // Handle Route Creation / Editing / Point Selection on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const editGroup = routeEditLayerGroupRef.current;
    const corridorGroup = corridorLayerGroupRef.current;
    const polygonsGroup = polygonsLayerGroupRef.current;

    if (!map || !editGroup || !corridorGroup || !polygonsGroup) return;

    editGroup.clearLayers();

    if (!routeEditState?.active) return;

    // Clear regular layers while in draft mode
    corridorGroup.clearLayers();
    polygonsGroup.clearLayers();

    const step = routeEditState.selectionStep || (routeEditState.isNew ? 'select-start' : 'edit-route');
    const startCoord = routeEditState.startCoords;
    const endCoord = routeEditState.endCoords;
    const currentCoords = [...routeEditState.routeCoords];

    // Helper: Render Start Point Marker
    if (startCoord) {
      const startHtml = `
        <div style="
          background: #10B981;
          color: #ffffff;
          font-weight: 800;
          font-size: 10px;
          padding: 3px 7px;
          border-radius: 6px;
          border: 2px solid #ffffff;
          box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          white-space: nowrap;
          cursor: ${step === 'edit-route' ? 'grab' : 'pointer'};
          text-align: center;
        ">
          START
        </div>
      `;

      const startMarker = L.marker(startCoord, {
        icon: L.divIcon({
          className: 'route-start-marker',
          html: startHtml,
          iconSize: [48, 22],
          iconAnchor: [24, 11]
        }),
        draggable: step === 'edit-route'
      });

      startMarker.bindTooltip('Starting Point: ' + startCoord[0].toFixed(6) + ', ' + startCoord[1].toFixed(6), { direction: 'top' });

      if (step === 'edit-route') {
        startMarker.on('drag', () => {
          const newPos = startMarker.getLatLng();
          currentCoords[0] = [newPos.lat, newPos.lng];
          editPolyline?.setLatLngs(currentCoords);
        });
        startMarker.on('dragend', () => {
          const newPos = startMarker.getLatLng();
          currentCoords[0] = [+newPos.lat.toFixed(6), +newPos.lng.toFixed(6)];
          updateDraftRoute([...currentCoords]);
        });
      }

      editGroup.addLayer(startMarker);
    }

    // Helper: Render End Point Marker
    if (endCoord) {
      const endHtml = `
        <div style="
          background: #EF4444;
          color: #ffffff;
          font-weight: 800;
          font-size: 10px;
          padding: 3px 7px;
          border-radius: 6px;
          border: 2px solid #ffffff;
          box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          white-space: nowrap;
          cursor: ${step === 'edit-route' ? 'grab' : 'pointer'};
          text-align: center;
        ">
          END
        </div>
      `;

      const endMarker = L.marker(endCoord, {
        icon: L.divIcon({
          className: 'route-end-marker',
          html: endHtml,
          iconSize: [48, 22],
          iconAnchor: [24, 11]
        }),
        draggable: step === 'edit-route'
      });

      endMarker.bindTooltip('Ending Point: ' + endCoord[0].toFixed(6) + ', ' + endCoord[1].toFixed(6), { direction: 'top' });

      if (step === 'edit-route') {
        endMarker.on('drag', () => {
          const newPos = endMarker.getLatLng();
          currentCoords[currentCoords.length - 1] = [newPos.lat, newPos.lng];
          editPolyline?.setLatLngs(currentCoords);
        });
        endMarker.on('dragend', () => {
          const newPos = endMarker.getLatLng();
          currentCoords[currentCoords.length - 1] = [+newPos.lat.toFixed(6), +newPos.lng.toFixed(6)];
          updateDraftRoute([...currentCoords]);
        });
      }

      editGroup.addLayer(endMarker);
    }

    let editPolyline: L.Polyline | null = null;

    // In 'edit-route' mode: Draw polyline and intermediate draggable waypoints
    if (step === 'edit-route' && currentCoords.length > 1) {
      editPolyline = L.polyline(currentCoords, {
        color: '#2563EB',
        weight: 6,
        opacity: 0.9,
        dashArray: '10, 6'
      });
      editGroup.addLayer(editPolyline);

      // Buffer
      const editBuffer = L.polyline(currentCoords, {
        color: '#3B82F6',
        weight: 24,
        opacity: 0.22
      });
      editGroup.addLayer(editBuffer);

      // Intermediate waypoints
      for (let i = 1; i < currentCoords.length - 1; i++) {
        const idx = i;
        const coord = currentCoords[idx];

        const iconHtml = `
          <div style="
            background: #3B82F6;
            color: #ffffff;
            font-weight: 800;
            font-size: 9px;
            padding: 2px 5px;
            border-radius: 5px;
            border: 2px solid #ffffff;
            box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
            cursor: grab;
            text-align: center;
          ">
            WP-${idx}
          </div>
        `;

        const marker = L.marker(coord, {
          icon: L.divIcon({
            className: 'route-intermediate-marker',
            html: iconHtml,
            iconSize: [42, 20],
            iconAnchor: [21, 10]
          }),
          draggable: true
        });

        marker.bindTooltip(`Waypoint ${idx}: Drag to reshape corridor curve`, { direction: 'top' });

        marker.on('drag', () => {
          const newPos = marker.getLatLng();
          currentCoords[idx] = [newPos.lat, newPos.lng];
          editPolyline?.setLatLngs(currentCoords);
          editBuffer.setLatLngs(currentCoords);
        });

        marker.on('dragend', () => {
          const newPos = marker.getLatLng();
          currentCoords[idx] = [+newPos.lat.toFixed(6), +newPos.lng.toFixed(6)];
          updateDraftRoute([...currentCoords]);
        });

        editGroup.addLayer(marker);
      }
    }

    // Map click handler based on current step
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const clickedLat = +e.latlng.lat.toFixed(6);
      const clickedLng = +e.latlng.lng.toFixed(6);

      if (step === 'select-start') {
        setDraftStartCoords([clickedLat, clickedLng]);
      } else if (step === 'select-end') {
        setDraftEndCoords([clickedLat, clickedLng]);
      } else if (step === 'edit-route') {
        // Add an intermediate waypoint before the end point
        const updated = [...currentCoords];
        updated.splice(updated.length - 1, 0, [clickedLat, clickedLng]);
        updateDraftRoute(updated);
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [routeEditState]);

  // Update Corridor Route & Cadastral Parcel Polygons (Standard View)
  useEffect(() => {
    if (routeEditState?.active) return; // Managed by route edit effect

    const map = mapInstanceRef.current;
    const polygonsGroup = polygonsLayerGroupRef.current;
    const corridorGroup = corridorLayerGroupRef.current;
    const editGroup = routeEditLayerGroupRef.current;

    if (!map || !polygonsGroup || !corridorGroup) return;

    if (editGroup) editGroup.clearLayers();
    polygonsGroup.clearLayers();
    corridorGroup.clearLayers();

        // Overlay intelligence (labels / callouts / zoom-out locator rings) is laid
    // out in screen space with collision avoidance after everything is drawn.
    type LatLngT = [number, number];
    const calloutCandidates: { a: LatLngT; b: LatLngT; c: LatLngT; color: string; word: string; text: string }[] = [];
    const labelCandidates: { id: string; at: LatLngT; color: string; priority: number; sub?: string; parcel: Parcel }[] = [];
    const ringCandidates: { at: LatLngT; color: string; parcel: Parcel }[] = [];

    // 1. Draw Corridor Route (real Project.corridorPath — unchanged from
    // before; route editing/AlignmentPointsPanel still depends on this
    // exact rendering, so it is left untouched).
    if (project.corridorPath && project.corridorPath.length > 1) {
      // Active route drawn as a right-of-way: wide dark casing, slate body,
      // white dashed centreline (road-marking style). Status segments are
      // drawn on top of the body further below.
      corridorGroup.addLayer(L.polyline(project.corridorPath, { color: '#FFFFFF', weight: 22, opacity: 0.16, interactive: false }));
      corridorGroup.addLayer(L.polyline(project.corridorPath, { color: '#020617', weight: 17, opacity: 0.78, interactive: false }));
      const corridorLine = L.polyline(project.corridorPath, {
        color: '#334155',
        weight: 11,
        opacity: 0.95
      });
      corridorLine.bindTooltip(`${project.name} (${project.code}) · active alignment`, { sticky: true });
      corridorGroup.addLayer(corridorLine);
      corridorGroup.addLayer(L.polyline(project.corridorPath, { color: '#F8FAFC', weight: 1.5, opacity: 0.85, dashArray: '7 9', interactive: false }));

      // Nominal ROW footprint, drawn from the same buffer geometry the impact
      // calculation uses (planning assumption, not a legal boundary).
      if (showCorridorBuffer) {
        const rowPoly = turf.buffer(
          turf.lineString(project.corridorPath.map(([lat, lng]) => [lng, lat])),
          NOMINAL_ROW_WIDTH_METERS / 2,
          { units: 'meters' }
        );
        if (rowPoly) {
          corridorGroup.addLayer(
            L.geoJSON(rowPoly as never, {
              style: { color: '#93C5FD', weight: 1, opacity: 0.85, dashArray: '4 4', fillColor: '#93C5FD', fillOpacity: 0.14 },
              interactive: false
            })
          );
        }
      }

      // 1b. Highlight the corridor stretch that THIS parcel's footprint
      // actually overlaps (only when the parcel overlaps the nominal ROW).
      if (selectedMapParcel && selectedRelation && selectedRelation.relation === 'intersects') {
        const highlightColor = selectedMapParcel.riskLevel === 'high' ? '#DC2626' : selectedMapParcel.riskLevel === 'medium' ? '#D97706' : '#059669';
        for (const seg of selectedRelation.directSegments) {
          const hl = L.polyline(seg, { color: highlightColor, weight: 9, opacity: 0.9 });
          hl.bindTooltip(`Corridor overlapped by ${selectedMapParcel.id} · ${selectedRelation.directLengthKm} km`, { sticky: true });
          corridorGroup.addLayer(hl);
        }
      }
    }

    // 1c. Construction-readiness layer: each corridor leg colored by the worst
    // risk band among the parcels spatially matched to it (real geometry;
    // legs with no matched parcel stay uncolored = unsurveyed).
    if (showReadiness && readiness.available) {
      const drawSegments = (
        segs: { parcelId: string; lengthKm: number; coords: [number, number][][] }[],
        color: string,
        label: string,
        word: string,
        totalKm: number
      ) => {
        for (const sg of segs) {
          for (const run of sg.coords) {
            if (run.length < 2) continue;
            const seg = L.polyline(run, { color, weight: 7, opacity: 0.95, lineCap: 'butt' });
            seg.bindTooltip(`${label} · ${sg.parcelId} overlaps ${sg.lengthKm} km of corridor`, { sticky: true });
            corridorGroup.addLayer(seg);
          }
        }
        // Side callout: anchored on the longest overlapped stretch; totals are the computed sums.
        if (segs.length === 0 || totalKm <= 0) return;
        let best: [number, number][] | null = null;
        for (const sg of segs) for (const run of sg.coords) if (!best || run.length > best.length) best = run;
        if (!best || best.length < 2) return;
        const m = Math.floor(best.length / 2);
        calloutCandidates.push({
          a: best[m],
          b: best[Math.max(0, m - 1)],
          c: best[Math.min(best.length - 1, m + 1)],
          color,
          word,
          text: `${totalKm} km · ${segs.length} parcel${segs.length === 1 ? '' : 's'}`
        });
      };
      drawSegments(readiness.readySegments, '#16A34A', 'Construction-ready', 'READY', readiness.readyKm);
      drawSegments(readiness.partialSegments, '#F59E0B', 'Partially ready', 'AT RISK', readiness.partialKm);
      drawSegments(readiness.blockedSegments, '#DC2626', 'Blocked', 'BLOCKED', readiness.blockedKm);
    }

    // 2. Draw Parcel Polygons — from REAL GeoJSON geometry
    // (src/data/geo/parcels.geojson), joined to each parcel's real KSHETRA
    // intelligence record. Geometry and intelligence are two separate
    // sources (see src/data/geo/README.md); this loop is the one place
    // they're combined for rendering.
    const visibleParcels = joinedParcels.filter(jp => {
      const parcel = jp.intelligence;
      if (!parcel) return false; // honest skip — no fabricated intelligence for an unmatched geometry feature
      if (mapFilter !== 'all' && parcel.riskLevel !== mapFilter) return false;
      if (mapSearch.trim()) {
        const q = mapSearch.toLowerCase().trim();
        return (
          parcel.id.toLowerCase().includes(q) ||
          parcel.surveyNumber.toLowerCase().includes(q) ||
          parcel.ownerName.toLowerCase().includes(q) ||
          parcel.village.toLowerCase().includes(q) ||
          (parcel.topRiskFactor && parcel.topRiskFactor.toLowerCase().includes(q))
        );
      }
      return true;
    });

    visibleParcels.forEach(jp => {
      const parcel = jp.intelligence as Parcel;
      const isHigh = parcel.riskLevel === 'high';
      const isMed = parcel.riskLevel === 'medium';
      const isSelected = parcel.id === selectedMapParcel?.id;

      const fillColor = isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#10B981';
      const strokeColor = isHigh ? '#B91C1C' : isMed ? '#B45309' : '#047857';

      // Demo georeferenced parcel geometry, rendered via Leaflet's GeoJSON layer
      // (not a hand-built L.polygon over synthetic point arrays). 20-35%
      // fill opacity by default so the satellite basemap stays visible;
      // boosted only when this parcel is the active selection.
      // Dark halo under every parcel keeps boundaries readable on imagery.
      polygonsGroup.addLayer(L.geoJSON(jp.feature, { style: { color: '#020617', weight: isSelected ? 7 : 4, opacity: isSelected ? 0.75 : 0.5, fill: false }, interactive: false }));
      const polygon = L.geoJSON(jp.feature, {
        style: {
          color: isSelected ? '#FFFFFF' : strokeColor,
          weight: isSelected ? 3.5 : 2,
          fillColor,
          fillOpacity: isSelected ? 0.55 : 0.38,
        },
      });

            const impactText = describeConstructionImpact(readiness.available ? readiness.relations[parcel.id] : undefined, parcel.riskLevel);
      polygon.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
          <strong>${parcel.id} (${parcel.surveyNumber})</strong><br/>
          Blocker: <strong style="color: ${fillColor};">${parcel.topRiskFactor || 'None on record'}</strong><br/>
          Risk: <span style="color: ${fillColor}; font-weight: bold;">${parcel.delayRiskScore}% (${parcel.riskLevel.toUpperCase()})</span><br/>
          Status: ${parcel.acquisitionStatus} &bull; Priority: ${parcel.priority}<br/>
          Construction impact: <strong>${impactText.impact}</strong><br/>
          Village: ${jp.geometry.village}
        </div>
      `, { sticky: true });

      polygon.on('click', () => {
        setSelectedMapParcel(parcel);
      });

                  polygonsGroup.addLayer(polygon);


      // Label marker — anchored to the ACTUAL rendered polygon's centroid
      // (turf.centroid over the real geometry), not a separate/potentially
      // -misaligned display field, so the label never reads as
      // disconnected from its parcel.
      const centroid = turf.centroid(jp.feature).geometry.coordinates; // [lng, lat]
      const atLL: LatLngT = [centroid[1], centroid[0]];
      ringCandidates.push({ at: atLL, color: fillColor, parcel });
      const onCorridor = readiness.available && readiness.relations[parcel.id]?.relation === 'intersects';
            const lp = labelPriority({ isSelected, isHigh, intersectsRow: !!onCorridor, isCritical: parcel.priority === 'CRITICAL' });
      if (lp !== null) {
        const exposureWord = isHigh ? 'High exposure' : isMed ? 'Medium exposure' : 'Lower exposure';
        labelCandidates.push({
          id: parcel.id,
          at: atLL,
          color: fillColor,
          priority: lp,
          sub: isSelected ? `${exposureWord}${parcel.topRiskFactor ? ' · ' + parcel.topRiskFactor : ''}` : undefined,
          parcel
        });
      }
    });

    // ---- Screen-space layout: labels + side callouts with collision avoidance ----
    const overlay = L.layerGroup().addTo(map);
    const layout = () => {
      overlay.clearLayers();
      const size = map.getSize();
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const hit = (b: { x: number; y: number; w: number; h: number }) =>
        placed.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
      const inView = (b: { x: number; y: number; w: number; h: number }) => b.x >= 4 && b.y >= 4 && b.x + b.w <= size.x - 4 && b.y + b.h <= size.y - 4;
      const toLL = (x: number, y: number): LatLngT => { const ll = map.containerPointToLatLng([x, y]); return [ll.lat, ll.lng]; };
      const nearestOnBox = (pt: L.Point, b: { x: number; y: number; w: number; h: number }): [number, number] => [
        Math.min(Math.max(pt.x, b.x), b.x + b.w),
        Math.min(Math.max(pt.y, b.y), b.y + b.h)
      ];
      const leader = (from: L.Point, to: [number, number], color: string) =>
        overlay.addLayer(L.polyline([toLL(from.x, from.y), toLL(to[0], to[1])], { color, weight: 1.2, opacity: 0.95, interactive: false }));

      // Reserve every parcel anchor so no label sits on top of another parcel.
      const zoomedOut = map.getZoom() < 15;
      for (const r of ringCandidates) {
        const pt = map.latLngToContainerPoint(r.at);
        placed.push({ x: pt.x - 9, y: pt.y - 9, w: 18, h: 18 });
      }

      // Locator rings only when zoomed out far enough that a ~100 m parcel is a few pixels.
      if (zoomedOut) {
        for (const r of ringCandidates) {
          const ring = L.circleMarker(r.at, { radius: 6, color: '#FFFFFF', weight: 2, fillColor: r.color, fillOpacity: 0.95 });
          ring.on('click', () => setSelectedMapParcel(r.parcel));
          overlay.addLayer(ring);
        }
      }

      // Parcel labels (priority order); a label that cannot be placed without overlap is skipped.
      for (const lb of [...labelCandidates].sort((x, y) => x.priority - y.priority)) {
        const pt = map.latLngToContainerPoint(lb.at);
        const { w, h } = labelSize(lb.id, lb.sub);
        const box = placeLabel(pt, { w, h }, placed, { x: size.x, y: size.y });
        if (!box) continue;
        leader(pt, nearestOnBox(pt, box), '#FFFFFF');
        const html = `<div style="width:${w}px;box-sizing:border-box;background:#fff;color:#0f172a;border:1px solid #64748b;border-left:3px solid ${lb.color};padding:1px 5px;font:700 10px/1.3 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 2px rgba(0,0,0,.35);">${lb.id}${lb.sub ? `<div style="font-weight:500;font-size:9px;color:#475569;overflow:hidden;text-overflow:ellipsis">${lb.sub}</div>` : ''}</div>`;
        const m = L.marker(toLL(box.x, box.y), { icon: L.divIcon({ className: 'kshetra-map-label', html, iconSize: [0, 0] }), keyboard: false });
        m.on('click', () => setSelectedMapParcel(lb.parcel));
        overlay.addLayer(m);
      }

      // Corridor status callouts: beside the corridor, joined to the leg by a leader line.
      for (const c of calloutCandidates) {
        const pa = map.latLngToContainerPoint(c.a);
        const p0 = map.latLngToContainerPoint(c.b);
        const p1 = map.latLngToContainerPoint(c.c);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len; // unit normal to the leg
        const w = Math.max(96, 12 + c.text.length * 5.6), h = 30;
        let done = false;
        for (const dist of [64, 96, 128]) {
          for (const side of [1, -1]) {
            const cx = pa.x + nx * dist * side, cy = pa.y + ny * dist * side;
            const box = { x: cx - w / 2, y: cy - h / 2, w, h };
            if (!inView(box) || hit(box)) continue;
            placed.push(box);
            overlay.addLayer(L.circleMarker(c.a, { radius: 3.5, color: '#fff', weight: 1.5, fillColor: c.color, fillOpacity: 1, interactive: false }));
            leader(pa, nearestOnBox(pa, box), c.color);
            const html = `<div style="width:${w}px;box-sizing:border-box;background:rgba(255,255,255,.96);border:1px solid #64748b;border-left:3px solid ${c.color};padding:2px 6px;font:600 10px/1.25 system-ui,sans-serif;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,.35);white-space:nowrap;"><span style="color:${c.color};font-weight:800;letter-spacing:.04em">${c.word}</span><br/><span style="font-weight:500;color:#334155">${c.text}</span></div>`;
            overlay.addLayer(L.marker(toLL(box.x, box.y), { icon: L.divIcon({ className: 'kshetra-map-callout', html, iconSize: [0, 0] }), interactive: false, keyboard: false }));
            done = true;
            break;
          }
          if (done) break;
        }
      }
    };
    layout();
    map.on('zoomend moveend', layout);
    return () => {
      map.off('zoomend moveend', layout);
      overlay.remove();
    };

  }, [joinedParcels, mapFilter, mapSearch, selectedMapParcel, selectedRelation, showCorridorBuffer, project, routeEditState, showReadiness, readiness]);

  const handleResetZoom = () => {
    if (mapInstanceRef.current && project.corridorPath && project.corridorPath.length > 1) {
      const bounds = L.latLngBounds(project.corridorPath);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

    const handleFitParcels = () => {
    const map = mapInstanceRef.current;
    if (!map || joinedParcels.length === 0) return;
    const b = L.geoJSON(joinedParcels.map(jp => jp.feature) as never).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
  };

  const handleZoomToParcel = (p: Parcel) => {
    const jp = joinedParcels.find(x => x.geometry.parcel_id === p.id);
    const map = mapInstanceRef.current;
    if (!map) return;
    if (jp) {
      const b = L.geoJSON(jp.feature as never).getBounds();
      if (b.isValid()) { map.fitBounds(b, { padding: [80, 80], maxZoom: 17 }); return; }
    }
    map.setView(p.centerCoordinate, 16);
  };

  const handleSelectHighRisk = () => {
    const highRiskTarget = parcels.find(p => p.riskLevel === 'high') || parcels[0];
    if (highRiskTarget && mapInstanceRef.current) {
      setSelectedMapParcel(highRiskTarget);
      mapInstanceRef.current.setView(highRiskTarget.centerCoordinate, 15);
    }
  };

  // Approximate route length calculation for active draft
  const draftLengthKm = React.useMemo(() => {
    if (!routeEditState?.routeCoords || routeEditState.routeCoords.length < 2) return 0;
    let km = 0;
    const coords = routeEditState.routeCoords;
    for (let i = 0; i < coords.length - 1; i++) {
      const [lat1, lon1] = coords[i];
      const [lat2, lon2] = coords[i + 1];
      const dLat = (lat2 - lat1) * 111;
      const dLon = (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180);
      km += Math.sqrt(dLat * dLat + dLon * dLon);
    }
    return +km.toFixed(1);
  }, [routeEditState?.routeCoords]);

  const currentSelectionStep = routeEditState?.selectionStep || 'select-start';

  // Insert one extra waypoint midway between the last two alignment points.
  const handleAddWaypoint = () => {
    if (!routeEditState) return;
    const coords = [...routeEditState.routeCoords];
    if (coords.length < 2) return;
    const a = coords[coords.length - 2];
    const b = coords[coords.length - 1];
    const mid: [number, number] = [
      +((a[0] + b[0]) / 2).toFixed(6),
      +((a[1] + b[1]) / 2).toFixed(6)
    ];
    coords.splice(coords.length - 1, 0, mid);
    updateDraftRoute(coords);
  };

  // Regenerate the curved alignment from the current start/end points, discarding
  // manual waypoint edits (same interpolation used when the draft is created).
  const handleResetAlignment = () => {
    if (!routeEditState) return;
    const s = routeEditState.startCoords || routeEditState.routeCoords[0];
    const e =
      routeEditState.endCoords || routeEditState.routeCoords[routeEditState.routeCoords.length - 1];
    if (!s || !e) return;
    const regenerated: [number, number][] = [
      s,
      [+(s[0] + (e[0] - s[0]) * 0.25 + 0.008).toFixed(6), +(s[1] + (e[1] - s[1]) * 0.25 - 0.006).toFixed(6)],
      [+(s[0] + (e[0] - s[0]) * 0.5 - 0.005).toFixed(6), +(s[1] + (e[1] - s[1]) * 0.5 + 0.008).toFixed(6)],
      [+(s[0] + (e[0] - s[0]) * 0.75 + 0.006).toFixed(6), +(s[1] + (e[1] - s[1]) * 0.75 - 0.004).toFixed(6)],
      e
    ];
    updateDraftRoute(regenerated);
  };

  // Right-side coordinate panel: commit one point's edited lat/lng into the same
  // shared alignment state the map and Undo/Redo use (records one history entry).
  const handleCommitPoint = (index: number, coord: [number, number]) => {
    if (!routeEditState) return;
    const rc = routeEditState.routeCoords;
    if (index < 0 || index >= rc.length) return;
    updateDraftRoute(rc.map((c, i) => (i === index ? coord : c)));
  };

  // Remove an intermediate waypoint from the shared alignment (never Start / End).
  const handleRemovePoint = (index: number) => {
    if (!routeEditState) return;
    const rc = routeEditState.routeCoords;
    if (index <= 0 || index >= rc.length - 1 || rc.length <= 2) return;
    updateDraftRoute(rc.filter((_, i) => i !== index));
  };

  return (
    <div className="px-3 lg:px-4 py-3 space-y-2 max-w-[1600px] mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight">
              Interactive GIS Cadastral &amp; Corridor Map
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
              {project.code}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Displaying <strong className="text-slate-700 font-semibold">{project.name}</strong> &bull; {parcels.length} parcels loaded, {joinedParcels.length} with demo (synthetic) cadastral geometry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {parcels.some(p => p.riskLevel === 'high') && (
            <button
              onClick={handleSelectHighRisk}
              className="px-2.5 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold rounded-md flex items-center gap-1.5 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Focus High-Risk Parcel</span>
            </button>
          )}

          <button
            onClick={handleResetZoom}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1.5 transition-colors"
            title="Reset Map View to Corridor Bounds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
                        <span>Fit Project</span>
          </button>

          <button
            onClick={handleFitParcels}
            disabled={joinedParcels.length === 0}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={joinedParcels.length === 0 ? 'No parcel geometry to fit' : 'Fit map to all parcels with geometry'}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Fit Parcels</span>
          </button>
        </div>
      </div>

            {/* Active vs recommended route — separately labelled, never conflated */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
        <span className="text-slate-500">Active route on map:</span>
        <strong className="text-slate-900">{activeAlignment ? activeAlignment.name : 'Custom / manually edited route (not a listed alignment)'}</strong>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500">Model-compared recommendation:</span>
        <strong className="text-slate-900">
          {recommendedAlignment
            ? `${recommendedAlignment.name}${activeAlignment && activeAlignment.id === recommendedAlignment.id ? ' (active)' : ' (not active)'}`
            : 'None flagged'}
        </strong>
      </div>

      {/* Interactive Map-Driven Route Setup & Point Selection Banner */}
      {routeEditState?.active && (
        <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-navy-950 text-white rounded-2xl border border-blue-400/40 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
                {currentSelectionStep === 'select-start' ? (
                  <MapPin className="w-5 h-5 text-emerald-400 animate-bounce" />
                ) : currentSelectionStep === 'select-end' ? (
                  <Navigation className="w-5 h-5 text-red-400 animate-bounce" />
                ) : (
                  <Route className="w-5 h-5 text-blue-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    currentSelectionStep === 'select-start' ? 'bg-emerald-500 text-white' : currentSelectionStep === 'select-end' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                  }`}>
                    {currentSelectionStep === 'select-start' ? 'Step 1: Set Starting Point' : currentSelectionStep === 'select-end' ? 'Step 2: Set Ending Point' : 'Step 3: Edit Route Alignment'}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {routeEditState.draftProject.name || project.name}
                  </span>
                </div>

                <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Starting Point:{' '}
                    {routeEditState.startCoords ? (
                      <strong className="text-emerald-300 font-mono">
                        {routeEditState.startCoords[0].toFixed(6)}, {routeEditState.startCoords[1].toFixed(6)}
                      </strong>
                    ) : (
                      <span className="text-amber-300 italic font-semibold">Click on map to place</span>
                    )}
                  </span>

                  <span>&bull;</span>

                  <span>
                    Ending Point:{' '}
                    {routeEditState.endCoords ? (
                      <strong className="text-red-300 font-mono">
                        {routeEditState.endCoords[0].toFixed(6)}, {routeEditState.endCoords[1].toFixed(6)}
                      </strong>
                    ) : (
                      <span className="text-amber-300 italic font-semibold">Click on map to place</span>
                    )}
                  </span>

                  {currentSelectionStep === 'edit-route' && (
                    <>
                      <span>&bull;</span>
                      <span>Length: <strong className="text-emerald-300 font-semibold">{draftLengthKm} km</strong> ({routeEditState.routeCoords.length} Waypoints)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {currentSelectionStep === 'edit-route' && (
                <>
                  <button
                    type="button"
                    onClick={undoAlignment}
                    disabled={!canUndoAlignment}
                    title="Undo alignment change"
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 disabled:cursor-not-allowed text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    onClick={redoAlignment}
                    disabled={!canRedoAlignment}
                    title="Redo alignment change"
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 disabled:cursor-not-allowed text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>Redo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddWaypoint}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Waypoint</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAlignment}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Alignment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteEditStep('select-start')}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reselect Points</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={cancelRouteDraft}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>

              {currentSelectionStep === 'edit-route' && (
                <button
                  type="button"
                  id="btn-confirm-create-project"
                  onClick={commitRouteDraft}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 transition-all hover:shadow-emerald-500/25 ring-2 ring-emerald-400/40"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{routeEditState.isNew ? 'Create Project' : 'Save Route Changes'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-blue-200/90 bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-300 shrink-0" />
            <span>
              {currentSelectionStep === 'select-start' && (
                <><strong>Click on the map</strong> to select the route <strong>Starting Point</strong> location coordinates.</>
              )}
              {currentSelectionStep === 'select-end' && (
                <><strong>Click on the map</strong> to select the route <strong>Ending Point</strong> location coordinates.</>
              )}
              {currentSelectionStep === 'edit-route' && (
                <><strong>Route Generated!</strong> Click &amp; drag waypoint pins with your mouse to edit route curvature. Click anywhere on the map to insert extra waypoints.</>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Map Filter & Layer Bar */}
      <div className="py-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Survey No / Parcel / Problem on map..."
            value={mapSearch}
            onChange={(e) => setMapSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Risk Filter Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMapFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-semibold text-xs ${
              mapFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Parcels ({parcels.length})
          </button>
          <button
            onClick={() => setMapFilter('high')}
            className={`px-2.5 py-1 rounded-lg font-semibold text-xs flex items-center gap-1 ${
              mapFilter === 'high' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            High Risk (🔴)
          </button>
          <button
            onClick={() => setMapFilter('medium')}
            className={`px-2.5 py-1 rounded-lg font-semibold text-xs flex items-center gap-1 ${
              mapFilter === 'medium' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Medium (🟡)
          </button>
          <button
            onClick={() => setMapFilter('low')}
            className={`px-2.5 py-1 rounded-lg font-semibold text-xs flex items-center gap-1 ${
              mapFilter === 'low' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Low (🟢)
          </button>
        </div>

        {/* Basemap Switcher & Buffer Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
            <input 
              type="checkbox" 
              checked={showCorridorBuffer}
              onChange={(e) => setShowCorridorBuffer(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded"
            />
                        <span>Nominal 60 m ROW</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600" title={readiness.available ? undefined : readiness.reason}>
            <input
              type="checkbox"
              checked={showReadiness}
              disabled={!readiness.available}
              onChange={(e) => setShowReadiness(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded"
            />
            <span>Construction readiness</span>
          </label>

          <select
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as any)}
            className="py-1 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium"
          >
            <option value="standard">Map: Standard OSM</option>
            <option value="satellite">Map: Satellite Imagery</option>
            <option value="dark">Map: Dark Carto</option>
          </select>
        </div>
      </div>

      {/* Map Container & Sidebar Drawer */}
      <div className="relative rounded-md overflow-hidden border border-slate-300 bg-slate-100 h-[calc(100vh-190px)] min-h-[580px]">
        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

                {joinedParcels.length === 0 && (
          <div role="status" className="absolute top-4 left-1/2 -translate-x-1/2 z-10 max-w-sm px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/95 text-amber-900 text-xs text-center shadow-md">
            <strong className="block">No surveyed cadastral geometry available for this project.</strong>
            Parcel polygons, corridor impact and construction readiness cannot be shown. The route is drawn from the project alignment only.
          </div>
        )}

        {!selectedMapParcel && <ProjectAssessmentPanel project={project} parcels={parcels} readiness={readiness} geometryCount={joinedParcels.length} />}

        {/* Floating Legend - Anchored inside map container with collapse & scroll behavior */}
        <div className="absolute bottom-3 left-3 z-10 bg-white/93 text-slate-700 rounded-md border border-slate-300 shadow-sm text-xs w-52 max-h-[calc(100%-1.5rem)] flex flex-col overflow-hidden">
          <div 
            onClick={() => setLegendCollapsed(prev => !prev)}
            className="flex items-center justify-between gap-3 px-2.5 py-1.5 bg-slate-50/80 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
          >
            <div className="font-bold text-[11px] uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>GIS legend</span>
            </div>
            <button 
              type="button" 
              className="text-slate-400 hover:text-slate-700 text-[10px] font-semibold flex items-center gap-0.5"
            >
              {legendCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>

          {!legendCollapsed && (
            <div className="p-2.5 space-y-2 overflow-y-auto max-h-64 text-[11px]">
              <div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">Corridor</div>
                <div className="flex items-center gap-2 py-0.5"><span className="w-5 h-1.5 rounded-sm bg-slate-600 border border-slate-900 shrink-0"></span><span className="flex-1">Active alignment</span></div>
                {[
                  { c: 'bg-red-600', t: 'Blocked', km: readiness.blockedKm },
                  { c: 'bg-amber-500', t: 'At risk', km: readiness.partialKm },
                  { c: 'bg-green-600', t: 'Ready', km: readiness.readyKm }
                ].map(r => (
                  <div key={r.t} className="flex items-center gap-2 py-0.5">
                    <span className={`w-5 h-1.5 rounded-sm ${r.c} shrink-0`}></span>
                    <span className="flex-1">{r.t}</span>
                    {readiness.available && <span className="font-mono text-slate-600">{r.km} km</span>}
                  </div>
                ))}
                {!readiness.available && <div className="text-[10px] text-slate-500 leading-snug">Segments not computable: no matched parcel geometry.</div>}
              </div>
              <div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">Parcel exposure</div>
                <div className="flex items-center gap-2 py-0.5"><span className="w-3 h-3 rounded-sm bg-red-500/60 border-2 border-red-600 shrink-0"></span><span>High (&gt;{settings.riskThresholdMedMax}%)</span></div>
                <div className="flex items-center gap-2 py-0.5"><span className="w-3 h-3 rounded-sm bg-amber-500/60 border-2 border-amber-600 shrink-0"></span><span>Medium ({settings.riskThresholdLowMax + 1}–{settings.riskThresholdMedMax}%)</span></div>
                <div className="flex items-center gap-2 py-0.5"><span className="w-3 h-3 rounded-sm bg-green-500/60 border-2 border-green-600 shrink-0"></span><span>Low (&le;{settings.riskThresholdLowMax}%)</span></div>
                <div className="flex items-center gap-2 py-0.5"><span className="w-3 h-3 rounded-sm border-2 border-white bg-slate-500/50 shrink-0 ring-1 ring-slate-900"></span><span>Selected</span></div>
              </div>
              <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
                Demo: {joinedParcels.length} of {parcels.length} parcels have synthetic geometry; not real cadastral coverage. ROW = nominal {NOMINAL_ROW_WIDTH_METERS} m planning assumption; proximity buffer {PROXIMITY_BUFFER_METERS} m.
              </div>
            </div>
          )}
        </div>

        {/* Floating Parcel Inspection Drawer (if selected) */}
        {selectedMapParcel && (
          <div className="absolute top-4 right-4 z-10 bg-white/97 text-slate-700 backdrop-blur-md p-5 rounded-2xl border border-slate-200 shadow-xl w-80 space-y-3 animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] text-blue-600 font-mono font-bold uppercase tracking-wider">
                  Selected Cadastral Parcel
                </div>
                <h3 className="font-black text-base text-slate-900 mt-0.5">
                  {selectedMapParcel.id} <span className="text-slate-500 font-normal">({selectedMapParcel.surveyNumber})</span>
                </h3>
              </div>
              <button
                                onClick={() => setSelectedMapParcel(null)}
                aria-label="Close parcel panel"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Problem Identified:</span>
                <span className="font-bold text-slate-900 text-right truncate max-w-[150px]">
                  {selectedMapParcel.topRiskFactor || 'Title Issue'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delay Risk Score:</span>
                <span className={`font-black ${
                  selectedMapParcel.riskLevel === 'high' ? 'text-red-600' : selectedMapParcel.riskLevel === 'medium' ? 'text-amber-700' : 'text-emerald-600'
                }`}>
                  {selectedMapParcel.delayRiskScore}% ({selectedMapParcel.riskLevel.toUpperCase()})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Predicted Delay:</span>
                <span className="font-bold text-slate-900">{selectedMapParcel.predictedDelayRange}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Land Extent:</span>
                <span className="font-medium text-slate-900">{selectedMapParcel.areaAcres} Acres</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Owner:</span>
                <span className="font-medium text-slate-700 truncate max-w-[140px]">{selectedMapParcel.ownerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Owner Category:</span>
                <span className="font-medium text-slate-700">
                  {selectedMapParcel.coOwnerCount > 1
                    ? `Joint Ownership (${selectedMapParcel.coOwnerCount})`
                    : 'Individual Ownership'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="text-slate-600">{selectedMapParcel.village}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Litigation:</span>
                <span className={
                  selectedMapParcel.courtRecord?.interimInjunction
                    ? 'text-red-600 font-bold'
                    : selectedMapParcel.courtCase
                    ? 'text-amber-600 font-bold'
                    : 'text-emerald-600 font-bold'
                }>
                  {selectedMapParcel.courtRecord?.interimInjunction
                    ? `Stay order (${selectedMapParcel.courtRecord.caseNumber})`
                    : selectedMapParcel.courtCase
                    ? `${selectedMapParcel.courtCaseStatus}${selectedMapParcel.courtRecord ? ` (${selectedMapParcel.courtRecord.caseNumber})` : ''}`
                    : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Status:</span>
                <span className="font-medium text-slate-700">{selectedMapParcel.acquisitionStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Priority:</span>
                <span className={`font-bold ${
                  selectedMapParcel.priority === 'CRITICAL' || selectedMapParcel.priority === 'HIGH'
                    ? 'text-red-600'
                    : selectedMapParcel.priority === 'MEDIUM'
                    ? 'text-amber-700'
                    : 'text-emerald-600'
                }`}>
                  {selectedMapParcel.priority}
                </span>
              </div>
            </div>

            <MapParcelIntel parcel={selectedMapParcel} />

            {/* Risk, spatial relation and construction impact are three separate facts. */}
            {(() => {
              const t = describeConstructionImpact(selectedRelation, selectedMapParcel.riskLevel);
              const toneCls =
                t.tone === 'blocked' ? 'bg-red-50 border-red-200 text-red-800'
                : t.tone === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-800'
                : t.tone === 'ready' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : t.tone === 'proximity' ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700';
              const exposure = selectedMapParcel.riskLevel === 'high' ? 'High exposure' : selectedMapParcel.riskLevel === 'medium' ? 'Medium exposure' : 'Lower exposure';
              return (
                <div className="rounded-xl border border-slate-200 text-xs divide-y divide-slate-100">
                  <div className="p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Risk</div>
                    <div className="font-semibold text-slate-900">{exposure} · {selectedMapParcel.delayRiskScore}%</div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spatial relation</div>
                    <div className="font-semibold text-slate-900">{t.spatial}</div>
                  </div>
                  <div className={`p-2.5 rounded-b-xl border-t ${toneCls}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Construction impact</div>
                    <div className="font-black text-sm">{t.impact}</div>
                    {t.note && <div className="text-[10px] opacity-80 leading-snug mt-0.5">{t.note}</div>}
                  </div>
                </div>
              );
            })()}

            <div className="pt-2 border-t border-slate-200 space-y-2">
                            <button
                onClick={() => handleZoomToParcel(selectedMapParcel)}
                className="w-full py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Zoom to parcel</span>
              </button>
              <button
                onClick={() => openParcelDetail(selectedMapParcel.id)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open Full Parcel Dossier</span>
              </button>
            </div>
          </div>
        )}

        {/* Right-side coordinate editor — shown alongside the map during alignment editing */}
        {routeEditState?.active &&
          currentSelectionStep === 'edit-route' &&
          routeEditState.routeCoords.length >= 2 && (
            <AlignmentPointsPanel
              key={`align-panel-${routeEditState.routeCoords.length}`}
              coords={routeEditState.routeCoords}
              lengthKm={draftLengthKm}
              canUndo={canUndoAlignment}
              canRedo={canRedoAlignment}
              onCommitPoint={handleCommitPoint}
              onRemovePoint={handleRemovePoint}
              onAddWaypoint={handleAddWaypoint}
              onUndo={undoAlignment}
              onRedo={redoAlignment}
            />
          )}
      </div>
    </div>
  );
};
