import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
  Redo2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Parcel } from '../../types';
import { AlignmentPointsPanel } from './AlignmentPointsPanel';

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
    canRedoAlignment
  } = useApp();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const corridorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeEditLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedMapParcel, setSelectedMapParcel] = useState<Parcel | null>(null);
  const [mapFilter, setMapFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [mapSearch, setMapSearch] = useState<string>('');
  const [basemap, setBasemap] = useState<'standard' | 'satellite' | 'dark'>('standard');
  const [showCorridorBuffer, setShowCorridorBuffer] = useState<boolean>(true);

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
  }, [basemap]);

  // Fit map bounds when project changes or when draft route is initiated
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeEditState?.active && routeEditState.routeCoords && routeEditState.routeCoords.length > 1) {
      const bounds = L.latLngBounds(routeEditState.routeCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
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

    // 1. Draw Corridor Route
    if (project.corridorPath && project.corridorPath.length > 1) {
      const corridorLine = L.polyline(project.corridorPath, {
        color: '#2563EB',
        weight: 5,
        opacity: 0.85,
        dashArray: '8, 6'
      });
      corridorLine.bindTooltip(`${project.name} (${project.code}) Centerline`, { sticky: true });
      corridorGroup.addLayer(corridorLine);

      // Draw Corridor 60m RoW buffer outline if enabled
      if (showCorridorBuffer) {
        const corridorBuffer = L.polyline(project.corridorPath, {
          color: '#3B82F6',
          weight: 22,
          opacity: 0.18
        });
        corridorGroup.addLayer(corridorBuffer);
      }
    }

    // 2. Draw Parcel Polygons for the selected project
    const visibleParcels = parcels.filter(p => {
      if (mapFilter !== 'all' && p.riskLevel !== mapFilter) return false;
      if (mapSearch.trim()) {
        const q = mapSearch.toLowerCase().trim();
        return (
          p.id.toLowerCase().includes(q) ||
          p.surveyNumber.toLowerCase().includes(q) ||
          p.ownerName.toLowerCase().includes(q) ||
          p.village.toLowerCase().includes(q) ||
          (p.topRiskFactor && p.topRiskFactor.toLowerCase().includes(q))
        );
      }
      return true;
    });

    visibleParcels.forEach(parcel => {
      const isHigh = parcel.riskLevel === 'high';
      const isMed = parcel.riskLevel === 'medium';
      
      const fillColor = isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#10B981';
      const strokeColor = isHigh ? '#B91C1C' : isMed ? '#B45309' : '#047857';

      const polygon = L.polygon(parcel.mapCoordinates, {
        color: strokeColor,
        weight: parcel.id === selectedMapParcel?.id ? 4 : 2,
        fillColor: fillColor,
        fillOpacity: parcel.id === selectedMapParcel?.id ? 0.75 : 0.45
      });

      // Tooltip with problem intelligence
      polygon.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
          <strong>${parcel.id} (${parcel.surveyNumber})</strong><br/>
          Problem: <strong style="color: ${fillColor};">${parcel.topRiskFactor || 'Title Verification'}</strong><br/>
          Risk: <span style="color: ${fillColor}; font-weight: bold;">${parcel.delayRiskScore}% (${parcel.riskLevel.toUpperCase()})</span><br/>
          Owner: ${parcel.ownerName}<br/>
          Predicted Delay: ${parcel.predictedDelayRange}
        </div>
      `, { sticky: true });

      // Click Event
      polygon.on('click', () => {
        setSelectedMapParcel(parcel);
      });

      polygonsGroup.addLayer(polygon);

      // Center marker
      const markerHtml = `
        <div style="
          background: ${fillColor};
          color: #ffffff;
          font-weight: 800;
          font-size: 9px;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1.5px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          white-space: nowrap;
          text-align: center;
        ">
          ${parcel.surveyNumber}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-parcel-marker',
        html: markerHtml,
        iconSize: [40, 18],
        iconAnchor: [20, 9]
      });

      const marker = L.marker(parcel.centerCoordinate, { icon: customIcon });
      marker.on('click', () => {
        setSelectedMapParcel(parcel);
      });

      polygonsGroup.addLayer(marker);
    });

  }, [parcels, mapFilter, mapSearch, selectedMapParcel, showCorridorBuffer, project, routeEditState]);

  const handleResetZoom = () => {
    if (mapInstanceRef.current && project.corridorPath && project.corridorPath.length > 1) {
      const bounds = L.latLngBounds(project.corridorPath);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
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
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Interactive GIS Cadastral &amp; Corridor Map
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 font-mono">
              {project.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Displaying <strong className="text-slate-700 font-semibold">{project.name}</strong> &bull; {parcels.length} parcels loaded with DGPS and AI risk layers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {parcels.some(p => p.riskLevel === 'high') && (
            <button
              onClick={handleSelectHighRisk}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Focus High-Risk Parcel</span>
            </button>
          )}

          <button
            onClick={handleResetZoom}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Reset Map View to Corridor Bounds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Fit Corridor</span>
          </button>
        </div>
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
      <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
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
            <span>60m RoW Buffer</span>
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
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-slate-100 h-[620px]">
        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Legend */}
        <div className="absolute bottom-6 left-6 z-10 bg-white/95 text-slate-700 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-lg text-xs space-y-2 max-w-xs">
          <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">GIS Risk Legend</div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-red-500 border border-red-300"></span>
              <span>High Delay Risk (🔴 &gt;70% - Civil Stay / Disputed)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-500 border border-amber-300"></span>
              <span>Medium Delay Risk (🟡 40–70% - Mutation / Valuation)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-300"></span>
              <span>Low Delay Risk (🟢 &lt;40% - Clear Title)</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
              <span className="w-4 h-0.5 bg-blue-500 border-b border-dashed border-blue-300"></span>
              <span>Corridor Route Centerline ({project.code})</span>
            </div>
          </div>
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
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2">
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
