import { Fragment, useEffect, useMemo, useState, useRef, type MutableRefObject } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L, { type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';
import type {
  PipelineCollection,
  PipelineProperties,
  KPFeature,
  MeteringStation,
  RiskLevel,
} from './types';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://pipe-ai-backend.onrender.com/api'
    : 'http://127.0.0.1:8000/api');

// High-visibility Risk Colors
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

// Route Themes
const ROUTE_THEMES: Record<number, { name: string; color: string; glow: string; code: string; diameter: string; pressure: string; steel: string }> = {
  1: { name: 'AKK Section 1 (Ajaokuta–Abaji)', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', code: 'AKK-S1', diameter: '40"', pressure: '1440 psig', steel: 'API 5L X80' },
  2: { name: 'Geregu Power Plant Feeder', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)', code: 'GPP-FDR', diameter: '24"', pressure: '1000 psig', steel: 'API 5L X65' },
  3: { name: 'Obajana Cement Industrial Gas Line', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)', code: 'OBJ-IND', diameter: '18"', pressure: '850 psig', steel: 'API 5L X52' },
  4: { name: 'Oben–Ajaokuta Trunk Line', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.45)', code: 'OBN-AJK', diameter: '24"', pressure: '1200 psig', steel: 'API 5L X65' },
};

// Tile Layers
const TILE_LAYERS = {
  satellite: {
    label: '🛰️ Vivid Satellite',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google / Maxar High-Res Satellite',
    maxZoom: 20,
  },
  esri: {
    label: '🏢 High-Res Infra',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  dark: {
    label: '🌑 Tactical Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
  terrain: {
    label: '🏔️ Topo Relief',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap | OpenTopoMap',
    maxZoom: 17,
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

// Key Industrial Landmarks
const LANDMARKS = [
  { id: 'L1', name: 'Ajaokuta Steel Complex & Gas Terminal', icon: '🏭', coords: [7.5564, 6.6552] as [number, number], type: 'Gas Terminal & Steel Plant', poly: [[7.542, 6.642], [7.542, 6.672], [7.572, 6.672], [7.572, 6.642]] as [number, number][], color: '#06b6d4', desc: 'Central gas injection terminal, blast furnace facilities, and thermal power plant.' },
  { id: 'L2', name: 'Geregu I & II Power Generating Station', icon: '⚡', coords: [7.4716, 6.6603] as [number, number], type: '884 MW Thermal Power Station', poly: [[7.462, 6.652], [7.462, 6.670], [7.481, 6.670], [7.481, 6.652]] as [number, number][], color: '#f59e0b', desc: 'Siemens gas turbines, 330kV transmission switchyard, and metering station.' },
  { id: 'L3', name: 'Obajana Cement Mega-Plant Complex', icon: '🏗️', coords: [7.9150, 6.4350] as [number, number], type: '13.25 MTPA Cement Works', poly: [[7.902, 6.422], [7.902, 6.452], [7.928, 6.452], [7.928, 6.422]] as [number, number][], color: '#ec4899', desc: '4 rotary kiln lines, clinker silos, 135 MW captive gas power plant.' },
  { id: 'L4', name: 'Lokoja River Port & Confluence Center', icon: '🚢', coords: [7.7300, 6.7400] as [number, number], type: 'Niger Confluence Port', poly: [[7.718, 6.728], [7.718, 6.752], [7.742, 6.752], [7.742, 6.728]] as [number, number][], color: '#3b82f6', desc: 'River Niger/Benue confluence navigation base and monitor station.' },
  { id: 'L5', name: 'Jamata HDD River Niger Crossing Rig', icon: '🌊', coords: [7.8500, 6.8900] as [number, number], type: 'Sub-River Directional Drilling Rig', poly: [[7.838, 6.880], [7.838, 6.902], [7.862, 6.902], [7.862, 6.880]] as [number, number][], color: '#06b6d4', desc: 'Horizontal Directional Drilling entry/exit pads and submerged concrete weighting mats.' },
];

// Physical Geo-Hazard Zones
const FLOOD_CORRIDOR: [number, number][] = [
  [7.52, 6.64], [7.57, 6.67], [7.62, 6.70], [7.71, 6.76], [7.82, 6.87],
  [7.90, 6.92], [7.92, 6.88], [7.80, 6.82], [7.68, 6.72], [7.59, 6.66], [7.50, 6.62],
];
const FAULT_TRACE: [number, number][] = [
  [7.35, 6.45], [7.58, 6.62], [7.78, 6.82], [8.05, 7.05], [8.25, 7.22],
];

// Custom Station Marker Icon
const stationIcon = (name: string, isMain: boolean) =>
  L.divIcon({
    className: 'custom-station-icon',
    html: `<div class="station-badge ${isMain ? 'main' : ''}"><span class="badge-icon">⚡</span><span class="badge-text">${name}</span></div>`,
    iconSize: [120, 32],
    iconAnchor: [60, 16],
  });

// Custom Landmark Marker Icon
const landmarkIcon = (icon: string, name: string, color: string) =>
  L.divIcon({
    className: 'custom-landmark-icon',
    html: `<div class="landmark-badge" style="border-color: ${color};"><span class="landmark-icon">${icon}</span><span class="landmark-text">${name}</span></div>`,
    iconSize: [140, 32],
    iconAnchor: [70, 16],
  });

function MapUpdater({
  center,
  zoom,
  mapRef,
}: {
  center: [number, number];
  zoom: number;
  mapRef: MutableRefObject<LeafletMap | null>;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    map.setView(center, zoom);
  }, [center, zoom, map, mapRef]);
  return null;
}

// =====================================================================
// MAIN APP COMPONENT
// =====================================================================
function App() {
  const [pipelines, setPipelines] = useState<PipelineCollection | null>(null);
  const [stations, setStations] = useState<MeteringStation[]>([]);
  const [kpFeatures, setKpFeatures] = useState<KPFeature[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedKP, setSelectedKP] = useState<KPFeature | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('satellite');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layer Visibility
  const [showFlood, setShowFlood] = useState(true);
  const [showFault, setShowFault] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);

  // Inspector Panel State (Open/Close)
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const mapRef = useRef<LeafletMap | null>(null);

  // Initial Data Fetch
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [pR, sR, kR] = await Promise.all([
          fetch(`${API_BASE}/pipelines`),
          fetch(`${API_BASE}/stations`),
          fetch(`${API_BASE}/kp-features`),
        ]);
        if (!pR.ok || !sR.ok || !kR.ok) throw new Error('Failed to load API data');
        const pipelinesData: PipelineCollection = await pR.json();
        const stationsData: MeteringStation[] = await sR.json();
        const kpData: KPFeature[] = await kR.json();

        setPipelines(pipelinesData);
        setStations(stationsData);
        setKpFeatures(kpData);

        // Select the highest risk KP initially
        const criticalKP = kpData.find((k) => k.risk_class === 'Critical') || kpData[0];
        if (criticalKP) setSelectedKP(criticalKP);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Map Center
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(11);

  // Filtered KPs
  const filteredKPs = useMemo(() => {
    return kpFeatures.filter((kp) => {
      if (selectedPipelineId !== null && kp.pipeline_id !== selectedPipelineId) return false;
      if (riskFilter !== 'all' && kp.risk_class.toLowerCase() !== riskFilter.toLowerCase()) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesKP = `kp ${kp.kp}`.includes(q) || `${kp.kp}` === q;
        const matchesHazard = kp.primary_hazard.toLowerCase().includes(q);
        const matchesCode = kp.pipeline_code.toLowerCase().includes(q);
        if (!matchesKP && !matchesHazard && !matchesCode) return false;
      }
      return true;
    });
  }, [kpFeatures, selectedPipelineId, riskFilter, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const c = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let totalPoF = 0;
    for (const kp of filteredKPs) {
      c[kp.risk_class] = (c[kp.risk_class] || 0) + 1;
      totalPoF += kp.failure_probability;
    }
    const total = filteredKPs.length;
    const avgPoF = total > 0 ? (totalPoF / total) * 100 : 0;
    return { ...c, total, avgPoF };
  }, [filteredKPs]);

  // Critical Alerts List (Top 6 most vulnerable KPs)
  const criticalHotspots = useMemo(() => {
    return [...kpFeatures]
      .filter((k) => k.risk_class === 'Critical' || k.risk_class === 'High')
      .sort((a, b) => b.failure_probability - a.failure_probability)
      .slice(0, 8);
  }, [kpFeatures]);

  // Selection Handlers
  const handleSelectKP = (kp: KPFeature) => {
    setSelectedKP(kp);
    setIsInspectorOpen(true);
    setMapCenter([kp.latitude, kp.longitude]);
    setMapZoom(14);
  };

  const handleNextKP = () => {
    if (!selectedKP) return;
    const currIdx = filteredKPs.findIndex((k) => k.kp === selectedKP.kp && k.pipeline_id === selectedKP.pipeline_id);
    if (currIdx >= 0 && currIdx < filteredKPs.length - 1) {
      handleSelectKP(filteredKPs[currIdx + 1]);
    }
  };

  const handlePrevKP = () => {
    if (!selectedKP) return;
    const currIdx = filteredKPs.findIndex((k) => k.kp === selectedKP.kp && k.pipeline_id === selectedKP.pipeline_id);
    if (currIdx > 0) {
      handleSelectKP(filteredKPs[currIdx - 1]);
    }
  };

  const handleLandmarkClick = (lm: typeof LANDMARKS[0]) => {
    setMapCenter(lm.coords);
    setMapZoom(15);
  };

  const handleResetMap = () => {
    setMapCenter([7.62, 6.70]);
    setMapZoom(11);
    setSelectedPipelineId(null);
    setRiskFilter('all');
    setSearchQuery('');
  };

  const currentTile = TILE_LAYERS[activeLayer];

  return (
    <div className="dashboard-container">
      {/* =========================================================
          1. TOP EXECUTIVE COMMAND BAR (Clean, accessible, 1-click)
          ========================================================= */}
      <header className="top-command-bar">
        {/* Brand & Status */}
        <div className="brand-group">
          <div className="brand-badge">
            <span className="flame-icon">🔥</span>
            <div className="brand-titles">
              <h2>Pipe.AI</h2>
              <span className="brand-tag">KOGI PIPELINE INTEGRITY TWIN</span>
            </div>
          </div>
          <div className="live-status-pill">
            <span className="pulse-dot"></span>
            LIVE ML RISK ENGINE
          </div>
        </div>

        {/* Route Selector Pills */}
        <div className="route-pills-bar">
          <button
            className={`route-pill ${selectedPipelineId === null ? 'active' : ''}`}
            onClick={() => setSelectedPipelineId(null)}
          >
            🌐 All 4 Corridors ({kpFeatures.length} KPs)
          </button>
          {pipelines?.features.map((p) => {
            const pid = p.properties.pipeline_id;
            const theme = ROUTE_THEMES[pid];
            const isSel = selectedPipelineId === pid;
            return (
              <button
                key={pid}
                className={`route-pill ${isSel ? 'active' : ''}`}
                style={isSel ? { borderColor: theme.color, boxShadow: `0 0 12px ${theme.glow}` } : {}}
                onClick={() => setSelectedPipelineId(pid)}
              >
                <span className="color-indicator" style={{ background: theme.color }} />
                {theme.code} — {theme.name.split('(')[0].trim()}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="header-actions">
          <div className="quick-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search KP (e.g. KP 24, River Niger, Jamata)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          {/* Basemap Switcher */}
          <div className="basemap-group">
            {(Object.keys(TILE_LAYERS) as LayerKey[]).map((key) => (
              <button
                key={key}
                className={`basemap-btn ${activeLayer === key ? 'active' : ''}`}
                onClick={() => setActiveLayer(key)}
              >
                {TILE_LAYERS[key].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* =========================================================
          2. MAIN WORKSPACE: FULL-BLEED MAP & FLOATING PANELS
          ========================================================= */}
      <div className="map-workspace">
        {/* Loading Overlay */}
        {loading && (
          <div className="workspace-loading">
            <div className="spinner" />
            <span>Loading Quantitative Geo-Hazard & Degradation Model…</span>
          </div>
        )}

        {/* Global Error Banner */}
        {error && <div className="floating-error-banner">{error}</div>}

        {/* Floating Left: Quick Stats & Filter Card */}
        <div className="floating-stats-panel">
          <div className="stats-card-header">
            <span className="stats-card-title">CORRIDOR RISK OVERVIEW</span>
            <button className="reset-btn" onClick={handleResetMap} title="Reset view and filters">
              ↺ Reset
            </button>
          </div>

          <div className="stats-count-grid">
            <button
              className={`stat-box critical ${riskFilter === 'critical' ? 'selected' : ''}`}
              onClick={() => setRiskFilter(riskFilter === 'critical' ? 'all' : 'critical')}
            >
              <span className="stat-count">{stats.Critical}</span>
              <span className="stat-name">🚨 Critical KPs</span>
            </button>
            <button
              className={`stat-box high ${riskFilter === 'high' ? 'selected' : ''}`}
              onClick={() => setRiskFilter(riskFilter === 'high' ? 'all' : 'high')}
            >
              <span className="stat-count">{stats.High}</span>
              <span className="stat-name">⚠️ High Risk</span>
            </button>
            <button
              className={`stat-box medium ${riskFilter === 'medium' ? 'selected' : ''}`}
              onClick={() => setRiskFilter(riskFilter === 'medium' ? 'all' : 'medium')}
            >
              <span className="stat-count">{stats.Medium}</span>
              <span className="stat-name">Medium</span>
            </button>
            <button
              className={`stat-box low ${riskFilter === 'low' ? 'selected' : ''}`}
              onClick={() => setRiskFilter(riskFilter === 'low' ? 'all' : 'low')}
            >
              <span className="stat-count">{stats.Low}</span>
              <span className="stat-name">🟢 Safe</span>
            </button>
          </div>

          {/* Quick Landmark Jump Chips */}
          <div className="landmarks-quick-list">
            <span className="quick-title">⚡ Key Strategic Hubs</span>
            <div className="landmark-pills">
              {LANDMARKS.map((lm) => (
                <button
                  key={lm.id}
                  className="landmark-chip"
                  onClick={() => handleLandmarkClick(lm)}
                >
                  {lm.icon} {lm.name.split(' ')[0]} {lm.name.split(' ')[1]}
                </button>
              ))}
            </div>
          </div>

          {/* Geo-Hazard Layer Checkboxes */}
          <div className="layer-toggles-bar">
            <label className="toggle-label">
              <input type="checkbox" checked={showFlood} onChange={(e) => setShowFlood(e.target.checked)} />
              🌊 River Scour Zone
            </label>
            <label className="toggle-label">
              <input type="checkbox" checked={showFault} onChange={(e) => setShowFault(e.target.checked)} />
              🌋 Seismic Fault
            </label>
            <label className="toggle-label">
              <input type="checkbox" checked={showLandmarks} onChange={(e) => setShowLandmarks(e.target.checked)} />
              🏢 Plants
            </label>
          </div>
        </div>

        {/* =========================================================
            MAP CONTAINER (Fast, accessible, 100% natural interaction)
            ========================================================= */}
        <div className="leaflet-map-wrapper">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            maxZoom={20}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
            className="full-bleed-map"
          >
            <MapUpdater center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
            <TileLayer
              key={activeLayer}
              attribution={currentTile.attribution}
              url={currentTile.url}
              maxZoom={currentTile.maxZoom}
            />

            {/* 🌊 River Niger Flood Scour Corridor */}
            {showFlood && (
              <Polygon
                positions={FLOOD_CORRIDOR}
                pathOptions={{
                  color: '#06b6d4',
                  fillColor: '#0891b2',
                  fillOpacity: 0.22,
                  weight: 2,
                  dashArray: '6, 8',
                }}
              >
                <Tooltip sticky>
                  🌊 <strong>River Niger Hydrodynamic Scour Zone</strong><br />
                  High hydrodynamic drag and pipe un-seating risk
                </Tooltip>
              </Polygon>
            )}

            {/* 🌋 Active Seismic Fault Trace */}
            {showFault && (
              <Polyline
                positions={FAULT_TRACE}
                pathOptions={{
                  color: '#ef4444',
                  weight: 4,
                  dashArray: '12, 8',
                }}
              >
                <Tooltip sticky>
                  🌋 <strong>Lokoja–Koton Karfe Fault Fracture</strong><br />
                  Active lateral tectonic shear line
                </Tooltip>
              </Polyline>
            )}

            {/* 🏢 Industrial Plant Building Footprints */}
            {showLandmarks &&
              LANDMARKS.map((lm) => (
                <Fragment key={lm.id}>
                  <Polygon
                    positions={lm.poly}
                    pathOptions={{
                      color: lm.color,
                      fillColor: lm.color,
                      fillOpacity: 0.25,
                      weight: 2,
                      dashArray: '4, 6',
                    }}
                    eventHandlers={{ click: () => handleLandmarkClick(lm) }}
                  >
                    <Tooltip sticky>
                      <strong>{lm.icon} {lm.name}</strong><br />
                      {lm.type}
                    </Tooltip>
                  </Polygon>
                  <Marker
                    position={lm.coords}
                    icon={landmarkIcon(lm.icon, lm.name.split(' ').slice(0, 2).join(' '), lm.color)}
                    eventHandlers={{ click: () => handleLandmarkClick(lm) }}
                  >
                    <Popup className="station-popup">
                      <div className="popup-body">
                        <h3>{lm.icon} {lm.name}</h3>
                        <p><strong>Type:</strong> {lm.type}</p>
                        <p>{lm.desc}</p>
                      </div>
                    </Popup>
                  </Marker>
                </Fragment>
              ))}

            {/* ⚡ Metering Stations */}
            {stations.map((st) => (
              <Marker
                key={st.id}
                position={[st.coordinates[1], st.coordinates[0]]}
                icon={stationIcon(st.name.replace('Metering Station', '').trim(), st.id === 'ST-01')}
                eventHandlers={{
                  click: () => {
                    setMapCenter([st.coordinates[1], st.coordinates[0]]);
                    setMapZoom(14);
                  },
                }}
              >
                <Popup className="station-popup">
                  <div className="popup-body">
                    <h3>⚡ {st.name}</h3>
                    <p><strong>Type:</strong> {st.type}</p>
                    <p><strong>Capacity:</strong> {st.capacity_mmscfd} MMSCFD</p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* ── BOLD, LUMINOUS PIPELINE TRAJECTORIES ── */}
            {pipelines?.features.map((f: any, idx: number) => {
              const coords = f.geometry.coordinates as [number, number][];
              const props = f.properties as PipelineProperties;
              const pid = props.pipeline_id;
              const isSelected = selectedPipelineId === pid;
              const theme = ROUTE_THEMES[pid] || ROUTE_THEMES[1];
              const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

              return (
                <Fragment key={`pl-${idx}`}>
                  {/* High-visibility outer glow */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : theme.color,
                      weight: isSelected ? 18 : 12,
                      opacity: isSelected ? 0.45 : 0.25,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />

                  {/* Main High-Contrast Pipeline Line */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: theme.color,
                      weight: isSelected ? 8 : 5,
                      opacity: 1.0,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelectedPipelineId(pid);
                      },
                    }}
                  >
                    <Tooltip sticky>
                      <strong>{theme.name}</strong><br />
                      Diameter: {theme.diameter} | Steel: {theme.steel} | Pressure: {theme.pressure}<br />
                      Click to isolate corridor
                    </Tooltip>
                  </Polyline>
                </Fragment>
              );
            })}

            {/* ── INTERACTIVE KP MARKERS ── */}
            {filteredKPs.map((kp) => {
              const isSelected = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              const color = RISK_COLORS[kp.risk_class];
              const radius = isSelected ? 10 : kp.risk_class === 'Critical' ? 7 : kp.risk_class === 'High' ? 6 : 4.5;

              return (
                <CircleMarker
                  key={`kp-${kp.pipeline_id}-${kp.kp}`}
                  center={[kp.latitude, kp.longitude]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: isSelected ? 1.0 : 0.9,
                    color: isSelected ? '#ffffff' : '#0f172a',
                    weight: isSelected ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => handleSelectKP(kp),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <strong>{kp.pipeline_code} — KP {kp.kp} km</strong><br />
                    Risk: <span style={{ color }}>{kp.risk_class} ({kp.failure_probability_percent}%)</span><br />
                    Cause: {kp.primary_hazard}
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* =========================================================
            3. FLOATING RIGHT: KP DEEP INSPECTION CARD (Sleek Drawer)
            ========================================================= */}
        {selectedKP && isInspectorOpen && (
          <aside className="floating-inspector-drawer">
            {/* Header */}
            <div className="inspector-header">
              <div className="header-left">
                <span className="kp-large-badge">KP {selectedKP.kp} km</span>
                <span className="route-sub-code">{selectedKP.pipeline_code}</span>
              </div>
              <div className="header-right">
                <span className={`risk-badge-large ${selectedKP.risk_class.toLowerCase()}`}>
                  {selectedKP.risk_class} Risk
                </span>
                <button
                  className="close-drawer-btn"
                  onClick={() => setIsInspectorOpen(false)}
                  title="Minimize Inspector"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stepping Navigation Bar (Prev / Next KP) */}
            <div className="kp-stepper-bar">
              <button className="stepper-btn" onClick={handlePrevKP}>
                ◀ Previous KP
              </button>
              <span className="stepper-current">
                KP {selectedKP.kp} / 373 km
              </span>
              <button className="stepper-btn" onClick={handleNextKP}>
                Next KP ▶
              </button>
            </div>

            <div className="inspector-scrollable">
              {/* Primary PoF Hero Box */}
              <div className="pof-hero-card">
                <div className="pof-metric-row">
                  <div className="pof-metric">
                    <span className="metric-label">Probability of Failure (PoF)</span>
                    <span className="metric-value" style={{ color: RISK_COLORS[selectedKP.risk_class] }}>
                      {selectedKP.failure_probability_percent}%
                    </span>
                  </div>
                  <div className="pof-category-pill">
                    {selectedKP.risk_class.toUpperCase()} THREAT
                  </div>
                </div>
                <div className="pof-progress-track">
                  <div
                    className={`pof-progress-fill ${selectedKP.risk_class.toLowerCase()}`}
                    style={{ width: `${selectedKP.failure_probability_percent}%` }}
                  />
                </div>
              </div>

              {/* Primary Hazard Diagnosis Card */}
              <div className="diagnosis-card">
                <div className="diagnosis-title">
                  <span className="danger-icon">⚠️</span>
                  <h4>{selectedKP.primary_hazard}</h4>
                </div>
                <p className="diagnosis-body">{selectedKP.diagnostic_message}</p>
              </div>

              {/* Wall Thickness & Thinning Degradation */}
              {selectedKP.remaining_wall_thickness_mm !== undefined && (
                <div className="degradation-card">
                  <div className="card-sub-header">
                    <span>🛡️ Steel Wall Thickness & Corrosion</span>
                    <span className={`condition-tag ${(selectedKP.degradation_condition || 'Normal').toLowerCase()}`}>
                      {selectedKP.degradation_condition || 'Normal'}
                    </span>
                  </div>
                  <div className="wall-metrics-row">
                    <div className="wall-metric">
                      <span className="wm-label">Remaining Wall</span>
                      <span className="wm-value">{selectedKP.remaining_wall_thickness_mm} mm</span>
                      <span className="wm-sub">of {selectedKP.design_wall_thickness_mm} mm design</span>
                    </div>
                    <div className="wall-metric">
                      <span className="wm-label">Wall Thinning Loss</span>
                      <span className="wm-value loss">-{selectedKP.thickness_loss_mm} mm</span>
                      <span className="wm-sub">({selectedKP.material_loss_percent}% loss)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 6 Quantitative Determinant Factors */}
              <div className="determinants-card">
                <div className="card-sub-header">
                  <span>📊 6 Quantitative Determinant Scores</span>
                  <span className="score-desc">0.0 (Safe) → 1.0 (Critical)</span>
                </div>
                <div className="det-bars-list">
                  {[
                    { label: '🌊 Flood & Scour Index', val: selectedKP.flooding_index, color: '#06b6d4' },
                    { label: '🌋 Seismic Shearing Factor', val: selectedKP.earthquake_factor, color: '#ef4444' },
                    { label: '🌧️ Rainfall Runoff Erosion', val: selectedKP.erosion_factor, color: '#3b82f6' },
                    { label: '🏔️ Landslide Slope Risk', val: selectedKP.landslide_index, color: '#f59e0b' },
                    { label: '🧪 Soil & Water Corrosivity', val: selectedKP.soil_corrosivity_index, color: '#a855f7' },
                    { label: '⚙️ Operational Hoop Stress', val: selectedKP.hoop_stress_ratio, color: '#eab308' },
                  ].map((det) => (
                    <div className="det-bar-row" key={det.label}>
                      <div className="det-row-header">
                        <span className="det-label">{det.label}</span>
                        <span className="det-number">{(det.val ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="det-track">
                        <div
                          className="det-fill"
                          style={{ width: `${(det.val ?? 0) * 100}%`, background: det.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Physical Ground Parameters Grid */}
              <div className="ground-params-grid">
                <div className="gp-item">
                  <span className="gp-label">Elevation</span>
                  <span className="gp-val">{selectedKP.elevation} m</span>
                </div>
                <div className="gp-item">
                  <span className="gp-label">Terrain Slope</span>
                  <span className="gp-val">{selectedKP.slope_deg}°</span>
                </div>
                <div className="gp-item">
                  <span className="gp-label">River Proximity</span>
                  <span className="gp-val">{selectedKP.river_proximity_km} km</span>
                </div>
                <div className="gp-item">
                  <span className="gp-label">Fault Distance</span>
                  <span className="gp-val">{selectedKP.fault_distance_km} km</span>
                </div>
                <div className="gp-item">
                  <span className="gp-label">Soil Lithology</span>
                  <span className="gp-val">{selectedKP.soil_type}</span>
                </div>
                <div className="gp-item">
                  <span className="gp-label">Pipe Spec</span>
                  <span className="gp-val">{selectedKP.pipe_diameter_inches}" {selectedKP.pipe_material}</span>
                </div>
              </div>

              {/* Actionable Engineering Remediation Plan */}
              <div className="remediation-card">
                <div className="remediation-title">
                  <span>🔧 Actionable Engineering Remediation Directive</span>
                </div>
                <p className="remediation-body">{selectedKP.remediation_plan}</p>
              </div>
            </div>
          </aside>
        )}

        {/* If drawer is closed, show a floating button to reopen */}
        {selectedKP && !isInspectorOpen && (
          <button className="reopen-inspector-btn" onClick={() => setIsInspectorOpen(true)}>
            📊 Inspect KP {selectedKP.kp} km ({selectedKP.risk_class})
          </button>
        )}

        {/* =========================================================
            4. FLOATING BOTTOM: CRITICAL ALERTS TICKER BAR
            ========================================================= */}
        <div className="floating-bottom-alerts">
          <div className="alerts-title">
            <span className="blink-icon">🚨</span>
            CRITICAL HOTSPOTS:
          </div>
          <div className="alerts-chips-scroll">
            {criticalHotspots.map((kp) => (
              <button
                key={`${kp.pipeline_id}-${kp.kp}`}
                className={`alert-chip ${selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id ? 'active' : ''}`}
                onClick={() => handleSelectKP(kp)}
              >
                <strong>{kp.pipeline_code} KP {kp.kp} km</strong>
                <span className="chip-pof">{kp.failure_probability_percent}% PoF</span>
                <span className="chip-cause">({kp.primary_hazard.split(' ')[0]})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
