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

// Risk Colors
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

// High-Resolution Tile Layers (Vivid Satellite & Buildings)
const TILE_LAYERS = {
  satellite: {
    label: '🛰 Vivid Google Satellite Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps / Maxar High-Res Satellite',
    maxZoom: 20,
    maxNativeZoom: 19,
  },
  esri_streets: {
    label: '🏢 High-Res Buildings & Infrastructure',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, CNES/Airbus',
    maxZoom: 19,
    maxNativeZoom: 18,
  },
  dark: {
    label: '🌑 Dark Tactical GIS',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
    maxNativeZoom: 18,
  },
  terrain: {
    label: '🏔 3D Topographic Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap | &copy; OpenTopoMap',
    maxZoom: 17,
    maxNativeZoom: 16,
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

// 3D Industrial Complex and Building Landmarks along the Pipeline Corridors
const INDUSTRIAL_BUILDINGS = [
  {
    id: 'FAC-01',
    name: 'Ajaokuta Steel Plant & Central Gas Terminal Hub',
    type: 'Steel & Gas Terminal Mega-Complex',
    coordinates: [7.5564, 6.6552] as [number, number], // [lat, lon]
    polygon: [
      [7.5420, 6.6420],
      [7.5420, 6.6720],
      [7.5720, 6.6720],
      [7.5720, 6.6420],
    ] as [number, number][],
    description: 'Main Blast Furnace units, Rolling Mills, Thermal Captive Power Plant, and Terminal Gas Injection Station.',
    buildingsCount: 38,
    status: 'Operational Injection Hub',
    icon: '🏭',
    color: '#06b6d4',
  },
  {
    id: 'FAC-02',
    name: 'Geregu I & II Thermal Power Generating Station',
    type: 'Thermal Gas Power Station (884 MW)',
    coordinates: [7.4716, 6.6603] as [number, number],
    polygon: [
      [7.4620, 6.6520],
      [7.4620, 6.6700],
      [7.4810, 6.6700],
      [7.4810, 6.6520],
    ] as [number, number][],
    description: 'Phase I (414 MW) and Phase II (470 MW) Siemens Gas Turbines, 330kV Switchyard, and Metering Substation.',
    buildingsCount: 16,
    status: 'Active Generation',
    icon: '⚡',
    color: '#f59e0b',
  },
  {
    id: 'FAC-03',
    name: 'Obajana Cement Mega-Plant Complex',
    type: 'Cement Pyroprocessing & Clinker Works (13.25 MTPA)',
    coordinates: [7.9150, 6.4350] as [number, number],
    polygon: [
      [7.9020, 6.4220],
      [7.9020, 6.4520],
      [7.9280, 6.4520],
      [7.9280, 6.4220],
    ] as [number, number][],
    description: '4 Rotary Kiln Lines, Clinker Silos, 135 MW Captive Gas Power Plant, Limestone Quarry Conveyors.',
    buildingsCount: 52,
    status: 'Continuous Industrial Supply',
    icon: '🏗️',
    color: '#ec4899',
  },
  {
    id: 'FAC-04',
    name: 'Lokoja Inland Port & Confluence Operations Complex',
    type: 'Maritime River Logistics & Confluence Hub',
    coordinates: [7.7300, 6.7400] as [number, number],
    polygon: [
      [7.7180, 6.7280],
      [7.7180, 6.7520],
      [7.7420, 6.7520],
      [7.7420, 6.7280],
    ] as [number, number][],
    description: 'River Niger dockyards, administrative headquarters, fuel jetties, and confluence crossing monitor station.',
    buildingsCount: 22,
    status: 'Active Port Base',
    icon: '🚢',
    color: '#3b82f6',
  },
  {
    id: 'FAC-05',
    name: 'Jamata River Niger HDD Crossing Rig Site',
    type: 'Sub-River Directional Drilling Installation',
    coordinates: [7.8500, 6.8900] as [number, number],
    polygon: [
      [7.8380, 6.8800],
      [7.8380, 6.9020],
      [7.8620, 6.9020],
      [7.8620, 6.8800],
    ] as [number, number][],
    description: 'Heavy Horizontal Directional Drilling (HDD) entry/exit launch pads, articulated concrete mat anchoring.',
    buildingsCount: 8,
    status: 'Submerged Cross-River Node',
    icon: '🌊',
    color: '#06b6d4',
  },
  {
    id: 'FAC-06',
    name: 'Ahoko Block Valve Station (AKK KP 72)',
    type: 'Automated Isolation Valve & Flare Station',
    coordinates: [8.1200, 7.1500] as [number, number],
    polygon: [
      [8.1100, 7.1400],
      [8.1100, 7.1620],
      [8.1300, 7.1620],
      [8.1300, 7.1400],
    ] as [number, number][],
    description: 'Mainline automated shutdown valves, flare knockout drum, cathodic protection test station.',
    buildingsCount: 6,
    status: 'Mainline Safety Node',
    icon: '🛑',
    color: '#ef4444',
  },
];

// Physical Geo-Hazard Spatial Corridors
const FLOOD_SCOUR_CORRIDOR: [number, number][] = [
  [7.5200, 6.6400],
  [7.5700, 6.6700],
  [7.6200, 6.7000],
  [7.7100, 6.7600],
  [7.8200, 6.8700],
  [7.9000, 6.9200],
  [7.9200, 6.8800],
  [7.8000, 6.8200],
  [7.6800, 6.7200],
  [7.5900, 6.6600],
  [7.5000, 6.6200],
];

const SEISMIC_FAULT_TRACE: [number, number][] = [
  [7.3500, 6.4500],
  [7.5800, 6.6200],
  [7.7800, 6.8200],
  [8.0500, 7.0500],
  [8.2500, 7.2200],
];

// Custom Facility Marker Icon
const facilityIcon = (icon: string, name: string, type: string) =>
  L.divIcon({
    className: 'custom-facility-icon',
    html: `
      <div class="facility-marker">
        <div class="facility-pulse"></div>
        <div class="facility-badge">${icon}</div>
        <div class="facility-label-card">
          <span class="facility-title">${name}</span>
          <span class="facility-sub">${type}</span>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

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
  const [selectedFacility, setSelectedFacility] = useState<any | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('satellite');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [hazardFilter, setHazardFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show3D, setShow3D] = useState<boolean>(true);
  const [tiltPitch, setTiltPitch] = useState<number>(28);
  const [threeDIntensity, setThreeDIntensity] = useState<number>(18);
  
  // Layer Overlay Toggles
  const [showBuildings, setShowBuildings] = useState<boolean>(true);
  const [showFloodZone, setShowFloodZone] = useState<boolean>(true);
  const [showFaultLine, setShowFaultLine] = useState<boolean>(true);

  const mapRef = useRef<LeafletMap | null>(null);

  const selectedPipeline = useMemo(() => {
    if (!pipelines || pipelines.features.length === 0) return null;
    return (
      pipelines.features.find((feature) => feature.properties.pipeline_id === selectedPipelineId) ??
      pipelines.features[0]
    );
  }, [pipelines, selectedPipelineId]);

  // Default centered on Ajaokuta / Kogi State
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(11);

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

  // Keyboard navigation
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

  const metersToDegLat = (m: number) => m / 111320;
  const metersToDegLon = (m: number, lat: number) => m / (111320 * Math.cos((lat * Math.PI) / 180));

  function computeOffsetLine(coords: [number, number][], offsetMeters: number) {
    if (!coords || coords.length < 2) return coords.map((c) => [c[1], c[0]] as [number, number]);
    const out: [number, number][] = [];
    for (let i = 0; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      const dlat = metersToDegLat(offsetMeters * 35.0);
      const dlon = metersToDegLon(offsetMeters * 18.0, lat);
      out.push([lat + dlat, lon + dlon]);
    }
    return out;
  }

  const filteredKPs = useMemo(() => {
    return kpFeatures.filter((kp) => {
      if (selectedPipelineId !== null && kp.pipeline_id !== selectedPipelineId) return false;
      if (riskFilter !== 'all' && kp.risk_class.toLowerCase() !== riskFilter.toLowerCase()) return false;
      if (hazardFilter !== 'all' && !kp.primary_hazard.toLowerCase().includes(hazardFilter.toLowerCase())) return false;
      return true;
    });
  }, [kpFeatures, selectedPipelineId, riskFilter, hazardFilter]);

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

  const handleStationClick = (st: MeteringStation) => {
    setSelectedStation(st);
    setMapCenter([st.coordinates[1], st.coordinates[0]]);
    setMapZoom(14);
  };

  const handleFacilityClick = (fac: any) => {
    setSelectedFacility(fac);
    setMapCenter(fac.coordinates);
    setMapZoom(15);
  };

  const handleKPClick = (kp: KPFeature) => {
    setSelectedKP(kp);
    setMapCenter([kp.latitude, kp.longitude]);
    setMapZoom(14);
  };

  const panAmount = 80;

  const handlePan = (deltaX: number, deltaY: number) => {
    const map = mapRef.current;
    if (map) map.panBy([deltaX, deltaY]);
  };

  const handleResetView = () => {
    setMapCenter([7.62, 6.7]);
    setMapZoom(11);
  };

  const handleZoomIn = () => {
    const map = mapRef.current;
    if (map) { map.zoomIn(); return; }
    setMapZoom((prev) => Math.min(prev + 1, 19));
  };

  const handleZoomOut = () => {
    const map = mapRef.current;
    if (map) { map.zoomOut(); return; }
    setMapZoom((prev) => Math.max(prev - 1, 3));
  };

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
              <span className="badge-live">3D GIS Industrial Twin</span>
            </div>
          </div>
          <p className="subtitle">
            Kogi Pipelines Failure Probability, Corrosion & 6 Geo-Hazard Determinants Engine
          </p>
        </div>

        {/* 3D Industrial Complex & Metering Hubs Bar */}
        <div className="station-quick-bar">
          <div className="bar-title">🏢 Key Industrial Complexes & Plants</div>
          <div className="station-chips">
            {INDUSTRIAL_BUILDINGS.map((fac) => (
              <button
                key={fac.id}
                className={`chip-btn ${selectedFacility?.id === fac.id ? 'active' : ''}`}
                onClick={() => handleFacilityClick(fac)}
              >
                {fac.icon} {fac.name.split(' ')[0]} {fac.name.split(' ')[1]}
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

        {/* Filters panel */}
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
              <label htmlFor="rendering-effect-toggle">3D Pipeline & Terrain Perspective</label>
              <div className="rendering-controls" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    id="rendering-effect-toggle"
                    className={`chip-btn ${show3D ? 'active' : ''}`}
                    onClick={() => setShow3D((s) => !s)}
                    style={{ flex: 1 }}
                  >
                    {show3D ? '✨ 3D Mode: Active' : '2D Flat Mode'}
                  </button>
                  {show3D && (
                    <>
                      <button
                        className={`chip-btn ${tiltPitch === 0 ? 'active' : ''}`}
                        onClick={() => setTiltPitch(0)}
                        title="Top-down 0°"
                      >
                        0°
                      </button>
                      <button
                        className={`chip-btn ${tiltPitch === 25 ? 'active' : ''}`}
                        onClick={() => setTiltPitch(25)}
                        title="Isometric 25°"
                      >
                        25°
                      </button>
                      <button
                        className={`chip-btn ${tiltPitch === 38 ? 'active' : ''}`}
                        onClick={() => setTiltPitch(38)}
                        title="Cinematic 38°"
                      >
                        38°
                      </button>
                    </>
                  )}
                </div>
                {show3D && (
                  <div className="slider-wrapper">
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>3D Altitude Relief</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={threeDIntensity}
                      onChange={(e) => setThreeDIntensity(Number(e.target.value))}
                      aria-label="Pipeline elevation effect intensity"
                      className="range-slider"
                    />
                    <span className="slider-value">{threeDIntensity}m</span>
                  </div>
                )}
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

        {/* Error banner */}
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

            {/* 6 Quantitative Geo-Hazard Determinants */}
            <div className="determinants-section">
              <div className="determinants-title">📊 6 Quantitative Determinant Factors</div>
              <div className="det-list">
                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌊 Flooding & River Scour Index</span>
                    <span className="det-score">{(selectedKP.flooding_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill hydro" style={{ width: `${(selectedKP.flooding_index ?? 0) * 100}%` }} />
                  </div>
                </div>

                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌋 Earthquake & Seismic Factor</span>
                    <span className="det-score">{(selectedKP.earthquake_factor ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill seismic" style={{ width: `${(selectedKP.earthquake_factor ?? 0) * 100}%` }} />
                  </div>
                </div>

                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🌧️ Severe Rainfall Erosion Factor</span>
                    <span className="det-score">{(selectedKP.erosion_factor ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill erosion" style={{ width: `${(selectedKP.erosion_factor ?? 0) * 100}%` }} />
                  </div>
                </div>

                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🏔️ Landslide & Slope Instability</span>
                    <span className="det-score">{(selectedKP.landslide_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill landslide" style={{ width: `${(selectedKP.landslide_index ?? 0) * 100}%` }} />
                  </div>
                </div>

                <div className="det-item">
                  <div className="det-header">
                    <span className="det-name">🧪 Corrosive Soil & Groundwater</span>
                    <span className="det-score">{(selectedKP.soil_corrosivity_index ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="det-bar-bg">
                    <div className="det-bar-fill corrosion" style={{ width: `${(selectedKP.soil_corrosivity_index ?? 0) * 100}%` }} />
                  </div>
                </div>

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

            {/* Wall Thickness & Corrosion Degradation Section */}
            {selectedKP.remaining_wall_thickness_mm !== undefined && (
              <div className="degradation-section">
                <div className="degradation-header">
                  <span className="det-name" style={{ fontWeight: 700 }}>🛡️ Wall Thickness & Degradation</span>
                  <span className={`deg-condition-badge ${(selectedKP.degradation_condition || 'Normal').toLowerCase()}`}>
                    {selectedKP.degradation_condition || 'Normal'} Condition
                  </span>
                </div>
                <div className="deg-grid">
                  <div className="deg-stat">
                    <span className="deg-stat-label">Remaining Wall</span>
                    <span className="deg-stat-val">
                      {selectedKP.remaining_wall_thickness_mm} mm
                      <span className="deg-stat-sub"> / {selectedKP.design_wall_thickness_mm} mm</span>
                    </span>
                  </div>
                  <div className="deg-stat">
                    <span className="deg-stat-label">Wall Thinning Loss</span>
                    <span className="deg-stat-val loss">
                      -{selectedKP.thickness_loss_mm} mm
                      <span className="deg-stat-sub"> ({selectedKP.material_loss_percent}% loss)</span>
                    </span>
                  </div>
                </div>
                <div className="pof-bar-bg" style={{ marginTop: '8px' }}>
                  <div
                    className={`pof-bar-fill ${(selectedKP.degradation_condition || 'Normal').toLowerCase()}`}
                    style={{ width: `${Math.min(100, selectedKP.material_loss_percent || 0)}%` }}
                  />
                </div>
              </div>
            )}

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
            <p>Click any KP post marker or industrial complex on the map to run diagnostic inspection.</p>
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
              {key === 'satellite'
                ? '🛰 Vivid Satellite HD'
                : key === 'esri_streets'
                ? '🏢 Buildings & Infra'
                : key === 'dark'
                ? '🌑 Dark Tactical'
                : '🏔 3D Terrain'}
            </button>
          ))}
        </div>

        {/* Floating Hazard & Building Overlays Panel */}
        <div className="map-hazard-toggles">
          <div className="toggle-header">🗺 Spatial GIS Overlays</div>
          <label className="hazard-toggle-item">
            <input
              type="checkbox"
              checked={showBuildings}
              onChange={(e) => setShowBuildings(e.target.checked)}
            />
            🏢 3D Facilities & Buildings
          </label>
          <label className="hazard-toggle-item">
            <input
              type="checkbox"
              checked={showFloodZone}
              onChange={(e) => setShowFloodZone(e.target.checked)}
            />
            🌊 River Niger Scour Zone
          </label>
          <label className="hazard-toggle-item">
            <input
              type="checkbox"
              checked={showFaultLine}
              onChange={(e) => setShowFaultLine(e.target.checked)}
            />
            🌋 Active Seismic Fault Trace
          </label>
        </div>

        {/* Navigation Controls */}
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
          className={`accessible-map-wrapper ${show3D ? 'mode-3d' : ''}`}
          role="application"
          aria-label="Pipeline risk map"
          tabIndex={0}
          style={{
            perspective: show3D && tiltPitch > 0 ? '1100px' : 'none',
            overflow: 'hidden',
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          <div
            className="map-3d-viewport"
            style={{
              width: '100%',
              height: '100%',
              transform: show3D && tiltPitch > 0 ? `rotateX(${tiltPitch}deg) scale(1.08) translateY(-16px)` : 'none',
              transformOrigin: '50% 85%',
              transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              maxZoom={20}
              scrollWheelZoom
              style={{ width: '100%', height: '100%' }}
              className="accessible-map"
            >
              <MapUpdater center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
              <TileLayer
                key={activeLayer}
                attribution={currentTile.attribution}
                url={currentTile.url}
                maxZoom={currentTile.maxZoom}
              />

              {/* 🌊 River Niger Flood Scour Inundation Zone */}
              {showFloodZone && (
                <Polygon
                  positions={FLOOD_SCOUR_CORRIDOR}
                  pathOptions={{
                    color: '#06b6d4',
                    fillColor: '#0891b2',
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: '8, 10',
                    className: 'flood-scour-poly',
                  }}
                >
                  <Tooltip sticky>
                    🌊 <strong>River Niger Hydrodynamic Scour Corridor</strong><br />
                    High bed erosion and pipe un-seating risk zone
                  </Tooltip>
                </Polygon>
              )}

              {/* 🌋 Active Lokoja Seismic Fault Fracture Line */}
              {showFaultLine && (
                <Polyline
                  positions={SEISMIC_FAULT_TRACE}
                  pathOptions={{
                    color: '#ef4444',
                    weight: 4,
                    dashArray: '12, 10',
                    className: 'fault-fracture-line',
                  }}
                >
                  <Tooltip sticky>
                    🌋 <strong>Active Lokoja–Koton Karfe Fault Trace</strong><br />
                    Lateral shear ground motion hazard
                  </Tooltip>
                </Polyline>
              )}

              {/* 🏢 Industrial Plant Building Complexes & 3D Footprints */}
              {showBuildings &&
                INDUSTRIAL_BUILDINGS.map((fac) => (
                  <Fragment key={fac.id}>
                    <Polygon
                      positions={fac.polygon}
                      pathOptions={{
                        color: fac.color,
                        fillColor: fac.color,
                        fillOpacity: 0.28,
                        weight: 2.5,
                        className: 'building-complex-poly',
                      }}
                      eventHandlers={{
                        click: () => handleFacilityClick(fac),
                      }}
                    >
                      <Tooltip sticky>
                        <strong>{fac.icon} {fac.name}</strong><br />
                        {fac.type} ({fac.buildingsCount} Industrial Units)
                      </Tooltip>
                    </Polygon>

                    <Marker
                      position={fac.coordinates}
                      icon={facilityIcon(fac.icon, fac.name.split(' ')[0] + ' ' + (fac.name.split(' ')[1] || ''), fac.type.split('(')[0])}
                      eventHandlers={{
                        click: () => handleFacilityClick(fac),
                      }}
                    >
                      <Popup className="station-popup">
                        <div>
                          <h3>{fac.icon} {fac.name}</h3>
                          <p><strong>Type:</strong> {fac.type}</p>
                          <p><strong>Status:</strong> {fac.status}</p>
                          <p><strong>Facilities:</strong> {fac.buildingsCount} Building & Turbine Structures</p>
                          <p>{fac.description}</p>
                        </div>
                      </Popup>
                    </Marker>
                  </Fragment>
                ))}

              {/* Holographic 3D pipeline rendering with glow and flow accents */}
              {pipelines?.features.map((f: any, idx: number) => {
                const coords = f.geometry.coordinates as [number, number][];
                const props = f.properties as PipelineProperties;
                const isSelected = selectedPipelineId === props.pipeline_id;
                const routeColor = RISK_COLORS[props.risk_label] || '#7c3aed';
                const intensity = show3D ? threeDIntensity : 0;
                const shadow = computeOffsetLine(coords, -intensity * 0.4) as LatLngExpression[];
                const elevated = computeOffsetLine(coords, intensity * 0.8) as LatLngExpression[];
                const highlight = computeOffsetLine(coords, intensity * 0.85) as LatLngExpression[];
                const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

                return (
                  <Fragment key={`pl-${idx}`}>
                    {show3D && (
                      <>
                        <Polyline
                          positions={shadow}
                          pathOptions={{
                            color: '#020617',
                            weight: 18,
                            opacity: 0.55,
                            lineCap: 'round',
                            lineJoin: 'round',
                            className: 'pipeline-shadow',
                          }}
                        />
                        <Polyline
                          positions={elevated}
                          pathOptions={{
                            color: routeColor,
                            weight: isSelected ? 18 : 14,
                            opacity: 0.35,
                            lineCap: 'round',
                            lineJoin: 'round',
                            className: 'pipeline-halo',
                          }}
                        />
                      </>
                    )}
                    <Polyline
                      positions={show3D ? elevated : route}
                      pathOptions={{
                        color: routeColor,
                        weight: isSelected ? 10 : 7,
                        opacity: 1.0,
                        lineCap: 'round',
                        lineJoin: 'round',
                        className: `pipeline-core ${isSelected ? 'selected' : ''}`,
                      }}
                    />
                    <Polyline
                      positions={show3D ? highlight : route}
                      pathOptions={{
                        color: '#ffffff',
                        weight: isSelected ? 3 : 2,
                        opacity: 0.85,
                        dashArray: '10, 14',
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
                          {kp.remaining_wall_thickness_mm !== undefined && (
                            <p><strong>Wall Thickness:</strong> {kp.remaining_wall_thickness_mm}mm ({kp.degradation_condition || 'Normal'})</p>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
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
