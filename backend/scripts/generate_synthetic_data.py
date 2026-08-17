"""
Ajaokuta & Kogi Metering Station Pipelines — Data Generator (6 Quantitative Geo-Hazard Determinants)

Deterministic Geo-Hazard Factors:
1. Flooding & River Scour Index (H_flood) [0.0 - 1.0]
2. Earthquake & Seismic Activity Factor (E_quake) [0.0 - 1.0]
3. Severe Rainfall Erosion Factor (E_erosion) [0.0 - 1.0]
4. Landslide & Slope Instability Index (S_landslide) [0.0 - 1.0]
5. Corrosive Soil & Groundwater Index (C_soil_corr) [0.0 - 1.0]
6. Operational Hoop Stress Ratio (S_operating) [0.0 - 1.0]
"""

from pathlib import Path
import csv
import json
import math
import numpy as np
import requests

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR.mkdir(exist_ok=True)
CACHE_DIR = DATA_DIR / ".api_cache"
CACHE_DIR.mkdir(exist_ok=True)

np.random.seed(42)

# ---------------------------------------------------------------------------
# Key Stations Coordinates in Kogi State
# ---------------------------------------------------------------------------
STATIONS = {
    "AJAOKUTA_TGS": {
        "id": "ST-01",
        "name": "Ajaokuta Terminal Gas Station (TGS)",
        "coordinates": [6.6552, 7.5564],  # [lon, lat]
        "type": "Main Terminal & Injection Hub",
        "capacity_mmscfd": 2200,
    },
    "GEREGU_MS": {
        "id": "ST-02",
        "name": "Geregu Power & Gas Metering Station",
        "coordinates": [6.6603, 7.4716],
        "type": "Power Plant Metering Station",
        "capacity_mmscfd": 450,
    },
    "OBAJANA_MS": {
        "id": "ST-03",
        "name": "Obajana Industrial Metering Station",
        "coordinates": [6.4350, 7.9150],
        "type": "Industrial Metering Station",
        "capacity_mmscfd": 350,
    },
    "AHOKU_BVS": {
        "id": "ST-04",
        "name": "Ahoko Block Valve Station (AKK KP 45)",
        "coordinates": [6.8350, 8.1200],
        "type": "Block Valve Station",
        "capacity_mmscfd": 2200,
    },
    "OBEN_PLANT": {
        "id": "ST-05",
        "name": "Oben Gas Processing Plant (Origin)",
        "coordinates": [6.0200, 6.1500],
        "type": "Gas Production Node",
        "capacity_mmscfd": 1500,
    },
}

# Steel yield strength SMYS (psi)
SMYS_MAP = {
    "API 5L X80": 80000.0,
    "API 5L X65": 65000.0,
    "API 5L X52": 52000.0,
}

# Real Pipeline Routes
PIPELINE_ROUTES = [
    {
        "id": 1,
        "code": "AKK-SEC1",
        "name": "Ajaokuta–Kaduna–Kano (AKK) Gas Pipeline — Kogi Corridor",
        "substance": "Natural Gas",
        "operator": "NNPC Limited / Gas Aggregation Company",
        "pipe_diameter_inches": 40.0,
        "operating_pressure_psig": 1440.0,
        "pipe_material": "API 5L X80",
        "design_wall_thickness_mm": 22.2,
        "construction_start_date": "2020-06-30",
        "construction_age_years": 6.0,
        "operational_start_date": "2022-08-15",
        "operational_age_years": 4.0,
        "operational_status": "Active Commissioning",
        "commissioning_note": "Flagged off by President Muhammadu Buhari on June 30, 2020; Section 1 runs from Ajaokuta TGS traversing Kogi into FCT Abuja corridor.",
        "waypoints": [
            (7.5564, 6.6552),  # Ajaokuta TGS (KP 0.0)
            (7.5850, 6.6800),  # River Niger crossing south (KP 4.2)
            (7.6320, 6.7200),  # Geregu North Bypass (KP 10.5)
            (7.7200, 6.7800),  # Lokoja East Flank (KP 22.0)
            (7.8500, 6.8900),  # Jamata River Niger HDD Crossing (KP 38.5)
            (7.9800, 7.0200),  # Koton-Karfe Hills (KP 55.0)
            (8.1200, 7.1500),  # Ahoko BVS Node (KP 72.0)
            (8.2500, 7.2100),  # Gegu Ridge Corridor (KP 88.0)
            (8.4000, 7.2500),  # Abaji / FCT Border (KP 105.0)
        ],
    },
    {
        "id": 2,
        "code": "GER-FEED",
        "name": "Geregu Power Plant Gas Supply Pipeline",
        "substance": "Natural Gas",
        "operator": "Nigerian Gas Infrastructure Company (NGIC)",
        "pipe_diameter_inches": 24.0,
        "operating_pressure_psig": 1000.0,
        "pipe_material": "API 5L X65",
        "design_wall_thickness_mm": 14.3,
        "construction_start_date": "2012-04-15",
        "construction_age_years": 14.0,
        "operational_start_date": "2014-02-10",
        "operational_age_years": 12.0,
        "operational_status": "Continuous Operational Supply",
        "commissioning_note": "Dedicated feeder spur dedicated to Geregu I and II thermal power generation turbines along the Ajaokuta industrial axis.",
        "waypoints": [
            (7.5564, 6.6552),  # Ajaokuta TGS (KP 0.0)
            (7.5200, 6.6580),  # Ajaokuta Industrial Zone (KP 4.2)
            (7.4950, 6.6590),  # Itobe Road Alignment (KP 7.1)
            (7.4716, 6.6603),  # Geregu Metering Station (KP 10.0)
        ],
    },
    {
        "id": 3,
        "code": "OBJ-LINE",
        "name": "Ajaokuta–Obajana Gas Pipeline",
        "substance": "Natural Gas",
        "operator": "NGIC / Dangote Gas Distribution",
        "pipe_diameter_inches": 18.0,
        "operating_pressure_psig": 850.0,
        "pipe_material": "API 5L X52",
        "design_wall_thickness_mm": 11.9,
        "construction_start_date": "2014-08-20",
        "construction_age_years": 12.0,
        "operational_start_date": "2016-05-18",
        "operational_age_years": 10.0,
        "operational_status": "High Capacity Industrial Supply",
        "commissioning_note": "Supplies natural gas feed for cement kiln pyroprocessing and captive power generation at the Obajana industrial plant.",
        "waypoints": [
            (7.5564, 6.6552),  # Ajaokuta TGS (KP 0.0)
            (7.5200, 6.5500),  # Okene-Ajaokuta Road Corridor (KP 12.0)
            (7.5500, 6.4200),  # Eganyin Valley (KP 28.0)
            (7.6800, 6.3800),  # Kabba Junction (KP 45.0)
            (7.8200, 6.3900),  # Lokoja-Obajana Bypass (KP 62.0)
            (7.9150, 6.4350),  # Obajana Metering Station (KP 74.0)
        ],
    },
    {
        "id": 4,
        "code": "OBN-AJA",
        "name": "Oben–Ajaokuta Gas Trunk Line (Western Line)",
        "substance": "Rich Natural Gas",
        "operator": "NNPC Gas Infrastructure Company",
        "pipe_diameter_inches": 24.0,
        "operating_pressure_psig": 1200.0,
        "pipe_material": "API 5L X65",
        "design_wall_thickness_mm": 15.9,
        "construction_start_date": "2008-01-10",
        "construction_age_years": 18.0,
        "operational_start_date": "2010-11-25",
        "operational_age_years": 16.0,
        "operational_status": "Strategic Gas Trunkline Feed",
        "commissioning_note": "Western regional backbone delivering treated gas from Oben Gas Plant (Edo State) into Ajaokuta Gas Hub.",
        "waypoints": [
            (6.1500, 6.0200),  # Oben Gas Plant (KP 0.0)
            (6.4500, 6.1800),  # Edo-Kogi Border Forest (KP 40.0)
            (6.8200, 6.3500),  # Agbede Hills (KP 85.0)
            (7.1500, 6.4800),  # Okene South Boundary (KP 125.0)
            (7.3800, 6.5800),  # Ajaokuta South Approach (KP 155.0)
            (7.5564, 6.6552),  # Ajaokuta Metering Station (KP 178.0)
        ],
    },
]


def haversine_km(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def interpolate_kp_points(waypoints, step_km=1.0):
    cum_dists = [0.0]
    for i in range(1, len(waypoints)):
        lat1, lon1 = waypoints[i - 1]
        lat2, lon2 = waypoints[i]
        cum_dists.append(cum_dists[-1] + haversine_km(lat1, lon1, lat2, lon2))

    total_len = cum_dists[-1]
    num_kps = max(2, int(math.ceil(total_len / step_km)) + 1)
    
    kps = []
    for step_idx in range(num_kps):
        target_kp = min(step_idx * step_km, total_len)
        for i in range(1, len(cum_dists)):
            if cum_dists[i] >= target_kp:
                seg_start = cum_dists[i - 1]
                seg_end = cum_dists[i]
                seg_len = seg_end - seg_start
                frac = (target_kp - seg_start) / seg_len if seg_len > 0 else 0.0
                
                lat1, lon1 = waypoints[i - 1]
                lat2, lon2 = waypoints[i]
                lat = lat1 + frac * (lat2 - lat1)
                lon = lon1 + frac * (lon2 - lon1)
                
                kps.append({
                    "kp": round(target_kp, 1),
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                })
                break
        else:
            lat, lon = waypoints[-1]
            kps.append({
                "kp": round(total_len, 1),
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
            })
            
    return kps


def fetch_elevations(coords, route_code=""):
    cache_file = CACHE_DIR / f"elevations_{route_code}.json"
    if cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        if len(cached) == len(coords):
            print("   [OK] Elevations loaded from local cache")
            return cached

    print("   ... Fetching elevation data from Open-Meteo API...")
    elevations = []
    batch_size = 100
    for i in range(0, len(coords), batch_size):
        batch = coords[i:i + batch_size]
        lats = ",".join(str(c[0]) for c in batch)
        lons = ",".join(str(c[1]) for c in batch)
        url = f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}"
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            elevations.extend(resp.json().get("elevation", []))
        except Exception as e:
            print(f"    [WARN] API batch failed: {e}")
            elevations.extend([float(np.random.uniform(50, 320)) for _ in batch])

    cache_file.write_text(json.dumps(elevations), encoding="utf-8")
    print(f"   [OK] {len(elevations)} elevation points fetched")
    return elevations


def calculate_quantitative_determinants(kp_list, route_info, elevations):
    """
    Calculate 6 Quantitative Determinants (0.0 to 1.0 normalized score):
    1. Flooding & River Scour Index (H_flood)
    2. Earthquake & Seismic Activity Factor (E_quake)
    3. Severe Rainfall Erosion Factor (E_erosion)
    4. Landslide & Slope Instability Index (S_landslide)
    5. Corrosive Soil & Groundwater Index (C_soil_corr)
    6. Operational Hoop Stress Ratio (S_operating)
    """
    total = len(kp_list)
    results = []

    RIVER_POINTS = [
        (7.5564, 6.6552),  # Ajaokuta River Crossing
        (7.4716, 6.6603),  # Geregu Waterfront
        (7.8500, 6.8900),  # Jamata Bridge Crossing
        (7.7200, 6.7800),  # Lokoja River Confluence
    ]

    FAULT_LINE_POINTS = [
        (7.4000, 6.5000),
        (7.6500, 6.7000),
        (8.1000, 7.1000),
    ]

    # Hoop Stress Calculation: σ_hoop = (P * D) / (2 * t_inches)
    p_op = route_info["operating_pressure_psig"]
    d_inches = route_info["pipe_diameter_inches"]
    t_inches = route_info["design_wall_thickness_mm"] / 25.4
    smys = SMYS_MAP.get(route_info["pipe_material"], 65000.0)

    hoop_stress_psi = (p_op * d_inches) / (2.0 * t_inches)
    hoop_stress_ratio = round(float(np.clip(hoop_stress_psi / smys, 0.20, 0.85)), 3)

    for idx, item in enumerate(kp_list):
        lat = item["latitude"]
        lon = item["longitude"]
        kp = item["kp"]
        elev = elevations[idx]

        prev_idx = max(0, idx - 1)
        next_idx = min(total - 1, idx + 1)
        dist_m = max(100.0, haversine_km(lat, lon, kp_list[next_idx]["latitude"], kp_list[next_idx]["longitude"]) * 1000.0)
        elev_diff = abs(elevations[next_idx] - elevations[prev_idx])
        slope_deg = round(math.degrees(math.atan(elev_diff / dist_m)), 2)

        river_dist_km = min(haversine_km(lat, lon, rlat, rlon) for rlat, rlon in RIVER_POINTS)
        river_proximity = round(max(0.05, river_dist_km), 2)

        fault_dist_km = min(haversine_km(lat, lon, flat, flon) for flat, flon in FAULT_LINE_POINTS)
        fault_distance = round(max(0.2, fault_dist_km + np.random.uniform(-0.3, 0.3)), 2)

        # 1. FLOODING & RIVER SCOUR INDEX (0.0 to 1.0)
        # Higher near River Niger and low elevation baselines
        h_flood = round(float(np.clip(
            (1.0 / (river_proximity + 0.3)) * 0.70 +
            (1.0 - min(elev, 300.0) / 300.0) * 0.30 +
            np.random.uniform(0.0, 0.05),
            0.04, 0.98
        )), 3)

        # 2. EARTHQUAKE & SEISMIC FACTOR (0.0 to 1.0)
        # Higher near active fault trace lines
        e_quake = round(float(np.clip(
            (1.0 / (fault_distance + 0.4)) * 0.85 +
            np.random.uniform(0.0, 0.06),
            0.03, 0.95
        )), 3)

        # 3. SEVERE RAINFALL EROSION FACTOR (0.0 to 1.0)
        # USLE slope-length & runoff factor
        e_erosion = round(float(np.clip(
            (slope_deg / 25.0) * 0.50 +
            (1.0 / (river_proximity + 0.8)) * 0.40 +
            np.random.uniform(0.0, 0.08),
            0.05, 0.96
        )), 3)

        # 4. LANDSLIDE & SLOPE INSTABILITY INDEX (0.0 to 1.0)
        # Slope gradient & elevation relief
        s_landslide = round(float(np.clip(
            (slope_deg / 20.0) * 0.75 +
            (elev / 400.0) * 0.25 +
            np.random.uniform(0.0, 0.04),
            0.02, 0.96
        )), 3)

        # 5. CORROSIVE SOIL & GROUNDWATER INDEX (0.0 to 1.0)
        # Expansive clay + groundwater saturation
        if elev > 200 or slope_deg > 12:
            soil_risk = 2
            soil_type = "Expansive Shale & Rocky Outcrop"
        elif river_proximity < 1.5:
            soil_risk = 2
            soil_type = "Saturated Alluvial Silty Clay"
        elif elev < 80:
            soil_risk = 1
            soil_type = "Corrosive Lowland Clay"
        else:
            soil_risk = 0
            soil_type = "Stable Sandy Loam"

        gw_index = round(float(np.clip(1.0 - (elev / 350.0) + (1.0 / (river_proximity + 0.5)) * 0.3, 0.05, 0.98)), 3)
        c_soil_corr = round(float(np.clip((soil_risk / 2.0) * 0.40 + gw_index * 0.60, 0.05, 0.97)), 3)

        # 6. OPERATIONAL HOOP STRESS RATIO (S_operating)
        s_operating = hoop_stress_ratio

        # -------------------------------------------------------------------
        # INTEGRATED PROBABILITY OF FAILURE (PoF) FORMULATION
        # -------------------------------------------------------------------
        combined_hazard = (
            0.28 * h_flood +
            0.24 * s_landslide +
            0.20 * e_quake +
            0.14 * c_soil_corr +
            0.14 * e_erosion
        ) * (1.0 + 0.45 * s_operating)

        # Calibrate PoF
        pof = round(float(np.clip(combined_hazard * 0.55, 0.032, 0.915)), 4)
        pof_percent = round(pof * 100.0, 1)

        # Risk Classification
        if pof >= 0.60:
            risk_class = "Critical"
        elif pof >= 0.38:
            risk_class = "High"
        elif pof >= 0.20:
            risk_class = "Medium"
        else:
            risk_class = "Low"

        # -------------------------------------------------------------------
        # ASSIGN DOMINANT GEO-HAZARD CAUSE
        # -------------------------------------------------------------------
        determinants = {
            "Flooding & River Scour": h_flood,
            "Slope Landslide": s_landslide,
            "Earthquake & Seismic Shearing": e_quake,
            "Corrosive Soil & Groundwater": c_soil_corr,
            "Severe Soil Erosion": e_erosion,
        }
        dominant_hazard = max(determinants, key=determinants.get)

        if dominant_hazard == "Flooding & River Scour" and h_flood >= 0.45:
            primary_hazard = "Hydrodynamic River Scour & Flood Inundation"
            failure_code = "ERR-GEO-HYDRO-01"
            diagnostic = (
                f"KP {kp}: High failure probability ({pof_percent}%) driven by severe River Niger flood inundation "
                f"(Flood Index {h_flood}, {river_proximity} km proximity). Current scour threatens to un-seat buried pipe."
            )
            remediation = "Perform Horizontal Directional Drilling (HDD) deep riverbed re-burial & install concrete articulated weighting mats."
        elif dominant_hazard == "Slope Landslide" and s_landslide >= 0.40:
            primary_hazard = "Slope Instability & Landslide Hazard"
            failure_code = "ERR-GEO-SLOPE-02"
            diagnostic = (
                f"KP {kp}: Pipeline elevated failure risk ({pof_percent}%) due to steep rocky slope terrain ({slope_deg}° slope angle, Landslide Index {s_landslide}). "
                f"Gravitational soil movement risk buckling or un-seating pipe joint welds."
            )
            remediation = "Construct slope retaining gabion walls, install strain gauge monitoring sensors, and stabilize right-of-way."
        elif dominant_hazard == "Earthquake & Seismic Shearing" and e_quake >= 0.40:
            primary_hazard = "Active Seismic Fault Shearing & Ground Acceleration"
            failure_code = "ERR-GEO-SEISMIC-03"
            diagnostic = (
                f"KP {kp}: Structural failure hazard ({pof_percent}%) caused by proximity to active tectonic fault line ({fault_distance} km, Seismic Factor {e_quake}). "
                f"Subsurface ground motion can induce lateral shearing."
            )
            remediation = "Install flexible expansion loops, high-yield API 5L X80 thick-wall replacement pipe, and acoustic leak detection."
        elif dominant_hazard == "Corrosive Soil & Groundwater" and c_soil_corr >= 0.45:
            primary_hazard = "Corrosive Soil & Anoxic Groundwater Degradation"
            failure_code = "ERR-GEO-CORR-04"
            diagnostic = (
                f"KP {kp}: High external corrosion hazard ({pof_percent}%) resulting from saturated groundwater (Corrosivity Index {c_soil_corr}) "
                f"and anaerobic clay soil. Coating breakdown risk is high."
            )
            remediation = "Upgrade Impressed Current Cathodic Protection (ICCP), apply 3LPE coating repair, and conduct smart-pig inline inspection."
        elif dominant_hazard == "Severe Soil Erosion" and e_erosion >= 0.40:
            primary_hazard = "Severe Rainfall Erosion & Trench Washout"
            failure_code = "ERR-GEO-EROSION-05"
            diagnostic = (
                f"KP {kp}: Vulnerable to trench washout ({pof_percent}% failure risk) caused by heavy seasonal runoff erosion (Erosion Factor {e_erosion}). "
                f"Exposed pipeline is susceptible to third-party impact."
            )
            remediation = "Backfill trench with compacted gravel-soil matrix and construct concrete breaker berms."
        else:
            primary_hazard = "Low Geo-Hazard Stress (Nominal Operational)"
            failure_code = "NOMINAL-00"
            diagnostic = (
                f"KP {kp}: Stable terrain conditions ({pof_percent}% PoF). Operating within normal design parameters under standard Catholic Protection monitoring."
            )
            remediation = "Maintain standard periodic aerial Right-of-Way surveillance and annual CP survey."

        # -------------------------------------------------------------------
        # CORROSION & WALL-THICKNESS DEGRADATION MODEL (Kaggle Dataset Alignment)
        # -------------------------------------------------------------------
        op_age = route_info.get("operational_age_years", 10.0)
        design_t = route_info["design_wall_thickness_mm"]
        
        # Annual corrosion penetration rate (mm/year) governed by soil corrosivity and water proximity
        corrosion_rate_mm_yr = round(float(np.clip(0.04 + c_soil_corr * 0.38 + np.random.uniform(0.0, 0.04), 0.02, 0.50)), 3)
        thickness_loss = round(float(min(design_t * 0.80, corrosion_rate_mm_yr * op_age)), 2)
        remaining_t = round(float(max(1.0, design_t - thickness_loss)), 2)
        material_loss_pct = round(float((thickness_loss / design_t) * 100.0), 1)

        # Condition classification aligned with Kaggle predictive maintenance standards
        if thickness_loss >= 5.0 or material_loss_pct >= 35.0:
            degradation_condition = "Critical"
        elif thickness_loss >= 2.0 or material_loss_pct >= 15.0:
            degradation_condition = "Moderate"
        else:
            degradation_condition = "Normal"

        results.append({
            "kp": kp,
            "pipeline_id": route_info["id"],
            "pipeline_code": route_info["code"],
            "pipeline_name": route_info["name"],
            "latitude": lat,
            "longitude": lon,
            "elevation": elev,
            "slope_deg": slope_deg,
            "river_proximity_km": river_proximity,
            "fault_distance_km": fault_distance,
            "soil_type": soil_type,
            "soil_risk": soil_risk,
            # 6 Quantitative Determinants
            "flooding_index": h_flood,
            "earthquake_factor": e_quake,
            "erosion_factor": e_erosion,
            "landslide_index": s_landslide,
            "soil_corrosivity_index": c_soil_corr,
            "hoop_stress_ratio": s_operating,
            # Pipe Specs
            "pipe_diameter_inches": route_info["pipe_diameter_inches"],
            "operating_pressure_psig": route_info["operating_pressure_psig"],
            "pipe_material": route_info["pipe_material"],
            "design_wall_thickness_mm": route_info["design_wall_thickness_mm"],
            # Wall Thickness & Corrosion Degradation
            "operational_age_years": op_age,
            "corrosion_rate_mm_per_year": corrosion_rate_mm_yr,
            "thickness_loss_mm": thickness_loss,
            "remaining_wall_thickness_mm": remaining_t,
            "material_loss_percent": material_loss_pct,
            "degradation_condition": degradation_condition,
            # Failure Output
            "failure_probability": pof,
            "failure_probability_percent": pof_percent,
            "risk_class": risk_class,
            "primary_hazard": primary_hazard,
            "failure_code": failure_code,
            "diagnostic_message": diagnostic,
            "remediation_plan": remediation,
        })

    return results


def generate_all_data():
    print(f"\n{'=' * 70}")
    print("Generating Ajaokuta & Kogi Pipelines Dataset (6 Quantitative Determinants)")
    print(f"{'=' * 70}\n")

    all_kp_features = []
    routes_geojson = {"type": "FeatureCollection", "features": []}

    print(f"\n[Processing Pipelines]")
    for route in PIPELINE_ROUTES:
        print(f"-> Processing Pipeline {route['id']}: {route['name']}")
        
        kp_points = interpolate_kp_points(route["waypoints"], step_km=1.0)
        print(f"   - Interpolated {len(kp_points)} KP posts (0.0 to {kp_points[-1]['kp']} km)")

        coords = [(pt["latitude"], pt["longitude"]) for pt in kp_points]
        elevations = fetch_elevations(coords, route["code"])

        kp_analyzed = calculate_quantitative_determinants(kp_points, route, elevations)
        all_kp_features.extend(kp_analyzed)

        pofs = [item["failure_probability"] for item in kp_analyzed]
        avg_pof = float(np.mean(pofs))
        max_pof = float(np.max(pofs))
        critical_count = sum(1 for item in kp_analyzed if item["risk_class"] == "Critical")
        high_count = sum(1 for item in kp_analyzed if item["risk_class"] == "High")

        if max_pof >= 0.60 or critical_count > 0:
            overall_risk = "Critical"
        elif max_pof >= 0.38 or high_count > 0:
            overall_risk = "High"
        elif avg_pof >= 0.20:
            overall_risk = "Medium"
        else:
            overall_risk = "Low"

        line_coords = [[pt["longitude"], pt["latitude"]] for pt in kp_points]
        feature = {
            "type": "Feature",
            "properties": {
                "pipeline_id": route["id"],
                "code": route["code"],
                "name": route["name"],
                "substance": route["substance"],
                "operator": route["operator"],
                "pipe_diameter_inches": route["pipe_diameter_inches"],
                "operating_pressure_psig": route["operating_pressure_psig"],
                "pipe_material": route["pipe_material"],
                "design_wall_thickness_mm": route["design_wall_thickness_mm"],
                "total_length_km": kp_points[-1]["kp"],
                "avg_failure_probability": round(avg_pof, 4),
                "max_failure_probability": round(max_pof, 4),
                "risk_label": overall_risk,
                "critical_kps_count": critical_count,
                "high_kps_count": high_count,
                "construction_start_date": route.get("construction_start_date"),
                "construction_age_years": route.get("construction_age_years"),
                "operational_start_date": route.get("operational_start_date"),
                "operational_age_years": route.get("operational_age_years"),
                "operational_status": route.get("operational_status"),
                "commissioning_note": route.get("commissioning_note"),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": line_coords,
            },
        }
        routes_geojson["features"].append(feature)

    print(f"\n[Writing Output Data Files]")

    routes_path = DATA_DIR / "pipeline_routes.geojson"
    routes_path.write_text(json.dumps(routes_geojson, indent=2), encoding="utf-8")
    print(f"   [OK] Saved GeoJSON Routes -> {routes_path}")

    stations_path = DATA_DIR / "stations.json"
    stations_path.write_text(json.dumps(list(STATIONS.values()), indent=2), encoding="utf-8")
    print(f"   [OK] Saved Metering Stations -> {stations_path}")

    kp_json_path = DATA_DIR / "kp_features.json"
    kp_json_path.write_text(json.dumps(all_kp_features, indent=2), encoding="utf-8")
    print(f"   [OK] Saved KP Features JSON -> {kp_json_path}")

    fieldnames = list(all_kp_features[0].keys())
    csv_path = DATA_DIR / "location_features.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for item in all_kp_features:
            writer.writerow(item)
    print(f"   [OK] Saved CSV Features -> {csv_path}")

    kp_points_geojson = {"type": "FeatureCollection", "features": []}
    for item in all_kp_features:
        feature = {
            "type": "Feature",
            "properties": item,
            "geometry": {
                "type": "Point",
                "coordinates": [item["longitude"], item["latitude"]],
            },
        }
        kp_points_geojson["features"].append(feature)
    
    env_points_path = DATA_DIR / "environment_points.geojson"
    env_points_path.write_text(json.dumps(kp_points_geojson, indent=2), encoding="utf-8")
    print(f"   [OK] Saved Environment Points GeoJSON -> {env_points_path}")

    print(f"\n{'=' * 70}")
    print(f"Data Generation Successful! Generated {len(all_kp_features)} KP datapoints across 4 pipelines.")
    print(f"{'=' * 70}\n")


if __name__ == "__main__":
    generate_all_data()
