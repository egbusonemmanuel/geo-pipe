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

// Simple, friendly risk color map
const RISK_COLORS: Record<RiskLevel, string> = {
  Low: '#10b981',      // Green - Safe & Healthy
  Medium: '#f59e0b',   // Yellow - Moderate Attention
  High: '#f97316',     // Orange - High Priority
  Critical: '#ef4444', // Red - Urgent Action
};

// Route Themes with friendly plain-English names
const ROUTE_THEMES: Record<number, { name: string; shortName: string; color: string; code: string; diameter: string; purpose: string }> = {
  1: {
    name: 'Ajaokuta–Kaduna–Kano (AKK) Section 1',
    shortName: 'AKK Trunkline',
    color: '#f59e0b',
    code: 'AKK-S1',
    diameter: '40-inch Gas Main',
    purpose: 'Main interstate trunkline feeding northwards towards Abuja/Kaduna',
  },
  2: {
    name: 'Geregu Power Generation Supply Feeder',
    shortName: 'Geregu Power Line',
    color: '#06b6d4',
    code: 'GPP-FDR',
    diameter: '24-inch High Pressure',
    purpose: 'Supplies gas to 884 MW Geregu I & II national grid power plant',
  },
  3: {
    name: 'Obajana Dangote Cement Industrial Line',
    shortName: 'Obajana Cement Line',
    color: '#ec4899',
    code: 'OBJ-IND',
    diameter: '18-inch Industrial',
    purpose: 'Supplies continuous gas to Africa’s largest cement manufacturing plant',
  },
  4: {
    name: 'Oben–Ajaokuta Western Feed Trunkline',
    shortName: 'Oben–Ajaokuta Line',
    color: '#8b5cf6',
    code: 'OBN-AJK',
    diameter: '24-inch Mainline',
    purpose: 'Transports raw feed gas across the Edo–Kogi state boundary to Ajaokuta',
  },
};

// Tile layers (crisp Google satellite default)
const TILE_LAYERS = {
  satellite: {
    label: '🛰️ Real Satellite',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google / Maxar High-Res Satellite Imagery',
    maxZoom: 20,
  },
  esri: {
    label: '🏢 High-Res Buildings',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  dark: {
    label: '🌑 Clean Dark Map',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

// Strategic Key Locations
const STRATEGIC_HUBS = [
  {
    id: 'HUB-1',
    name: 'Ajaokuta Steel Plant & Central Gas Hub',
    shortName: 'Ajaokuta Steel Hub',
    icon: '🏭',
    coords: [7.5564, 6.6552] as [number, number],
    type: 'Central Injection Terminal',
    poly: [[7.542, 6.642], [7.542, 6.672], [7.572, 6.672], [7.572, 6.642]] as [number, number][],
    color: '#06b6d4',
    summary: 'The main heart of the network where natural gas is received, metered, and distributed.',
  },
  {
    id: 'HUB-2',
    name: 'Geregu Power Generating Station',
    shortName: 'Geregu Power Station',
    icon: '⚡',
    coords: [7.4716, 6.6603] as [number, number],
    type: '884 MW Thermal Power Plant',
    poly: [[7.462, 6.652], [7.462, 6.670], [7.481, 6.670], [7.481, 6.652]] as [number, number][],
    color: '#f59e0b',
    summary: 'Powers millions of homes and businesses via national grid turbines.',
  },
  {
    id: 'HUB-3',
    name: 'Obajana Cement Mega-Plant',
    shortName: 'Obajana Cement Factory',
    icon: '🏗️',
    coords: [7.9150, 6.4350] as [number, number],
    type: 'Mega Industrial Production',
    poly: [[7.902, 6.422], [7.902, 6.452], [7.928, 6.452], [7.928, 6.422]] as [number, number][],
    color: '#ec4899',
    summary: 'Consumes massive gas volume for 4 giant rotary kilns and captive power plant.',
  },
  {
    id: 'HUB-4',
    name: 'Jamata River Niger Underwater Crossing',
    shortName: 'River Niger Crossing',
    icon: '🌊',
    coords: [7.8500, 6.8900] as [number, number],
    type: 'Critical Underwater Pipeline Trench',
    poly: [[7.838, 6.880], [7.838, 6.902], [7.862, 6.902], [7.862, 6.880]] as [number, number][],
    color: '#3b82f6',
    summary: 'Where the pipeline dives deep beneath the River Niger floodbed.',
  },
  {
    id: 'HUB-5',
    name: 'Lokoja River Confluence Port',
    shortName: 'Lokoja Port',
    icon: '🚢',
    coords: [7.7300, 6.7400] as [number, number],
    type: 'Confluence Navigation Base',
    poly: [[7.718, 6.728], [7.718, 6.752], [7.742, 6.752], [7.742, 6.728]] as [number, number][],
    color: '#10b981',
    summary: 'Confluence point of River Niger and River Benue with key emergency staging base.',
  },
];

// Interactive Guided Tour Steps
const GUIDED_TOUR_STEPS = [
  {
    title: 'Welcome to Pipe.AI — Kogi Pipeline Digital Twin',
    coords: [7.62, 6.70] as [number, number],
    zoom: 10,
    text: 'This system continuously monitors over 370 kilometers of critical gas pipelines across Kogi State using Machine Learning and Satellite Geo-Hazard Intelligence.',
  },
  {
    title: '1. Ajaokuta Central Gas Injection Hub',
    coords: [7.5564, 6.6552] as [number, number],
    zoom: 14,
    text: 'This is the nerve center in Ajaokuta where high-pressure natural gas from the south is processed and routed to power plants and factories.',
  },
  {
    title: '2. Jamata River Niger Underwater Crossing (High Risk Zone)',
    coords: [7.8500, 6.8900] as [number, number],
    zoom: 14,
    text: 'At this River Niger crossing, high water velocity causes riverbed erosion (scour). Pipe.AI flags this area as High Risk so engineers can reinforce it before issues occur.',
  },
  {
    title: '3. Geregu Power Generation Station Feeder',
    coords: [7.4716, 6.6603] as [number, number],
    zoom: 14,
    text: 'This line delivers high-pressure fuel directly to the Geregu I & II turbines generating 884 MW of electricity for the national grid.',
  },
  {
    title: '4. Obajana Cement Industrial Supply Line',
    coords: [7.9150, 6.4350] as [number, number],
    zoom: 13,
    text: 'Traversing the hilly terrain to Obajana, this pipeline powers Africa’s largest cement manufacturing facility 24 hours a day.',
  },
];

// Custom Station Marker Icon
const stationIcon = (name: string) =>
  L.divIcon({
    className: 'custom-station-icon',
    html: `<div class="friendly-station-pin">⚡ ${name}</div>`,
    iconSize: [110, 28],
    iconAnchor: [55, 14],
  });

// Custom Landmark Marker Icon
const landmarkIcon = (icon: string, name: string) =>
  L.divIcon({
    className: 'custom-landmark-icon',
    html: `<div class="friendly-hub-pin">${icon} ${name}</div>`,
    iconSize: [130, 28],
    iconAnchor: [65, 14],
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
// MAIN FRIENDLY USER-FIRST APP
// =====================================================================
function App() {
  const [pipelines, setPipelines] = useState<PipelineCollection | null>(null);
  const [stations, setStations] = useState<MeteringStation[]>([]);
  const [kpFeatures, setKpFeatures] = useState<KPFeature[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedKP, setSelectedKP] = useState<KPFeature | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('satellite');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guided Tour State
  const [tourIndex, setTourIndex] = useState<number | null>(null);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.62, 6.70]);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const mapRef = useRef<LeafletMap | null>(null);

  // Load Data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [pR, sR, kR] = await Promise.all([
          fetch(`${API_BASE}/pipelines`),
          fetch(`${API_BASE}/stations`),
          fetch(`${API_BASE}/kp-features`),
        ]);
        if (!pR.ok || !sR.ok || !kR.ok) throw new Error('Could not connect to Pipe.AI backend');
        const pipelinesData: PipelineCollection = await pR.json();
        const stationsData: MeteringStation[] = await sR.json();
        const kpData: KPFeature[] = await kR.json();

        setPipelines(pipelinesData);
        setStations(stationsData);
        setKpFeatures(kpData);

        // Select first interesting high-risk KP as default friendly preview
        const highlightedKP = kpData.find((k) => k.risk_class === 'Critical') || kpData[0];
        if (highlightedKP) setSelectedKP(highlightedKP);
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
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesKP = `kp ${kp.kp}`.includes(q) || `${kp.kp}` === q;
        const matchesHazard = kp.primary_hazard.toLowerCase().includes(q);
        const matchesCode = kp.pipeline_code.toLowerCase().includes(q);
        if (!matchesKP && !matchesHazard && !matchesCode) return false;
      }
      return true;
    });
  }, [kpFeatures, selectedPipelineId, searchQuery]);

  // Overall Health Summary
  const healthStats = useMemo(() => {
    const total = kpFeatures.length;
    if (total === 0) return { healthPercent: 100, criticalCount: 0, healthyCount: 0, attentionCount: 0 };
    let criticalCount = 0;
    let attentionCount = 0;
    let healthyCount = 0;

    for (const k of kpFeatures) {
      if (k.risk_class === 'Critical') criticalCount++;
      else if (k.risk_class === 'High' || k.risk_class === 'Medium') attentionCount++;
      else healthyCount++;
    }

    const healthPercent = Math.round((healthyCount / total) * 100);
    return { healthPercent, criticalCount, healthyCount, attentionCount };
  }, [kpFeatures]);

  // Most Critical Points to Inspect (Top 5)
  const topCriticalList = useMemo(() => {
    return [...kpFeatures]
      .filter((k) => k.risk_class === 'Critical' || k.risk_class === 'High')
      .sort((a, b) => b.failure_probability - a.failure_probability)
      .slice(0, 5);
  }, [kpFeatures]);

  // Handle KP Selection
  const handleSelectKP = (kp: KPFeature) => {
    setSelectedKP(kp);
    setMapCenter([kp.latitude, kp.longitude]);
    setMapZoom(14);
  };

  // Handle Hub Selection
  const handleSelectHub = (hub: typeof STRATEGIC_HUBS[0]) => {
    setMapCenter(hub.coords);
    setMapZoom(14);
  };

  // Start / Advance Guided Tour
  const handleStartTour = () => {
    setTourIndex(0);
    setMapCenter(GUIDED_TOUR_STEPS[0].coords);
    setMapZoom(GUIDED_TOUR_STEPS[0].zoom);
  };

  const handleNextTourStep = () => {
    if (tourIndex === null) return;
    if (tourIndex < GUIDED_TOUR_STEPS.length - 1) {
      const nextIdx = tourIndex + 1;
      setTourIndex(nextIdx);
      setMapCenter(GUIDED_TOUR_STEPS[nextIdx].coords);
      setMapZoom(GUIDED_TOUR_STEPS[nextIdx].zoom);
    } else {
      setTourIndex(null); // End tour
    }
  };

  const handlePrevTourStep = () => {
    if (tourIndex === null || tourIndex <= 0) return;
    const prevIdx = tourIndex - 1;
    setTourIndex(prevIdx);
    setMapCenter(GUIDED_TOUR_STEPS[prevIdx].coords);
    setMapZoom(GUIDED_TOUR_STEPS[prevIdx].zoom);
  };

  const handleResetMap = () => {
    setMapCenter([7.62, 6.70]);
    setMapZoom(11);
    setSelectedPipelineId(null);
    setSearchQuery('');
    setTourIndex(null);
  };

  const currentTile = TILE_LAYERS[activeLayer];

  return (
    <div className="friendly-app-container">
      {/* =========================================================
          1. SIMPLE, FRIENDLY HEADER
          ========================================================= */}
      <header className="friendly-header">
        <div className="header-brand">
          <div className="brand-logo-circle">🔥</div>
          <div>
            <h1 className="brand-name">Pipe.AI</h1>
            <p className="brand-tagline">Nigeria Pipeline Safety & Health Monitor</p>
          </div>
        </div>

        {/* 1-Click Corridor Filter Buttons */}
        <div className="friendly-route-selector">
          <button
            className={`route-btn ${selectedPipelineId === null ? 'active' : ''}`}
            onClick={() => setSelectedPipelineId(null)}
          >
            🌟 All 4 Pipelines (373 km)
          </button>
          {pipelines?.features.map((p) => {
            const pid = p.properties.pipeline_id;
            const theme = ROUTE_THEMES[pid];
            const isSel = selectedPipelineId === pid;
            return (
              <button
                key={pid}
                className={`route-btn ${isSel ? 'active' : ''}`}
                style={isSel ? { borderColor: theme.color, background: 'rgba(15, 23, 42, 0.95)' } : {}}
                onClick={() => setSelectedPipelineId(pid)}
              >
                <span className="route-dot" style={{ background: theme.color }} />
                {theme.shortName}
              </button>
            );
          })}
        </div>

        {/* Search, Guided Tour & View Switcher */}
        <div className="header-right-tools">
          <button className="tour-button" onClick={handleStartTour}>
            🎯 Guided Interactive Tour
          </button>

          <div className="simple-search-box">
            <span className="search-ico">🔍</span>
            <input
              type="text"
              placeholder="Search KP, Ajaokuta, River..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-ico" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <div className="view-mode-toggle">
            <button
              className={`mode-btn ${viewMode === 'simple' ? 'active' : ''}`}
              onClick={() => setViewMode('simple')}
            >
              👤 Simple View
            </button>
            <button
              className={`mode-btn ${viewMode === 'advanced' ? 'active' : ''}`}
              onClick={() => setViewMode('advanced')}
            >
              🔬 Engineering View
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================
          2. MAIN WORKSPACE
          ========================================================= */}
      <div className="friendly-workspace">
        {/* Loading */}
        {loading && (
          <div className="friendly-loading-badge">
            <div className="spinner-circle" />
            <span>Loading pipeline satellite map and health data…</span>
          </div>
        )}

        {/* Error */}
        {error && <div className="friendly-error-badge">{error}</div>}

        {/* GUIDED TOUR OVERLAY CARD */}
        {tourIndex !== null && (
          <div className="guided-tour-modal">
            <div className="tour-header">
              <span className="tour-step-count">
                Step {tourIndex + 1} of {GUIDED_TOUR_STEPS.length}
              </span>
              <button className="tour-close-btn" onClick={() => setTourIndex(null)}>✕ Close</button>
            </div>
            <h3 className="tour-title">{GUIDED_TOUR_STEPS[tourIndex].title}</h3>
            <p className="tour-text">{GUIDED_TOUR_STEPS[tourIndex].text}</p>
            <div className="tour-actions">
              {tourIndex > 0 && (
                <button className="tour-nav-btn" onClick={handlePrevTourStep}>◀ Back</button>
              )}
              <button className="tour-nav-btn primary" onClick={handleNextTourStep}>
                {tourIndex === GUIDED_TOUR_STEPS.length - 1 ? 'Finish Tour ✔' : 'Next Step ▶'}
              </button>
            </div>
          </div>
        )}

        {/* FLOATING LEFT: HEALTH & FAST JUMP BAR */}
        <div className="floating-health-card">
          <div className="health-card-top">
            <div>
              <span className="health-label">Network Overall Health</span>
              <div className="health-score-row">
                <span className="health-number" style={{ color: healthStats.criticalCount > 0 ? '#f59e0b' : '#10b981' }}>
                  {healthStats.healthPercent}%
                </span>
                <span className="health-rating-text">
                  {healthStats.criticalCount === 0 ? '🟢 Excellent Condition' : '⚠️ Maintenance Required'}
                </span>
              </div>
            </div>
            <button className="reset-view-btn" onClick={handleResetMap} title="Reset map to full view">
              ↺ Reset Map
            </button>
          </div>

          {/* Quick status boxes */}
          <div className="status-pills-grid">
            <div className="status-box safe">
              <span className="sb-count">{healthStats.healthyCount}</span>
              <span className="sb-name">🟢 Healthy KPs</span>
            </div>
            <div className="status-box attention">
              <span className="sb-count">{healthStats.attentionCount}</span>
              <span className="sb-name">🟡 Monitoring</span>
            </div>
            <div className="status-box danger">
              <span className="sb-count">{healthStats.criticalCount}</span>
              <span className="sb-name">🔴 Critical Action</span>
            </div>
          </div>

          {/* Strategic Hubs 1-Click Jump */}
          <div className="strategic-hubs-section">
            <span className="section-small-title">📍 Jump to Major Facility</span>
            <div className="hub-chips-list">
              {STRATEGIC_HUBS.map((hub) => (
                <button key={hub.id} className="hub-chip-btn" onClick={() => handleSelectHub(hub)}>
                  {hub.icon} {hub.shortName}
                </button>
              ))}
            </div>
          </div>

          {/* Basemap switcher */}
          <div className="map-style-selector">
            <span className="section-small-title">🗺️ Map Satellite Style</span>
            <div className="style-btn-group">
              {(Object.keys(TILE_LAYERS) as LayerKey[]).map((key) => (
                <button
                  key={key}
                  className={`style-btn ${activeLayer === key ? 'active' : ''}`}
                  onClick={() => setActiveLayer(key)}
                >
                  {TILE_LAYERS[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* MAP CONTAINER */}
        <div className="map-viewport-wrapper">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            maxZoom={20}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
            className="interactive-clean-map"
          >
            <MapUpdater center={mapCenter} zoom={mapZoom} mapRef={mapRef} />
            <TileLayer
              key={activeLayer}
              attribution={currentTile.attribution}
              url={currentTile.url}
              maxZoom={currentTile.maxZoom}
            />

            {/* Strategic Landmark Buildings */}
            {STRATEGIC_HUBS.map((hub) => (
              <Fragment key={hub.id}>
                <Polygon
                  positions={hub.poly}
                  pathOptions={{
                    color: hub.color,
                    fillColor: hub.color,
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: '5, 5',
                  }}
                  eventHandlers={{ click: () => handleSelectHub(hub) }}
                >
                  <Tooltip sticky>
                    <strong>{hub.icon} {hub.name}</strong><br />
                    {hub.summary}
                  </Tooltip>
                </Polygon>
                <Marker
                  position={hub.coords}
                  icon={landmarkIcon(hub.icon, hub.shortName)}
                  eventHandlers={{ click: () => handleSelectHub(hub) }}
                >
                  <Popup className="friendly-popup">
                    <div>
                      <h3>{hub.icon} {hub.name}</h3>
                      <p><strong>Type:</strong> {hub.type}</p>
                      <p>{hub.summary}</p>
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            ))}

            {/* Metering Stations */}
            {stations.map((st) => (
              <Marker
                key={st.id}
                position={[st.coordinates[1], st.coordinates[0]]}
                icon={stationIcon(st.name.replace('Metering Station', '').trim())}
                eventHandlers={{
                  click: () => {
                    setMapCenter([st.coordinates[1], st.coordinates[0]]);
                    setMapZoom(14);
                  },
                }}
              >
                <Popup className="friendly-popup">
                  <div>
                    <h3>⚡ {st.name}</h3>
                    <p><strong>Capacity:</strong> {st.capacity_mmscfd} Million Cubic Feet / Day</p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Pipelines (Luminous, Bold, High-Contrast) */}
            {pipelines?.features.map((f: any, idx: number) => {
              const coords = f.geometry.coordinates as [number, number][];
              const props = f.properties as PipelineProperties;
              const pid = props.pipeline_id;
              const isSelected = selectedPipelineId === pid;
              const theme = ROUTE_THEMES[pid] || ROUTE_THEMES[1];
              const route = coords.map(([lon, lat]) => [lat, lon] as [number, number]);

              return (
                <Fragment key={`pl-${idx}`}>
                  {/* Glowing Outline */}
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
                  {/* Bold Route Centerline */}
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
                      click: () => setSelectedPipelineId(pid),
                    }}
                  >
                    <Tooltip sticky>
                      <strong>{theme.name}</strong><br />
                      {theme.purpose}
                    </Tooltip>
                  </Polyline>
                </Fragment>
              );
            })}

            {/* Interactive KP Circle Markers */}
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
                    fillOpacity: isSelected ? 1.0 : 0.85,
                    color: isSelected ? '#ffffff' : '#000000',
                    weight: isSelected ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => handleSelectKP(kp),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <strong>KP {kp.kp} km ({kp.pipeline_code})</strong><br />
                    Status: <span style={{ color, fontWeight: 700 }}>{kp.risk_class} Risk</span><br />
                    {kp.primary_hazard}
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* =========================================================
            3. FLOATING RIGHT: FRIENDLY KP DETAIL CARD
            ========================================================= */}
        {selectedKP && (
          <aside className="friendly-inspector-card">
            {/* Header */}
            <div className="inspector-card-header">
              <div className="kp-main-title">
                <span className="kp-pill">KP {selectedKP.kp} km</span>
                <span className="kp-route-name">{selectedKP.pipeline_code}</span>
              </div>
              <span className={`risk-tag ${selectedKP.risk_class.toLowerCase()}`}>
                {selectedKP.risk_class === 'Critical' ? '🔴 Urgent Action' :
                 selectedKP.risk_class === 'High' ? '🟠 High Priority' :
                 selectedKP.risk_class === 'Medium' ? '🟡 Moderate' : '🟢 Healthy'}
              </span>
            </div>

            {/* Simple Health Gauge */}
            <div className="health-gauge-box">
              <div className="hg-row">
                <span className="hg-label">Pipeline Section Risk Level</span>
                <span className="hg-percent" style={{ color: RISK_COLORS[selectedKP.risk_class] }}>
                  {selectedKP.failure_probability_percent}% Vulnerability
                </span>
              </div>
              <div className="hg-track">
                <div
                  className={`hg-fill ${selectedKP.risk_class.toLowerCase()}`}
                  style={{ width: `${selectedKP.failure_probability_percent}%` }}
                />
              </div>
            </div>

            {/* Plain English Hazard Explanation */}
            <div className="friendly-hazard-box">
              <div className="fh-title">
                <span>⚠️ What is Happening Here:</span>
              </div>
              <p className="fh-desc">{selectedKP.diagnostic_message}</p>
            </div>

            {/* Plain English Action Plan */}
            <div className="friendly-action-box">
              <div className="fa-title">
                <span>🔧 What Needs To Be Done:</span>
              </div>
              <p className="fa-desc">{selectedKP.remediation_plan}</p>
            </div>

            {/* Pipe Physical Specs (Simple) */}
            <div className="simple-specs-grid">
              <div className="spec-card">
                <span className="spec-label">Steel Remaining</span>
                <span className="spec-val">
                  {selectedKP.remaining_wall_thickness_mm ?? 18.2} mm
                </span>
                <span className="spec-sub">({selectedKP.degradation_condition || 'Good'} condition)</span>
              </div>
              <div className="spec-card">
                <span className="spec-label">Elevation & Ground</span>
                <span className="spec-val">{selectedKP.elevation} m</span>
                <span className="spec-sub">{selectedKP.soil_type}</span>
              </div>
            </div>

            {/* ADVANCED ENGINEERING VIEW (Expandable if toggled) */}
            {viewMode === 'advanced' && (
              <div className="advanced-determinants-box">
                <span className="adv-title">📊 6 Quantitative Determinant Scores</span>
                <div className="adv-list">
                  {[
                    { name: '🌊 Flooding & Scour', val: selectedKP.flooding_index, col: '#06b6d4' },
                    { name: '🌋 Seismic Shearing', val: selectedKP.earthquake_factor, col: '#ef4444' },
                    { name: '🌧️ Rain Erosion', val: selectedKP.erosion_factor, col: '#3b82f6' },
                    { name: '🏔️ Landslide Slope', val: selectedKP.landslide_index, col: '#f59e0b' },
                    { name: '🧪 Soil Corrosivity', val: selectedKP.soil_corrosivity_index, col: '#a855f7' },
                    { name: '⚙️ Operating Hoop Stress', val: selectedKP.hoop_stress_ratio, col: '#eab308' },
                  ].map((d) => (
                    <div key={d.name} className="adv-item">
                      <div className="adv-item-row">
                        <span>{d.name}</span>
                        <strong>{(d.val ?? 0).toFixed(2)}</strong>
                      </div>
                      <div className="adv-track">
                        <div className="adv-fill" style={{ width: `${(d.val ?? 0) * 100}%`, background: d.col }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* =========================================================
            4. FLOATING BOTTOM: CRITICAL HOTSPOTS TICKER
            ========================================================= */}
        <div className="friendly-hotspots-bar">
          <span className="hotspot-badge">🚨 CRITICAL HOTSPOTS:</span>
          <div className="hotspot-chips-container">
            {topCriticalList.map((kp) => (
              <button
                key={`${kp.pipeline_id}-${kp.kp}`}
                className={`hotspot-chip ${selectedKP?.kp === kp.kp && selectedKP?.pipeline_id === kp.pipeline_id ? 'active' : ''}`}
                onClick={() => handleSelectKP(kp)}
              >
                📍 <strong>{kp.pipeline_code} KP {kp.kp} km</strong>
                <span className="hotspot-pill">{kp.failure_probability_percent}% Risk</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
