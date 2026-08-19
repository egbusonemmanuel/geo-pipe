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
import L, { type LatLngExpression, type Map as LeafletMap } from 'leaflet';
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

// Risk Colors for KP markers
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

// Realistic Pipeline Steel Corridor Colors (by route)
const PIPE_STEEL_COLORS: Record<number, { row: string; steel: string; stripe: string; name: string }> = {
  1: { row: 'rgba(255, 140, 0, 0.32)', steel: '#c0c0c0', stripe: '#ff8c00', name: 'AKK Section 1' },
  2: { row: 'rgba(0, 191, 255, 0.28)', steel: '#b0b8c8', stripe: '#00bfff', name: 'Geregu Feeder' },
  3: { row: 'rgba(255, 69, 0, 0.28)', steel: '#a8a8a8', stripe: '#ff4500', name: 'Obajana Line' },
  4: { row: 'rgba(148, 103, 189, 0.28)', steel: '#b8b0c8', stripe: '#9467bd', name: 'Oben–Ajaokuta' },
};

// Tile Layers — vivid satellite as default
const TILE_LAYERS = {
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google / Maxar Satellite',
    maxZoom: 20,
  },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap | OpenTopoMap',
    maxZoom: 17,
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

// Key Infrastructure Landmarks
const LANDMARKS = [
  { id: 'L1', name: 'Ajaokuta Steel Complex', icon: '🏭', coords: [7.5564, 6.6552] as [number, number], type: 'Gas Terminal & Steel Plant', poly: [[7.542, 6.642], [7.542, 6.672], [7.572, 6.672], [7.572, 6.642]] as [number, number][], color: '#06b6d4' },
  { id: 'L2', name: 'Geregu Power Station', icon: '⚡', coords: [7.4716, 6.6603] as [number, number], type: '884 MW Gas Thermal Power', poly: [[7.462, 6.652], [7.462, 6.670], [7.481, 6.670], [7.481, 6.652]] as [number, number][], color: '#f59e0b' },
  { id: 'L3', name: 'Obajana Cement Plant', icon: '🏗️', coords: [7.9150, 6.4350] as [number, number], type: '13.25 MTPA Cement Works', poly: [[7.902, 6.422], [7.902, 6.452], [7.928, 6.452], [7.928, 6.422]] as [number, number][], color: '#ec4899' },
  { id: 'L4', name: 'Lokoja River Port', icon: '🚢', coords: [7.7300, 6.7400] as [number, number], type: 'Niger Confluence Port', poly: [[7.718, 6.728], [7.718, 6.752], [7.742, 6.752], [7.742, 6.728]] as [number, number][], color: '#3b82f6' },
  { id: 'L5', name: 'Jamata HDD River Crossing', icon: '🌊', coords: [7.8500, 6.8900] as [number, number], type: 'Sub-River Drilling Site', poly: [[7.838, 6.880], [7.838, 6.902], [7.862, 6.902], [7.862, 6.880]] as [number, number][], color: '#06b6d4' },
];

// Hazard zones
const FLOOD_CORRIDOR: [number, number][] = [
  [7.52, 6.64], [7.57, 6.67], [7.62, 6.70], [7.71, 6.76], [7.82, 6.87],
  [7.90, 6.92], [7.92, 6.88], [7.80, 6.82], [7.68, 6.72], [7.59, 6.66], [7.50, 6.62],
];
const FAULT_TRACE: [number, number][] = [
  [7.35, 6.45], [7.58, 6.62], [7.78, 6.82], [8.05, 7.05], [8.25, 7.22],
];

// Helper: offset a polyline laterally for "ROW corridor" effect
function offsetPolyline(coords: [number, number][], metersOffset: number): [number, number][] {
  const DEG_PER_M = 1 / 111320;
  return coords.map(([lon, lat], i) => {
    const prev = coords[Math.max(0, i - 1)];
    const next = coords[Math.min(coords.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    const nx = -dy / len;
    const ny = dx / len;
    return [lat + ny * metersOffset * DEG_PER_M, lon + nx * metersOffset * DEG_PER_M] as [number, number];
  });
}

// Station icon
const stationIcon = (name: string, isMain: boolean) =>
  L.divIcon({
    className: 'custom-station-icon',
    html: `<div class="station-pin ${isMain ? 'main' : ''}"><div class="pin-pulse"></div><div class="pin-core">⚡</div><span class="pin-label">${name}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

// Landmark icon
const landmarkIcon = (icon: string, name: string) =>
  L.divIcon({
    className: 'custom-facility-icon',
    html: `<div class="facility-marker"><div class="facility-pulse"></div><div class="facility-badge">${icon}</div><div class="facility-label-card"><span class="facility-title">${name}</span></div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

function MapUpdater({ center, zoom, mapRef }: { center: [number, number]; zoom: number; mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; map.setView(center, zoom); }, [center, zoom, map, mapRef]);
  return null;
}

// =====================================================================
// APP
// =====================================================================
function App() {
  const [pipelines, setPipelines] = useState<PipelineCollection | null>(null);
  const [stations, setStations] = useState<MeteringStation[]>([]);
  const [kpFeatures, setKpFeatures] = useState<KPFeature[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedKP, setSelectedKP] = useState<KPFeature | null>(null);
  const [selectedStation, setSelectedStation] = useState<MeteringStation | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('satellite');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [hazardFilter, setHazardFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overlay toggles
  const [showROW, setShowROW] = useState(true);         // right-of-way corridor
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showFlood, setShowFlood] = useState(true);
  const [showFault, setShowFault] = useState(true);

  const mapRef = useRef<LeafletMap | null>(null);

  const selectedPipeline = useMemo(() => {
    if (!pipelines || pipelines.features.length === 0) return null;
    return (
      pipelines.features.find((f) => f.properties.pipeline_id === selectedPipelineId) ??
      pipelines.features[0]
    );
  }, [pipelines, selectedPipelineId]);

  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(11);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [pR, sR, kR] = await Promise.all([
          fetch(`${API_BASE}/pipelines`),
          fetch(`${API_BASE}/stations`),
          fetch(`${API_BASE}/kp-features`),
        ]);
        if (!pR.ok || !sR.ok || !kR.ok) throw new Error('Failed to load data');
        setPipelines(await pR.json());
        setStations(await sR.json());
        const kpData: KPFeature[] = await kR.json();
        setKpFeatures(kpData);
        const first = kpData.find((k) => k.risk_class === 'Critical') || kpData[0];
        if (first) setSelectedKP(first);
      } catch (e) { setError(String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const m = mapRef.current; if (!m) return;
      if (e.key === 'ArrowUp') { m.panBy([0, -100]); e.preventDefault(); }
      if (e.key === 'ArrowDown') { m.panBy([0, 100]); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { m.panBy([-100, 0]); e.preventDefault(); }
      if (e.key === 'ArrowRight') { m.panBy([100, 0]); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') { m.zoomIn(); e.preventDefault(); }
      if (e.key === '-') { m.zoomOut(); e.preventDefault(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const filteredKPs = useMemo(() => {
    return kpFeatures.filter((kp) => {
      if (selectedPipelineId !== null && kp.pipeline_id !== selectedPipelineId) return false;
      if (riskFilter !== 'all' && kp.risk_class.toLowerCase() !== riskFilter.toLowerCase()) return false;
      if (hazardFilter !== 'all' && !kp.primary_hazard.toLowerCase().includes(hazardFilter.toLowerCase())) return false;
      return true;
    });
  }, [kpFeatures, selectedPipelineId, riskFilter, hazardFilter]);

  const stats = useMemo(() => {
    const c = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let totalPoF = 0;
    for (const kp of filteredKPs) { c[kp.risk_class] = (c[kp.risk_class] || 0) + 1; totalPoF += kp.failure_probability; }
    return { ...c, total: filteredKPs.length, avgPoF: filteredKPs.length > 0 ? (totalPoF / filteredKPs.length) * 100 : 0 };
  }, [filteredKPs]);

  const handleKPClick = (kp: KPFeature) => { setSelectedKP(kp); setMapCenter([kp.latitude, kp.longitude]); setMapZoom(14); };
  const handleStationClick = (st: MeteringStation) => { setSelectedStation(st); setMapCenter([st.coordinates[1], st.coordinates[0]]); setMapZoom(14); };
  const handleLandmarkClick = (lm: typeof LANDMARKS[0]) => { setMapCenter(lm.coords); setMapZoom(15); };
  const handleResetView = () => { setMapCenter([7.62, 6.7]); setMapZoom(11); };

  const currentTile = TILE_LAYERS[activeLayer];

  return (
    <div className="app-shell">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">🔥</div>
            <div>
              <h1>Pipe.AI</h1>
              <span className="badge-live">LIVE SATELLITE GIS</span>
            </div>
          </div>
          <p className="subtitle">
            Kogi State Pipeline Corridor — Real-Time Failure Probability & Corrosion Monitor
          </p>
        </div>

        {/* Quick nav to landmarks */}
        <div className="station-quick-bar">
          <div className="bar-title">🏭 Key Infrastructure</div>
          <div className="station-chips">
            {LANDMARKS.map((lm) => (
              <button key={lm.id} className="chip-btn" onClick={() => handleLandmarkClick(lm)}>
                {lm.icon} {lm.name.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Metering Stations quick nav */}
        <div className="station-quick-bar">
          <div className="bar-title">⚡ Metering Stations</div>
          <div className="station-chips">
            {stations.map((st) => (
              <button
                key={st.id}
                className={`chip-btn ${selectedStation?.id === st.id ? 'active' : ''}`}
                onClick={() => handleStationClick(st)}
              >
                ⚡ {st.name.replace('Metering Station', '').trim()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="stats-bar">
            <div className="stat-item"><span className="stat-value critical">{stats.Critical}</span><span className="stat-label">Critical</span></div>
            <div className="stat-item"><span className="stat-value high">{stats.High}</span><span className="stat-label">High</span></div>
            <div className="stat-item"><span className="stat-value medium">{stats.Medium}</span><span className="stat-label">Medium</span></div>
            <div className="stat-item"><span className="stat-value low">{stats.Low}</span><span className="stat-label">Low</span></div>
          </div>
        )}

        {/* Filters */}
        <div className="filter-panel">
          <div className="filter-group">
            <label>Pipeline Route</label>
            <select value={selectedPipelineId ?? 'all'} onChange={(e) => setSelectedPipelineId(e.target.value === 'all' ? null : Number(e.target.value))}>
              <option value="all">All 4 Routes</option>
              {pipelines?.features.map((f) => (<option key={f.properties.pipeline_id} value={f.properties.pipeline_id}>{f.properties.code} — {f.properties.name}</option>))}
            </select>
          </div>
          <div className="filter-row">
            <div className="filter-group">
              <label>Risk Level</label>
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Hazard Type</label>
              <select value={hazardFilter} onChange={(e) => setHazardFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="hydrodynamic">River Scour</option>
                <option value="slope">Landslide</option>
                <option value="seismic">Seismic</option>
                <option value="corrosive">Corrosion</option>
                <option value="erosion">Erosion</option>
              </select>
            </div>
          </div>
        </div>

        {/* Selected pipeline info */}
        {selectedPipeline && (
          <div className="diagnostic-card">
            <div className="card-header">
              <div className="kp-badge">{selectedPipeline.properties.code}</div>
              <span className={`risk-pill ${selectedPipeline.properties.risk_label.toLowerCase()}`}>{selectedPipeline.properties.risk_label} Risk</span>
            </div>
            <div className="hazard-box">
              <div className="hazard-title"><h4>{selectedPipeline.properties.name}</h4></div>
              <p className="diagnostic-text">{selectedPipeline.properties.commissioning_note ?? 'Pipeline status data unavailable.'}</p>
            </div>
            <div className="env-grid">
              <div className="env-item"><span className="env-label">Age</span><span className="env-val">{selectedPipeline.properties.construction_age_years ?? 0} yrs</span></div>
              <div className="env-item"><span className="env-label">Status</span><span className="env-val small">{selectedPipeline.properties.operational_status ?? 'N/A'}</span></div>
            </div>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        {/* KP Inspector Card */}
        {selectedKP ? (
          <div className="diagnostic-card">
            <div className="card-header">
              <div className="kp-badge">KP {selectedKP.kp} km</div>
              <span className={`risk-pill ${selectedKP.risk_class.toLowerCase()}`}>{selectedKP.risk_class} Risk</span>
            </div>
            <div className="pof-gauge-section">
              <div className="pof-header">
                <span className="pof-title">Probability of Failure</span>
                <span className="pof-percent" style={{ color: RISK_COLORS[selectedKP.risk_class] }}>{selectedKP.failure_probability_percent}%</span>
              </div>
              <div className="pof-bar-bg"><div className={`pof-bar-fill ${selectedKP.risk_class.toLowerCase()}`} style={{ width: `${selectedKP.failure_probability_percent}%` }} /></div>
            </div>
            <div className="determinants-section">
              <div className="determinants-title">📊 6 Geo-Hazard Determinants</div>
              <div className="det-list">
                {[
                  { name: '🌊 Flood & Scour', val: selectedKP.flooding_index, cls: 'hydro' },
                  { name: '🌋 Seismic', val: selectedKP.earthquake_factor, cls: 'seismic' },
                  { name: '🌧️ Erosion', val: selectedKP.erosion_factor, cls: 'erosion' },
                  { name: '🏔️ Landslide', val: selectedKP.landslide_index, cls: 'landslide' },
                  { name: '🧪 Soil Corrosion', val: selectedKP.soil_corrosivity_index, cls: 'corrosion' },
                  { name: '⚙️ Hoop Stress', val: selectedKP.hoop_stress_ratio, cls: 'stress' },
                ].map((d) => (
                  <div className="det-item" key={d.cls}>
                    <div className="det-header"><span className="det-name">{d.name}</span><span className="det-score">{(d.val ?? 0).toFixed(2)}</span></div>
                    <div className="det-bar-bg"><div className={`det-bar-fill ${d.cls}`} style={{ width: `${(d.val ?? 0) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            {selectedKP.remaining_wall_thickness_mm !== undefined && (
              <div className="degradation-section">
                <div className="degradation-header">
                  <span className="det-name" style={{ fontWeight: 700 }}>🛡️ Wall Thickness</span>
                  <span className={`deg-condition-badge ${(selectedKP.degradation_condition || 'Normal').toLowerCase()}`}>{selectedKP.degradation_condition || 'Normal'}</span>
                </div>
                <div className="deg-grid">
                  <div className="deg-stat"><span className="deg-stat-label">Remaining</span><span className="deg-stat-val">{selectedKP.remaining_wall_thickness_mm} mm</span></div>
                  <div className="deg-stat"><span className="deg-stat-label">Loss</span><span className="deg-stat-val loss">-{selectedKP.thickness_loss_mm} mm ({selectedKP.material_loss_percent}%)</span></div>
                </div>
              </div>
            )}
            <div className="hazard-box">
              <div className="hazard-title"><span className="hazard-code">{selectedKP.failure_code}</span><h4>{selectedKP.primary_hazard}</h4></div>
              <p className="diagnostic-text">{selectedKP.diagnostic_message}</p>
            </div>
            <div className="env-grid">
              <div className="env-item"><span className="env-label">Elevation</span><span className="env-val">{selectedKP.elevation} m</span></div>
              <div className="env-item"><span className="env-label">Slope</span><span className="env-val">{selectedKP.slope_deg}°</span></div>
              <div className="env-item"><span className="env-label">River</span><span className="env-val">{selectedKP.river_proximity_km} km</span></div>
              <div className="env-item"><span className="env-label">Fault</span><span className="env-val">{selectedKP.fault_distance_km} km</span></div>
              <div className="env-item"><span className="env-label">Soil</span><span className="env-val small">{selectedKP.soil_type}</span></div>
              <div className="env-item"><span className="env-label">Pipe</span><span className="env-val">{selectedKP.pipe_diameter_inches}" {selectedKP.pipe_material}</span></div>
            </div>
            <div className="remediation-box"><h5>🔧 Remediation</h5><p>{selectedKP.remediation_plan}</p></div>
          </div>
        ) : (
          <div className="empty-state"><div className="icon">📍</div><p>Click any marker on the map to inspect.</p></div>
        )}

        {/* KP List */}
        <div className="kp-list-section">
          <div className="section-title">Kilometer Posts ({filteredKPs.length})</div>
          <div className="kp-list">
            {filteredKPs.map((kp) => {
              const isSel = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              return (
                <div key={`${kp.pipeline_id}-${kp.kp}`} className={`kp-item ${isSel ? 'active' : ''}`} onClick={() => handleKPClick(kp)}>
                  <div className={`risk-dot ${kp.risk_class.toLowerCase()}`} />
                  <div className="kp-info"><div className="kp-name">{kp.pipeline_code} — KP {kp.kp}</div><div className="kp-meta">{kp.primary_hazard}</div></div>
                  <div className={`pof-badge ${kp.risk_class.toLowerCase()}`}>{kp.failure_probability_percent}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ==================== MAP ==================== */}
      <main className="map-panel">
        {loading && (<div className="loading-overlay"><div className="spinner" /><span className="loading-text">Loading Pipeline GIS Data…</span></div>)}

        {/* Simple Layer Switcher */}
        <div className="layer-toggle">
          <button className={`layer-btn ${activeLayer === 'satellite' ? 'active' : ''}`} onClick={() => setActiveLayer('satellite')}>🛰 Satellite</button>
          <button className={`layer-btn ${activeLayer === 'esri' ? 'active' : ''}`} onClick={() => setActiveLayer('esri')}>🏢 Esri HD</button>
          <button className={`layer-btn ${activeLayer === 'dark' ? 'active' : ''}`} onClick={() => setActiveLayer('dark')}>🌑 Dark</button>
          <button className={`layer-btn ${activeLayer === 'terrain' ? 'active' : ''}`} onClick={() => setActiveLayer('terrain')}>🏔 Terrain</button>
        </div>

        {/* Overlay Toggles */}
        <div className="map-hazard-toggles">
          <div className="toggle-header">Map Overlays</div>
          <label className="hazard-toggle-item"><input type="checkbox" checked={showROW} onChange={(e) => setShowROW(e.target.checked)} /> Pipeline ROW</label>
          <label className="hazard-toggle-item"><input type="checkbox" checked={showLandmarks} onChange={(e) => setShowLandmarks(e.target.checked)} /> Facilities</label>
          <label className="hazard-toggle-item"><input type="checkbox" checked={showFlood} onChange={(e) => setShowFlood(e.target.checked)} /> Flood Zone</label>
          <label className="hazard-toggle-item"><input type="checkbox" checked={showFault} onChange={(e) => setShowFault(e.target.checked)} /> Fault Line</label>
        </div>

        {/* Simple Zoom Controls */}
        <div className="map-control-panel" aria-label="Map controls">
          <div className="map-control-row map-zoom-row">
            <button type="button" className="zoom-btn" onClick={() => { mapRef.current?.zoomIn(); }} aria-label="Zoom in">＋</button>
            <button type="button" className="zoom-btn" onClick={() => { mapRef.current?.zoomOut(); }} aria-label="Zoom out">－</button>
            <button type="button" className="zoom-btn" onClick={handleResetView} aria-label="Reset">⦿</button>
          </div>
        </div>

        {/* Map — NO perspective distortion, direct Leaflet interaction */}
        <div className="accessible-map-wrapper" role="application" aria-label="Pipeline risk map" tabIndex={0}>
          <MapContainer center={mapCenter} zoom={mapZoom} maxZoom={20} scrollWheelZoom style={{ width: '100%', height: '100%' }} className="accessible-map">
            <MapUpdater center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
            <TileLayer key={activeLayer} attribution={currentTile.attribution} url={currentTile.url} maxZoom={currentTile.maxZoom} />

            {/* ── FLOOD SCOUR ZONE ── */}
            {showFlood && (
              <Polygon positions={FLOOD_CORRIDOR} pathOptions={{ color: '#06b6d4', fillColor: '#0891b2', fillOpacity: 0.18, weight: 2, dashArray: '6, 8', className: 'flood-scour-poly' }}>
                <Tooltip sticky>🌊 <strong>River Niger Hydrodynamic Scour Zone</strong></Tooltip>
              </Polygon>
            )}

            {/* ── SEISMIC FAULT TRACE ── */}
            {showFault && (
              <Polyline positions={FAULT_TRACE} pathOptions={{ color: '#ef4444', weight: 4, dashArray: '14, 10', className: 'fault-fracture-line' }}>
                <Tooltip sticky>🌋 <strong>Lokoja–Koton Karfe Fault</strong></Tooltip>
              </Polyline>
            )}

            {/* ── REALISTIC PIPELINE RENDERING ── */}
            {pipelines?.features.map((f: any, idx: number) => {
              const coords = f.geometry.coordinates as [number, number][];
              const props = f.properties as PipelineProperties;
              const pid = props.pipeline_id;
              const isSelected = selectedPipelineId === pid;
              const palette = PIPE_STEEL_COLORS[pid] || PIPE_STEEL_COLORS[1];
              const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

              // Right-of-Way cleared corridor edges (offset left & right)
              const rowLeft = offsetPolyline(coords, 60);
              const rowRight = offsetPolyline(coords, -60);

              return (
                <Fragment key={`pl-${idx}`}>
                  {/* Layer 1: Wide cleared Right-of-Way (ROW) corridor */}
                  {showROW && (
                    <>
                      <Polyline positions={rowLeft} pathOptions={{ color: palette.stripe, weight: 1, opacity: 0.6, dashArray: '4, 8' }} />
                      <Polyline positions={rowRight} pathOptions={{ color: palette.stripe, weight: 1, opacity: 0.6, dashArray: '4, 8' }} />
                      <Polyline positions={route} pathOptions={{ color: palette.row, weight: isSelected ? 28 : 22, opacity: 0.5, lineCap: 'round', lineJoin: 'round', className: 'pipeline-row' }} />
                    </>
                  )}

                  {/* Layer 2: Dark pipe shadow (ground contact shadow) */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: '#1a1a2e',
                      weight: isSelected ? 14 : 10,
                      opacity: 0.7,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />

                  {/* Layer 3: Steel pipe body — realistic metallic grey */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: palette.steel,
                      weight: isSelected ? 10 : 7,
                      opacity: 0.95,
                      lineCap: 'round',
                      lineJoin: 'round',
                      className: `pipeline-steel ${isSelected ? 'selected' : ''}`,
                    }}
                  >
                    <Tooltip sticky>
                      <strong>{palette.name}</strong> — {props.code}<br />
                      Risk: {props.risk_label}
                    </Tooltip>
                  </Polyline>

                  {/* Layer 4: Center highlight — steel reflection glint */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: '#ffffff',
                      weight: isSelected ? 3 : 2,
                      opacity: 0.5,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />

                  {/* Layer 5: Hazard identification stripe (colored dashes like real pipeline markers) */}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: palette.stripe,
                      weight: isSelected ? 4 : 3,
                      opacity: 0.85,
                      dashArray: '16, 20',
                      lineCap: 'butt',
                      lineJoin: 'round',
                      className: 'pipeline-stripe',
                    }}
                  />
                </Fragment>
              );
            })}

            {/* ── LANDMARK BUILDING FOOTPRINTS ── */}
            {showLandmarks && LANDMARKS.map((lm) => (
              <Fragment key={lm.id}>
                <Polygon
                  positions={lm.poly}
                  pathOptions={{ color: lm.color, fillColor: lm.color, fillOpacity: 0.2, weight: 2, dashArray: '4, 6', className: 'building-complex-poly' }}
                  eventHandlers={{ click: () => handleLandmarkClick(lm) }}
                >
                  <Tooltip sticky>{lm.icon} <strong>{lm.name}</strong><br />{lm.type}</Tooltip>
                </Polygon>
                <Marker position={lm.coords} icon={landmarkIcon(lm.icon, lm.name.split(' ').slice(0, 2).join(' '))} eventHandlers={{ click: () => handleLandmarkClick(lm) }}>
                  <Popup className="station-popup"><div><h3>{lm.icon} {lm.name}</h3><p><strong>Type:</strong> {lm.type}</p></div></Popup>
                </Marker>
              </Fragment>
            ))}

            {/* ── METERING STATIONS ── */}
            {stations.map((st) => (
              <Marker key={st.id} position={[st.coordinates[1], st.coordinates[0]]} icon={stationIcon(st.name, st.id === 'ST-01')} eventHandlers={{ click: () => handleStationClick(st) }}>
                <Popup className="station-popup"><div><h3>⚡ {st.name}</h3><p><strong>Type:</strong> {st.type}</p><p><strong>Capacity:</strong> {st.capacity_mmscfd} MMSCFD</p></div></Popup>
              </Marker>
            ))}

            {/* ── KP MARKERS ── */}
            {filteredKPs.map((kp) => {
              const isSel = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              return (
                <CircleMarker
                  key={`kp-${kp.pipeline_id}-${kp.kp}`}
                  center={[kp.latitude, kp.longitude]}
                  radius={isSel ? 9 : kp.risk_class === 'Critical' ? 7 : 5}
                  pathOptions={{ fillColor: RISK_COLORS[kp.risk_class], fillOpacity: isSel ? 1 : 0.85, color: isSel ? '#fff' : '#000', weight: isSel ? 3 : 1 }}
                  eventHandlers={{ click: () => handleKPClick(kp) }}
                >
                  <Popup className="kp-popup">
                    <div className="popup-content">
                      <div className="popup-header"><strong>{kp.pipeline_code} — KP {kp.kp} km</strong><span className={`popup-risk ${kp.risk_class.toLowerCase()}`}>{kp.risk_class}</span></div>
                      <div className="popup-body">
                        <p><strong>PoF:</strong> {kp.failure_probability_percent}%</p>
                        <p><strong>Cause:</strong> {kp.primary_hazard}</p>
                        {kp.remaining_wall_thickness_mm !== undefined && (<p><strong>Wall:</strong> {kp.remaining_wall_thickness_mm}mm ({kp.degradation_condition || 'Normal'})</p>)}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Legend */}
        <div className="map-legend">
          <h3>Pipeline PoF Legend</h3>
          <div className="legend-item"><div className="legend-line critical" /><span className="legend-text">Critical ≥60%</span></div>
          <div className="legend-item"><div className="legend-line high" /><span className="legend-text">High 38-59%</span></div>
          <div className="legend-item"><div className="legend-line medium" /><span className="legend-text">Medium 20-37%</span></div>
          <div className="legend-item"><div className="legend-line low" /><span className="legend-text">Low &lt;20%</span></div>
        </div>
      </main>
    </div>
  );
}

export default App;
