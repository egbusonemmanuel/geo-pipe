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

// Risk color system
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#10b981',      // Green - Safe
  Medium: '#f59e0b',   // Yellow - Moderate
  High: '#f97316',     // Orange - High Risk
  Critical: '#ef4444', // Red - Urgent Action
};

// Route details
const ROUTE_INFO: Record<number, { name: string; shortName: string; color: string; code: string; diameter: string; steel: string; pressure: string }> = {
  1: {
    name: 'Ajaokuta–Kaduna–Kano (AKK) Section 1',
    shortName: 'AKK Trunkline',
    color: '#f59e0b',
    code: 'AKK-S1',
    diameter: '40"',
    steel: 'API 5L X80',
    pressure: '1440 psig',
  },
  2: {
    name: 'Geregu Power Plant Supply Feeder',
    shortName: 'Geregu Feeder',
    color: '#06b6d4',
    code: 'GPP-FDR',
    diameter: '24"',
    steel: 'API 5L X65',
    pressure: '1000 psig',
  },
  3: {
    name: 'Obajana Cement Industrial Gas Line',
    shortName: 'Obajana Line',
    color: '#ec4899',
    code: 'OBJ-IND',
    diameter: '18"',
    steel: 'API 5L X52',
    pressure: '850 psig',
  },
  4: {
    name: 'Oben–Ajaokuta Western Trunkline',
    shortName: 'Oben–Ajaokuta',
    color: '#8b5cf6',
    code: 'OBN-AJK',
    diameter: '24"',
    steel: 'API 5L X65',
    pressure: '1200 psig',
  },
};

// Map Tile Layers
const MAP_LAYERS = {
  satellite: {
    label: '🛰️ Satellite',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google / Maxar Satellite',
    maxZoom: 20,
  },
  streets: {
    label: '🏢 Buildings & Infra',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
  dark: {
    label: '🌑 Dark Tactical',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
  topo: {
    label: '🏔️ Topo Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap | OpenTopoMap',
    maxZoom: 17,
  },
};

type LayerKey = keyof typeof MAP_LAYERS;

// Key industrial landmarks
const KEY_LANDMARKS = [
  {
    id: 'L1',
    name: 'Ajaokuta Steel Plant & Central Gas Hub',
    shortName: 'Ajaokuta Steel Hub',
    icon: '🏭',
    coords: [7.5564, 6.6552] as [number, number],
    type: 'Central Injection Terminal',
    poly: [[7.542, 6.642], [7.542, 6.672], [7.572, 6.672], [7.572, 6.642]] as [number, number][],
    color: '#06b6d4',
  },
  {
    id: 'L2',
    name: 'Geregu I & II Power Generating Station',
    shortName: 'Geregu Power Plant',
    icon: '⚡',
    coords: [7.4716, 6.6603] as [number, number],
    type: '884 MW Thermal Power Plant',
    poly: [[7.462, 6.652], [7.462, 6.670], [7.481, 6.670], [7.481, 6.652]] as [number, number][],
    color: '#f59e0b',
  },
  {
    id: 'L3',
    name: 'Obajana Cement Mega-Plant Complex',
    shortName: 'Obajana Cement Plant',
    icon: '🏗️',
    coords: [7.9150, 6.4350] as [number, number],
    type: '13.25 MTPA Cement Works',
    poly: [[7.902, 6.422], [7.902, 6.452], [7.928, 6.452], [7.928, 6.422]] as [number, number][],
    color: '#ec4899',
  },
  {
    id: 'L4',
    name: 'Jamata River Niger Crossing Rig',
    shortName: 'Jamata River Crossing',
    icon: '🌊',
    coords: [7.8500, 6.8900] as [number, number],
    type: 'Sub-River Directional Drilling Rig',
    poly: [[7.838, 6.880], [7.838, 6.902], [7.862, 6.902], [7.862, 6.880]] as [number, number][],
    color: '#3b82f6',
  },
  {
    id: 'L5',
    name: 'Lokoja River Confluence Port',
    shortName: 'Lokoja Port',
    icon: '🚢',
    coords: [7.7300, 6.7400] as [number, number],
    type: 'Confluence Navigation Base',
    poly: [[7.718, 6.728], [7.718, 6.752], [7.742, 6.752], [7.742, 6.728]] as [number, number][],
    color: '#10b981',
  },
];

// Physical hazard zones
const FLOOD_CORRIDOR: [number, number][] = [
  [7.52, 6.64], [7.57, 6.67], [7.62, 6.70], [7.71, 6.76], [7.82, 6.87],
  [7.90, 6.92], [7.92, 6.88], [7.80, 6.82], [7.68, 6.72], [7.59, 6.66], [7.50, 6.62],
];
const FAULT_TRACE: [number, number][] = [
  [7.35, 6.45], [7.58, 6.62], [7.78, 6.82], [8.05, 7.05], [8.25, 7.22],
];

// Map Viewport Controller (Native Leaflet, 0 CSS transforms)
function MapViewController({
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
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map, mapRef]);
  return null;
}

// Marker Icon Generators
const createLandmarkPin = (icon: string, name: string) =>
  L.divIcon({
    className: 'clean-map-pin',
    html: `<div class="pin-pill landmark"><span class="pin-ico">${icon}</span><span class="pin-txt">${name}</span></div>`,
    iconSize: [120, 26],
    iconAnchor: [60, 13],
  });

const createStationPin = (name: string) =>
  L.divIcon({
    className: 'clean-map-pin',
    html: `<div class="pin-pill station"><span class="pin-ico">⚡</span><span class="pin-txt">${name}</span></div>`,
    iconSize: [100, 24],
    iconAnchor: [50, 12],
  });

// =====================================================================
// MAIN DASHBOARD COMPONENT
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

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const mapRef = useRef<LeafletMap | null>(null);

  // Load API Data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [pR, sR, kR] = await Promise.all([
          fetch(`${API_BASE}/pipelines`),
          fetch(`${API_BASE}/stations`),
          fetch(`${API_BASE}/kp-features`),
        ]);
        if (!pR.ok || !sR.ok || !kR.ok) throw new Error('API connection failed');
        const pipelinesData: PipelineCollection = await pR.json();
        const stationsData: MeteringStation[] = await sR.json();
        const kpData: KPFeature[] = await kR.json();

        setPipelines(pipelinesData);
        setStations(stationsData);
        setKpFeatures(kpData);

        // Select the highest priority critical KP initially
        const criticalKP = kpData.find((k) => k.risk_class === 'Critical') || kpData[0];
        if (criticalKP) setSelectedKP(criticalKP);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filtered KPs
  const filteredKPs = useMemo(() => {
    return kpFeatures.filter((kp) => {
      if (selectedPipelineId !== null && kp.pipeline_id !== selectedPipelineId) return false;
      if (riskFilter !== 'all' && kp.risk_class.toLowerCase() !== riskFilter.toLowerCase()) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchKP = `kp ${kp.kp}`.includes(q) || `${kp.kp}` === q;
        const matchHazard = kp.primary_hazard.toLowerCase().includes(q);
        const matchCode = kp.pipeline_code.toLowerCase().includes(q);
        if (!matchKP && !matchHazard && !matchCode) return false;
      }
      return true;
    });
  }, [kpFeatures, selectedPipelineId, riskFilter, searchQuery]);

  // Network Statistics
  const stats = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const kp of filteredKPs) {
      counts[kp.risk_class] = (counts[kp.risk_class] || 0) + 1;
    }
    return { ...counts, total: filteredKPs.length };
  }, [filteredKPs]);

  // Selected pipeline properties
  const selectedPipeline = useMemo(() => {
    if (!pipelines || pipelines.features.length === 0) return null;
    return (
      pipelines.features.find((f) => f.properties.pipeline_id === selectedPipelineId) ??
      pipelines.features[0]
    );
  }, [pipelines, selectedPipelineId]);

  // Selection Handlers
  const handleSelectKP = (kp: KPFeature) => {
    setSelectedKP(kp);
    setMapCenter([kp.latitude, kp.longitude]);
    setMapZoom(14);
  };

  const handleSelectLandmark = (lm: typeof KEY_LANDMARKS[0]) => {
    setMapCenter(lm.coords);
    setMapZoom(14);
  };

  const handleReset = () => {
    setMapCenter([7.62, 6.70]);
    setMapZoom(11);
    setSelectedPipelineId(null);
    setRiskFilter('all');
    setSearchQuery('');
  };

  const activeTile = MAP_LAYERS[activeLayer];

  return (
    <div className="app-layout">
      {/* =========================================================
          1. LEFT SIDEBAR: FULL DIAGNOSTIC PANELS
          ========================================================= */}
      <aside className="app-sidebar">
        {/* Brand & Live Header */}
        <div className="sidebar-brand-box">
          <div className="brand-title-wrap">
            <span className="brand-flame">🔥</span>
            <div>
              <h2>Pipe.AI</h2>
              <span className="brand-subtitle">KOGI GIS PIPELINE INTEGRITY TWIN</span>
            </div>
          </div>
          <div className="live-status-tag">
            <span className="dot-live"></span>
            LIVE ML ENGINE
          </div>
        </div>

        {/* Quick Strategic Hub Jumps */}
        <div className="sidebar-section">
          <div className="section-label">⚡ Strategic Hubs (1-Click Fly-To)</div>
          <div className="quick-hub-chips">
            {KEY_LANDMARKS.map((lm) => (
              <button
                key={lm.id}
                className="hub-btn"
                onClick={() => handleSelectLandmark(lm)}
              >
                {lm.icon} {lm.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline Route & Risk Filter */}
        <div className="sidebar-section filter-box">
          <div className="form-group">
            <label>Filter Pipeline Corridor</label>
            <select
              value={selectedPipelineId ?? 'all'}
              onChange={(e) =>
                setSelectedPipelineId(e.target.value === 'all' ? null : Number(e.target.value))
              }
            >
              <option value="all">All 4 Corridors (373 km Total)</option>
              {pipelines?.features.map((p) => {
                const info = ROUTE_INFO[p.properties.pipeline_id];
                return (
                  <option key={p.properties.pipeline_id} value={p.properties.pipeline_id}>
                    {p.properties.code} — {info?.shortName || p.properties.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="risk-filter-buttons">
            <button
              className={`rf-btn all ${riskFilter === 'all' ? 'active' : ''}`}
              onClick={() => setRiskFilter('all')}
            >
              All ({stats.total})
            </button>
            <button
              className={`rf-btn critical ${riskFilter === 'critical' ? 'active' : ''}`}
              onClick={() => setRiskFilter('critical')}
            >
              🚨 Critical ({stats.Critical})
            </button>
            <button
              className={`rf-btn high ${riskFilter === 'high' ? 'active' : ''}`}
              onClick={() => setRiskFilter('high')}
            >
              ⚠️ High ({stats.High})
            </button>
            <button
              className={`rf-btn safe ${riskFilter === 'low' ? 'active' : ''}`}
              onClick={() => setRiskFilter('low')}
            >
              🟢 Safe ({stats.Low})
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="sidebar-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search KP (e.g. KP 24, River Niger, Jamata)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>

        {/* Global Error Banner */}
        {error && <div className="error-box">{error}</div>}

        {/* =========================================================
            KP DIAGNOSTIC INSPECTOR CARD (Always Rich & Detailed)
            ========================================================= */}
        {selectedKP ? (
          <div className="inspector-panel-card">
            {/* Header */}
            <div className="ipc-header">
              <div className="ipc-title">
                <span className="ipc-badge">KP {selectedKP.kp} km</span>
                <span className="ipc-code">{selectedKP.pipeline_code}</span>
              </div>
              <span className={`ipc-risk-tag ${selectedKP.risk_class.toLowerCase()}`}>
                {selectedKP.risk_class} Risk
              </span>
            </div>

            {/* PoF Hero Gauge */}
            <div className="pof-hero-card">
              <div className="pof-row">
                <span className="pof-label">Failure Probability (PoF)</span>
                <span className="pof-val" style={{ color: RISK_COLORS[selectedKP.risk_class] }}>
                  {selectedKP.failure_probability_percent}%
                </span>
              </div>
              <div className="pof-bar-bg">
                <div
                  className={`pof-bar-fill ${selectedKP.risk_class.toLowerCase()}`}
                  style={{ width: `${selectedKP.failure_probability_percent}%` }}
                />
              </div>
            </div>

            {/* Wall Thickness & Corrosion Degradation Card */}
            {selectedKP.remaining_wall_thickness_mm !== undefined && (
              <div className="degradation-card">
                <div className="card-subhead">
                  <span>🛡️ Wall Thickness & Degradation</span>
                  <span className={`deg-badge ${(selectedKP.degradation_condition || 'Normal').toLowerCase()}`}>
                    {selectedKP.degradation_condition || 'Normal'} Condition
                  </span>
                </div>
                <div className="deg-grid">
                  <div className="deg-item">
                    <span className="d-label">Remaining Wall</span>
                    <span className="d-val">{selectedKP.remaining_wall_thickness_mm} mm</span>
                    <span className="d-sub">of {selectedKP.design_wall_thickness_mm} mm design</span>
                  </div>
                  <div className="deg-item">
                    <span className="d-label">Wall Thinning Loss</span>
                    <span className="d-val loss">-{selectedKP.thickness_loss_mm} mm</span>
                    <span className="d-sub">({selectedKP.material_loss_percent}% loss)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Hazard Diagnosis Box */}
            <div className="diagnosis-box">
              <div className="diag-head">
                <span className="diag-icon">⚠️</span>
                <h4>{selectedKP.primary_hazard}</h4>
              </div>
              <p className="diag-text">{selectedKP.diagnostic_message}</p>
            </div>

            {/* Actionable Engineering Directive */}
            <div className="action-box">
              <div className="action-head">
                <span>🔧 Recommended Engineering Remediation:</span>
              </div>
              <p className="action-text">{selectedKP.remediation_plan}</p>
            </div>

            {/* 6 Quantitative Determinant Progress Scores */}
            <div className="determinants-card">
              <div className="card-subhead">
                <span>📊 6 Quantitative Determinant Scores</span>
                <span className="score-range">0.0 → 1.0</span>
              </div>
              <div className="det-list">
                {[
                  { name: '🌊 Flooding & Scour Index', val: selectedKP.flooding_index, col: '#06b6d4' },
                  { name: '🌋 Seismic Shearing Factor', val: selectedKP.earthquake_factor, col: '#ef4444' },
                  { name: '🌧️ Rainfall Runoff Erosion', val: selectedKP.erosion_factor, col: '#3b82f6' },
                  { name: '🏔️ Landslide Slope Risk', val: selectedKP.landslide_index, col: '#f59e0b' },
                  { name: '🧪 Soil & Water Corrosivity', val: selectedKP.soil_corrosivity_index, col: '#a855f7' },
                  { name: '⚙️ Operating Hoop Stress', val: selectedKP.hoop_stress_ratio, col: '#eab308' },
                ].map((d) => (
                  <div key={d.name} className="det-row">
                    <div className="det-row-head">
                      <span>{d.name}</span>
                      <strong>{(d.val ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="det-track">
                      <div className="det-fill" style={{ width: `${(d.val ?? 0) * 100}%`, background: d.col }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ground Parameters Grid */}
            <div className="ground-grid">
              <div className="g-item">
                <span className="g-lbl">Elevation</span>
                <span className="g-val">{selectedKP.elevation} m</span>
              </div>
              <div className="g-item">
                <span className="g-lbl">Slope</span>
                <span className="g-val">{selectedKP.slope_deg}°</span>
              </div>
              <div className="g-item">
                <span className="g-lbl">River Proximity</span>
                <span className="g-val">{selectedKP.river_proximity_km} km</span>
              </div>
              <div className="g-item">
                <span className="g-lbl">Fault Distance</span>
                <span className="g-val">{selectedKP.fault_distance_km} km</span>
              </div>
              <div className="g-item">
                <span className="g-lbl">Soil Lithology</span>
                <span className="g-val">{selectedKP.soil_type}</span>
              </div>
              <div className="g-item">
                <span className="g-lbl">Pipe Spec</span>
                <span className="g-val">{selectedKP.pipe_diameter_inches}" {selectedKP.pipe_material}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-inspector">
            <p>Click any pipeline marker on the map to view full diagnostic inspection.</p>
          </div>
        )}

        {/* Scrollable KP List */}
        <div className="sidebar-kp-list-section">
          <div className="section-label">Sampled Kilometer Posts ({filteredKPs.length})</div>
          <div className="kp-scroll-list">
            {filteredKPs.map((kp) => {
              const isSel = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              const col = RISK_COLORS[kp.risk_class];
              return (
                <div
                  key={`${kp.pipeline_id}-${kp.kp}`}
                  className={`kp-list-item ${isSel ? 'selected' : ''}`}
                  onClick={() => handleSelectKP(kp)}
                >
                  <span className="kp-dot" style={{ background: col }} />
                  <div className="kp-list-info">
                    <span className="kp-list-name">{kp.pipeline_code} — KP {kp.kp} km</span>
                    <span className="kp-list-sub">{kp.primary_hazard}</span>
                  </div>
                  <span className="kp-list-pof" style={{ color: col }}>
                    {kp.failure_probability_percent}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* =========================================================
          2. RIGHT MAP AREA: 100% NATIVE LEAFLET USABILITY
          ========================================================= */}
      <main className="app-map-area">
        {loading && (
          <div className="map-loading-overlay">
            <div className="spinner" />
            <span>Loading Quantitative Geo-Hazard & Pipeline Satellite Data…</span>
          </div>
        )}

        {/* Floating Layer Switcher Buttons in Top-Right */}
        <div className="map-layer-bar">
          {(Object.keys(MAP_LAYERS) as LayerKey[]).map((key) => (
            <button
              key={key}
              className={`layer-btn ${activeLayer === key ? 'active' : ''}`}
              onClick={() => setActiveLayer(key)}
            >
              {MAP_LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Floating Reset & Zoom Controls */}
        <div className="map-quick-controls">
          <button onClick={() => mapRef.current?.zoomIn()} title="Zoom in">＋</button>
          <button onClick={() => mapRef.current?.zoomOut()} title="Zoom out">－</button>
          <button onClick={handleReset} title="Reset map center">⦿</button>
        </div>

        {/* 100% NATIVE LEAFLET CONTAINER (Zero CSS skew, 100% smooth) */}
        <div className="native-map-container">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            maxZoom={20}
            zoomControl={false}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
            className="leaflet-root"
          >
            <MapViewController center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
            <TileLayer
              key={activeLayer}
              attribution={activeTile.attribution}
              url={activeTile.url}
              maxZoom={activeTile.maxZoom}
            />

            {/* 🌊 River Niger Flood Scour Corridor */}
            <Polygon
              positions={FLOOD_CORRIDOR}
              pathOptions={{
                color: '#06b6d4',
                fillColor: '#0891b2',
                fillOpacity: 0.18,
                weight: 2,
                dashArray: '6, 8',
              }}
            >
              <Tooltip sticky>
                🌊 <strong>River Niger Hydrodynamic Scour Zone</strong>
              </Tooltip>
            </Polygon>

            {/* 🌋 Active Seismic Fault Trace */}
            <Polyline
              positions={FAULT_TRACE}
              pathOptions={{
                color: '#ef4444',
                weight: 4,
                dashArray: '12, 8',
              }}
            >
              <Tooltip sticky>
                🌋 <strong>Lokoja–Koton Karfe Fault Line</strong>
              </Tooltip>
            </Polyline>

            {/* 🏢 Industrial Plant Landmarks */}
            {KEY_LANDMARKS.map((lm) => (
              <Fragment key={lm.id}>
                <Polygon
                  positions={lm.poly}
                  pathOptions={{
                    color: lm.color,
                    fillColor: lm.color,
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: '4, 6',
                  }}
                  eventHandlers={{ click: () => handleSelectLandmark(lm) }}
                >
                  <Tooltip sticky>
                    <strong>{lm.icon} {lm.name}</strong><br />
                    {lm.type}
                  </Tooltip>
                </Polygon>
                <Marker
                  position={lm.coords}
                  icon={createLandmarkPin(lm.icon, lm.shortName)}
                  eventHandlers={{ click: () => handleSelectLandmark(lm) }}
                />
              </Fragment>
            ))}

            {/* ⚡ Metering Stations */}
            {stations.map((st) => (
              <Marker
                key={st.id}
                position={[st.coordinates[1], st.coordinates[0]]}
                icon={createStationPin(st.name.replace('Metering Station', '').trim())}
                eventHandlers={{
                  click: () => {
                    setMapCenter([st.coordinates[1], st.coordinates[0]]);
                    setMapZoom(14);
                  },
                }}
              >
                <Popup>
                  <div>
                    <strong>⚡ {st.name}</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                      Capacity: {st.capacity_mmscfd} MMSCFD
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* ── BOLD, LUMINOUS PIPELINES ── */}
            {pipelines?.features.map((f: any, idx: number) => {
              const coords = f.geometry.coordinates as [number, number][];
              const props = f.properties as PipelineProperties;
              const pid = props.pipeline_id;
              const isSelected = selectedPipelineId === pid;
              const info = ROUTE_INFO[pid] || ROUTE_INFO[1];
              const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

              return (
                <Fragment key={`pl-${idx}`}>
                  {/* Outer Glow */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : info.color,
                      weight: isSelected ? 16 : 10,
                      opacity: isSelected ? 0.45 : 0.25,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                  {/* Solid Pipe Core */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: info.color,
                      weight: isSelected ? 7 : 5,
                      opacity: 1.0,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                    eventHandlers={{
                      click: () => setSelectedPipelineId(pid),
                    }}
                  >
                    <Tooltip sticky>
                      <strong>{info.name}</strong><br />
                      Diameter: {info.diameter} | Steel: {info.steel} | Pressure: {info.pressure}
                    </Tooltip>
                  </Polyline>
                </Fragment>
              );
            })}

            {/* ── INTERACTIVE KP CIRCLE MARKERS ── */}
            {filteredKPs.map((kp) => {
              const isSelected = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              const color = RISK_COLORS[kp.risk_class];
              const radius = isSelected ? 9 : kp.risk_class === 'Critical' ? 6.5 : kp.risk_class === 'High' ? 5.5 : 4;

              return (
                <CircleMarker
                  key={`kp-${kp.pipeline_id}-${kp.kp}`}
                  center={[kp.latitude, kp.longitude]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    fillOpacity: 1.0,
                    color: isSelected ? '#ffffff' : '#0f172a',
                    weight: isSelected ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => handleSelectKP(kp),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <strong>KP {kp.kp} km ({kp.pipeline_code})</strong><br />
                    PoF: <span style={{ color, fontWeight: 800 }}>{kp.failure_probability_percent}% ({kp.risk_class})</span><br />
                    {kp.primary_hazard}
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Legend in Bottom-Right */}
        <div className="map-floating-legend">
          <div className="leg-head">Pipeline PoF Legend</div>
          <div className="leg-item"><span className="leg-dot" style={{ background: '#ef4444' }} /> Critical (≥60%)</div>
          <div className="leg-item"><span className="leg-dot" style={{ background: '#f97316' }} /> High Risk (38–59%)</div>
          <div className="leg-item"><span className="leg-dot" style={{ background: '#f59e0b' }} /> Medium (20–37%)</div>
          <div className="leg-item"><span className="leg-dot" style={{ background: '#10b981' }} /> Low / Safe (&lt;20%)</div>
        </div>
      </main>
    </div>
  );
}

export default App;
