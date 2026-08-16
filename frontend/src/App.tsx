import { Fragment, useEffect, useMemo, useState, useCallback, useRef, type MutableRefObject } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Polyline,
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

// Risk Colors
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

// Map Tile Layers
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

// Custom Station Marker Icon
const stationIcon = (name: string, isMain: boolean) =>
  L.divIcon({
    className: 'custom-station-icon',
    html: `
      <div class="station-pin ${isMain ? 'main' : ''}">
        <div class="pin-pulse"></div>
        <div class="pin-core">⚡</div>
        <span class="pin-label">${name}</span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
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

function App() {
  const [pipelines, setPipelines] = useState<PipelineCollection | null>(null);
  const [stations, setStations] = useState<MeteringStation[]>([]);
  const [kpFeatures, setKpFeatures] = useState<KPFeature[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedKP, setSelectedKP] = useState<KPFeature | null>(null);
  const [selectedStation, setSelectedStation] = useState<MeteringStation | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('dark');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [hazardFilter, setHazardFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show3D, setShow3D] = useState<boolean>(true);
  const [threeDIntensity, setThreeDIntensity] = useState<number>(12);
  const mapRef = useRef<LeafletMap | null>(null);

  const selectedPipeline = useMemo(() => {
    if (!pipelines || pipelines.features.length === 0) return null;
    return (
      pipelines.features.find((feature) => feature.properties.pipeline_id === selectedPipelineId) ??
      pipelines.features[0]
    );
  }, [pipelines, selectedPipelineId]);

  // Map view center state (default centered on Ajaokuta / Kogi State)
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(10);

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [pipelinesRes, stationsRes, kpRes] = await Promise.all([
          fetch(`${API_BASE}/pipelines`),
          fetch(`${API_BASE}/stations`),
          fetch(`${API_BASE}/kp-features`),
        ]);

        if (!pipelinesRes.ok) throw new Error('Failed to load pipeline route data');
        if (!stationsRes.ok) throw new Error('Failed to load metering station data');
        if (!kpRes.ok) throw new Error('Failed to load KP failure feature data');

        const pipelinesData: PipelineCollection = await pipelinesRes.json();
        const stationsData: MeteringStation[] = await stationsRes.json();
        const kpData: KPFeature[] = await kpRes.json();

        setPipelines(pipelinesData);
        setStations(stationsData);
        setKpFeatures(kpData);

        // Auto select first critical or high risk KP as default inspection
        const highRiskKP = kpData.find((kp) => kp.risk_class === 'Critical') || kpData[0];
        if (highRiskKP) {
          setSelectedKP(highRiskKP);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Keyboard navigation for accessibility: arrows to pan, +/- to zoom
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map = mapRef.current;
      if (!map) return;
      if (e.key === 'ArrowUp') { map.panBy([0, -120]); e.preventDefault(); }
      if (e.key === 'ArrowDown') { map.panBy([0, 120]); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { map.panBy([-120, 0]); e.preventDefault(); }
      if (e.key === 'ArrowRight') { map.panBy([120, 0]); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') { map.zoomIn(); e.preventDefault(); }
      if (e.key === '-') { map.zoomOut(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Simple helpers to approximate meter offsets in degrees
  const metersToDegLat = (m: number) => m / 111320;
  const metersToDegLon = (m: number, lat: number) => m / (111320 * Math.cos((lat * Math.PI) / 180));

  function computeOffsetLine(coords: [number, number][], offsetMeters: number) {
    if (!coords || coords.length < 2) return coords.map((c) => [c[1], c[0]] as [number, number]);
    const out: [number, number][] = [];
    for (let i = 0; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      const prev = coords[Math.max(0, i - 1)];
      const next = coords[Math.min(coords.length - 1, i + 1)];
      const vx = next[0] - prev[0];
      const vy = next[1] - prev[1];
      const nx = -vy;
      const ny = vx;
      const norm = Math.sqrt(nx * nx + ny * ny) || 1e-9;
      const ux = nx / norm;
      const uy = ny / norm;
      const dlat = metersToDegLat(offsetMeters * uy);
      const dlon = metersToDegLon(offsetMeters * ux, lat);
      out.push([lat + dlat, lon + dlon]);
    }
    return out;
  }

  // Filtered KP features
  const filteredKPs = useMemo(() => {
    return kpFeatures.filter((kp) => {
      if (selectedPipelineId !== null && kp.pipeline_id !== selectedPipelineId) return false;
      if (riskFilter !== 'all' && kp.risk_class.toLowerCase() !== riskFilter.toLowerCase()) return false;
      if (hazardFilter !== 'all' && !kp.primary_hazard.toLowerCase().includes(hazardFilter.toLowerCase())) return false;
      return true;
    });
  }, [kpFeatures, selectedPipelineId, riskFilter, hazardFilter]);

  // Overall Statistics
  const stats = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let totalPoF = 0;

    for (const kp of filteredKPs) {
      counts[kp.risk_class] = (counts[kp.risk_class] || 0) + 1;
      totalPoF += kp.failure_probability;
    }

    const total = filteredKPs.length;
    const avgPoF = total > 0 ? (totalPoF / total) * 100 : 0;

    return { ...counts, total, avgPoF };
  }, [filteredKPs]);

  // Handle station click -> center map
  const handleStationClick = (st: MeteringStation) => {
    setSelectedStation(st);
    setMapCenter([st.coordinates[1], st.coordinates[0]]);
    setMapZoom(12);
  };

  // Handle KP post click
  const handleKPClick = (kp: KPFeature) => {
    setSelectedKP(kp);
    setMapCenter([kp.latitude, kp.longitude]);
    setMapZoom(12);
  };

  const panAmount = 80;

  const handlePan = (deltaX: number, deltaY: number) => {
    const map = mapRef.current;
    if (map) {
      map.panBy([deltaX, deltaY]);
    }
  };

  const handleResetView = () => {
    setMapCenter([7.62, 6.7]);
    setMapZoom(10);
  };

  const handleZoomIn = () => {
    const map = mapRef.current;
    if (map) {
      map.zoomIn();
      return;
    }
    setMapZoom((prev) => Math.min(prev + 1, 18));
  };

  const handleZoomOut = () => {
    const map = mapRef.current;
    if (map) {
      map.zoomOut();
      return;
    }
    setMapZoom((prev) => Math.max(prev - 1, 3));
  };

  const currentTile = TILE_LAYERS[activeLayer];

  return (
    <div className="app-shell">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">🔥</div>
            <div>
              <h1>Pipe.AI</h1>
              <span className="badge-live">Quantitative Geo-Hazard Engine</span>
            </div>
          </div>
          <p className="subtitle">
            Kogi Pipelines Failure Probability & 6 Geo-Hazard Determinants Inspector
          </p>
        </div>

        {/* Quick Station Selector Bar */}
        <div className="station-quick-bar">
          <div className="bar-title">Metering Stations & Terminals</div>
          <div className="station-chips">
            {stations.map((st) => (
              <button
                key={st.id}
                className={`chip-btn ${selectedStation?.id === st.id ? 'active' : ''}`}
                onClick={() => handleStationClick(st)}
              >
                📍 {st.name.split('(')[0].replace('Metering Station', 'MS').replace('Power & Gas', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Stats summary bar */}
        {!loading && !error && (
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value critical">{stats.Critical}</span>
              <span className="stat-label">Critical KPs</span>
            </div>
            <div className="stat-item">
              <span className="stat-value high">{stats.High}</span>
              <span className="stat-label">High Risk</span>
            </div>
            <div className="stat-item">
              <span className="stat-value medium">{stats.Medium}</span>
              <span className="stat-label">Medium</span>
            </div>
            <div className="stat-item">
              <span className="stat-value low">{stats.Low}</span>
              <span className="stat-label">Low Risk</span>
            </div>
          </div>
        )}

        {/* Filters bar */}
        <div className="filter-panel">
          <div className="filter-group">
            <label>Filter Route</label>
            <select
              value={selectedPipelineId ?? 'all'}
              onChange={(e) =>
                setSelectedPipelineId(e.target.value === 'all' ? null : Number(e.target.value))
              }
            >
              <option value="all">All Pipelines (4 Routes)</option>
              {pipelines?.features.map((f) => (
                <option key={f.properties.pipeline_id} value={f.properties.pipeline_id}>
                  {f.properties.code} — {f.properties.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Risk Level</label>
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="all">All Risks</option>
                <option value="critical">Critical (≥60%)</option>
                <option value="high">High (38-59%)</option>
                <option value="medium">Medium (20-37%)</option>
                <option value="low">Low (&lt;20%)</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Geo-Hazard Cause</label>
              <select value={hazardFilter} onChange={(e) => setHazardFilter(e.target.value)}>
                <option value="all">All Hazards</option>
                <option value="hydrodynamic">River Niger Scour</option>
                <option value="slope">Slope / Landslide</option>
                <option value="seismic">Seismic Fault</option>
                <option value="corrosive">Groundwater Corrosion</option>
                <option value="erosion">Soil Erosion</option>
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label htmlFor="rendering-effect-toggle">Pipeline Rendering</label>
              <div className="rendering-controls">
                <button
                  id="rendering-effect-toggle"
                  className={`chip-btn ${show3D ? 'active' : ''}`}
                  onClick={() => setShow3D((s) => !s)}
                >
                  {show3D ? '3D Effect On' : '3D Effect Off'}
                </button>
                <div className="slider-wrapper">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={threeDIntensity}
                    onChange={(e) => setThreeDIntensity(Number(e.target.value))}
                    aria-label="Pipeline elevation effect intensity"
                    className="range-slider"
                  />
                  <span className="slider-value">{threeDIntensity}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {selectedPipeline && (
          <div className="diagnostic-card">
            <div className="card-header">
              <div className="kp-badge">{selectedPipeline.properties.code}</div>
              <span className={`risk-pill ${selectedPipeline.properties.risk_label.toLowerCase()}`}>
                {selectedPipeline.properties.risk_label} Risk
              </span>
            </div>

            <div className="hazard-box">
              <div className="hazard-title">
                <h4>{selectedPipeline.properties.name}</h4>
              </div>
              <p className="diagnostic-text">
                {selectedPipeline.properties.commissioning_note ??
                  'Pipeline status data is not available for this route.'}
              </p>
            </div>

            <div className="env-grid">
              <div className="env-item">
                <span className="env-label">Construction Age</span>
                <span className="env-val">
                  {selectedPipeline.properties.construction_age_years ?? 0} years
                </span>
              </div>
              <div className="env-item">
                <span className="env-label">Operational Age</span>
                <span className="env-val">
                  {selectedPipeline.properties.operational_age_years ?? 0} years
                </span>
              </div>
              <div className="env-item">
                <span className="env-label">Flag-off</span>
                <span className="env-val small">
                  {selectedPipeline.properties.construction_start_date ?? 'N/A'}
                </span>
              </div>
              <div className="env-item">
                <span className="env-label">Operational Status</span>
                <span className="env-val small">
                  {selectedPipeline.properties.operational_status ?? 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && <div className="error-banner">{error}</div>}

        {/* Detailed KP Failure Inspector Card */}
        {selectedKP ? (
          <div className="diagnostic-card">
            <div className="card-header">
              <div className="kp-badge">KP {selectedKP.kp} km</div>
              <span className={`risk-pill ${selectedKP.risk_class.toLowerCase()}`}>
                {selectedKP.risk_class} Risk
              </span>
            </div>

            {/* Failure Probability Gauge */}
            <div className="pof-gauge-section">
              <div className="pof-header">
                <span className="pof-title">Probability of Failure (PoF)</span>
                <span
                  className="pof-percent"
                  style={{ color: RISK_COLORS[selectedKP.risk_class] }}
                >
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

            {/* 6 QUANTITATIVE GEO-HAZARD DETERMINANTS SCORE BREAKDOWN */}
            <div className="determinants-section">
              <div className="determinants-title">📊 6 Quantitative Determinant Factors</div>
              <div className="det-list">
                {/* 1. Flooding */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌊 Flooding & River Scour Index</span>
                    <span className="det-score">{(selectedKP.flooding_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill hydro" style={{ width: `${(selectedKP.flooding_index ?? 0) * 100}%` }} />
                  </div>
                </div>

                {/* 2. Earthquake */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌋 Earthquake & Seismic Factor</span>
                    <span className="det-score">{(selectedKP.earthquake_factor ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill seismic" style={{ width: `${(selectedKP.earthquake_factor ?? 0) * 100}%` }} />
                  </div>
                </div>

                {/* 3. Severe Erosion */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌧️ Severe Rainfall Erosion Factor</span>
                    <span className="det-score">{(selectedKP.erosion_factor ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill erosion" style={{ width: `${(selectedKP.erosion_factor ?? 0) * 100}%` }} />
                  </div>
                </div>

                {/* 4. Landslide */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🏔️ Landslide & Slope Instability</span>
                    <span className="det-score">{(selectedKP.landslide_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill landslide" style={{ width: `${(selectedKP.landslide_index ?? 0) * 100}%` }} />
                  </div>
                </div>

                {/* 5. Corrosive Soil */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🧪 Corrosive Soil & Groundwater</span>
                    <span className="det-score">{(selectedKP.soil_corrosivity_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill corrosion" style={{ width: `${(selectedKP.soil_corrosivity_index ?? 0) * 100}%` }} />
                  </div>
                </div>

                {/* 6. Operating Stress */}
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">⚙️ Hoop Stress Ratio (SMYS)</span>
                    <span className="det-score">{(selectedKP.hoop_stress_ratio ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill stress" style={{ width: `${(selectedKP.hoop_stress_ratio ?? 0) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Geo-Hazard Diagnostic Failure Cause */}
            <div className="hazard-box">
              <div className="hazard-title">
                <span className="hazard-code">{selectedKP.failure_code}</span>
                <h4>{selectedKP.primary_hazard}</h4>
              </div>
              <p className="diagnostic-text">{selectedKP.diagnostic_message}</p>
            </div>

            {/* Key Environmental Features Grid */}
            <div className="env-grid">
              <div className="env-item">
                <span className="env-label">Elevation</span>
                <span className="env-val">{selectedKP.elevation} m</span>
              </div>
              <div className="env-item">
                <span className="env-label">Slope Angle</span>
                <span className="env-val">{selectedKP.slope_deg}°</span>
              </div>
              <div className="env-item">
                <span className="env-label">River Proximity</span>
                <span className="env-val">{selectedKP.river_proximity_km} km</span>
              </div>
              <div className="env-item">
                <span className="env-label">Fault Distance</span>
                <span className="env-val">{selectedKP.fault_distance_km} km</span>
              </div>
              <div className="env-item">
                <span className="env-label">Soil Type</span>
                <span className="env-val small">{selectedKP.soil_type}</span>
              </div>
              <div className="env-item">
                <span className="env-label">Pipe Spec</span>
                <span className="env-val">
                  {selectedKP.pipe_diameter_inches}" | {selectedKP.pipe_material}
                </span>
              </div>
            </div>

            {/* Recommended Engineering Action */}
            <div className="remediation-box">
              <h5>🔧 Recommended Remediation Action</h5>
              <p>{selectedKP.remediation_plan}</p>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">📍</div>
            <p>Click any KP post marker on the map or select from the list below to run diagnostic inspection.</p>
          </div>
        )}

        {/* KP Post List */}
        <div className="kp-list-section">
          <div className="section-title">
            Kilometer Posts ({filteredKPs.length} sampled KPs)
          </div>
          <div className="kp-list">
            {filteredKPs.map((kp) => {
              const isSelected = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              const riskClass = kp.risk_class.toLowerCase();
              return (
                <div
                  key={`${kp.pipeline_id}-${kp.kp}`}
                  className={`kp-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleKPClick(kp)}
                >
                  <div className={`risk-dot ${riskClass}`} />
                  <div className="kp-info">
                    <div className="kp-name">
                      {kp.pipeline_code} — KP {kp.kp} km
                    </div>
                    <div className="kp-meta">
                      {kp.primary_hazard}
                    </div>
                  </div>
                  <div className={`pof-badge ${riskClass}`}>
                    {kp.failure_probability_percent}% PoF
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ==================== MAP PANEL ==================== */}
      <main className="map-panel">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span className="loading-text">Loading Quantitative Geo-Hazard Determinants…</span>
          </div>
        )}

        {/* Layer toggle */}
        <div className="layer-toggle">
          {(Object.keys(TILE_LAYERS) as LayerKey[]).map((key) => (
            <button
              key={key}
              className={`layer-btn ${activeLayer === key ? 'active' : ''}`}
              onClick={() => setActiveLayer(key)}
            >
              {key === 'dark' ? '🌑 Dark GIS' : key === 'satellite' ? '🛰 Satellite' : '🏔 Terrain'}
            </button>
          ))}
        </div>

        <div className="map-control-panel" aria-label="Map navigation controls">
          <div className="map-control-row">
            <button type="button" className="control-btn" onClick={() => handlePan(0, -panAmount)} aria-label="Pan map up">↑</button>
          </div>
          <div className="map-control-row">
            <button type="button" className="control-btn" onClick={() => handlePan(-panAmount, 0)} aria-label="Pan map left">←</button>
            <button type="button" className="control-btn control-center" onClick={handleResetView} aria-label="Reset map center">⦿</button>
            <button type="button" className="control-btn" onClick={() => handlePan(panAmount, 0)} aria-label="Pan map right">→</button>
          </div>
          <div className="map-control-row">
            <button type="button" className="control-btn" onClick={() => handlePan(0, panAmount)} aria-label="Pan map down">↓</button>
          </div>
          <div className="map-control-row map-zoom-row">
            <button type="button" className="zoom-btn" onClick={handleZoomIn} aria-label="Zoom in">＋</button>
            <button type="button" className="zoom-btn" onClick={handleZoomOut} aria-label="Zoom out">－</button>
          </div>
        </div>

        {/* Map Container */}
        <div
          className="accessible-map-wrapper"
          role="application"
          aria-label="Pipeline risk map"
          tabIndex={0}
        >
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
            className="accessible-map"
          >
            <MapUpdater center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
            <TileLayer
              key={activeLayer}
              attribution={currentTile.attribution}
              url={currentTile.url}
            />

            {/* Holographic pipeline rendering with glow and flow accents */}
            {pipelines?.features.map((f: any, idx: number) => {
              const coords = f.geometry.coordinates as [number, number][];
              const props = f.properties as PipelineProperties;
              const isSelected = selectedPipelineId === props.pipeline_id;
              const routeColor = RISK_COLORS[props.risk_label] || '#7c3aed';
              const intensity = show3D ? threeDIntensity : 0;
              const shadow = computeOffsetLine(coords, intensity * 0.6) as LatLngExpression[];
              const highlight = computeOffsetLine(coords, intensity * 0.2) as LatLngExpression[];
              const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

              return (
                <Fragment key={`pl-${idx}`}>
                  {show3D && (
                    <Polyline
                      positions={shadow}
                      pathOptions={{
                        color: 'rgba(99, 102, 241, 0.18)',
                        weight: 18,
                        opacity: 0.45,
                        lineCap: 'round',
                        lineJoin: 'round',
                        className: 'pipeline-halo',
                      }}
                    />
                  )}
                  <Polyline
                    positions={route}
                    pathOptions={{
                      color: routeColor,
                      weight: isSelected ? 12 : 8,
                      opacity: 0.9,
                      lineCap: 'round',
                      lineJoin: 'round',
                      className: `pipeline-core ${isSelected ? 'selected' : ''}`,
                    }}
                  />
                  <Polyline
                    positions={highlight}
                    pathOptions={{
                      color: '#f8fafc',
                      weight: isSelected ? 3 : 2,
                      opacity: 0.75,
                      dashArray: '10, 12',
                      lineCap: 'round',
                      lineJoin: 'round',
                      className: 'pipeline-highlight',
                    }}
                  />
                </Fragment>
              );
            })}

            {/* Metering Station Markers */}
            {stations.map((st) => (
              <Marker
                key={st.id}
                position={[st.coordinates[1], st.coordinates[0]]}
                icon={stationIcon(st.name, st.id === 'ST-01')}
                eventHandlers={{
                  click: () => handleStationClick(st),
                }}
              >
                <Popup className="station-popup">
                  <div>
                    <h3>⚡ {st.name}</h3>
                    <p><strong>Type:</strong> {st.type}</p>
                    <p><strong>Capacity:</strong> {st.capacity_mmscfd} MMSCFD</p>
                    <p><strong>Location:</strong> Kogi State, Nigeria</p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* KP Circle Markers along pipelines */}
            {filteredKPs.map((kp) => {
              const isSelected = selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id;
              return (
                <CircleMarker
                  key={`kp-${kp.pipeline_id}-${kp.kp}`}
                  center={[kp.latitude, kp.longitude]}
                  radius={isSelected ? 9 : kp.risk_class === 'Critical' ? 7 : 5}
                  pathOptions={{
                    fillColor: RISK_COLORS[kp.risk_class],
                    fillOpacity: isSelected ? 1.0 : 0.85,
                    color: isSelected ? '#ffffff' : '#000000',
                    weight: isSelected ? 3 : 1,
                  }}
                  eventHandlers={{
                    click: () => handleKPClick(kp),
                  }}
                >
                  <Popup className="kp-popup">
                    <div className="popup-content">
                      <div className="popup-header">
                        <strong>{kp.pipeline_code} — KP {kp.kp} km</strong>
                        <span className={`popup-risk ${kp.risk_class.toLowerCase()}`}>
                          {kp.risk_class} Risk
                        </span>
                      </div>
                      <div className="popup-body">
                        <p><strong>PoF:</strong> {kp.failure_probability_percent}%</p>
                        <p><strong>Primary Cause:</strong> {kp.primary_hazard}</p>
                        <p><strong>Flood Index:</strong> {(kp.flooding_index ?? 0).toFixed(2)} | <strong>Seismic Factor:</strong> {(kp.earthquake_factor ?? 0).toFixed(2)}</p>
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
          <h3>Probability of Failure (PoF)</h3>
          <div className="legend-item">
            <div className="legend-line critical" />
            <span className="legend-text">Critical (≥60% PoF)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line high" />
            <span className="legend-text">High Risk (38-59% PoF)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line medium" />
            <span className="legend-text">Medium (20-37% PoF)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line low" />
            <span className="legend-text">Low Risk (&lt;20% PoF)</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
