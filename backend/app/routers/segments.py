from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import joblib
import json
import csv
from pathlib import Path
from typing import List, Optional

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MODEL_PATH = DATA_DIR / "location_model.joblib"
REGRESSOR_PATH = DATA_DIR / "pof_regressor.joblib"
PIPELINES_PATH = DATA_DIR / "pipeline_routes.geojson"
STATIONS_PATH = DATA_DIR / "stations.json"
KP_FEATURES_PATH = DATA_DIR / "kp_features.json"
FEATURES_CSV_PATH = DATA_DIR / "location_features.csv"


class KPPredictRequest(BaseModel):
    flooding_index: float
    earthquake_factor: float
    erosion_factor: float
    landslide_index: float
    soil_corrosivity_index: float
    hoop_stress_ratio: float
    slope_deg: float
    elevation: float
    river_proximity_km: float
    fault_distance_km: float
    operating_pressure_psig: float
    pipe_diameter_inches: float
    design_wall_thickness_mm: float


class KPPredictResponse(BaseModel):
    failure_probability: float
    failure_probability_percent: float
    risk_class: str
    primary_hazard: str
    failure_code: str
    diagnostic_message: str
    remediation_plan: str


@router.get("/pipelines")
async def get_pipelines():
    """Return pipeline routes as GeoJSON LineString FeatureCollection."""
    if not PIPELINES_PATH.exists():
        raise HTTPException(status_code=404, detail="Pipeline routes file not found")
    return json.loads(PIPELINES_PATH.read_text(encoding="utf-8"))


@router.get("/stations")
async def get_stations():
    """Return list of Metering Stations & Gas Terminals."""
    if not STATIONS_PATH.exists():
        raise HTTPException(status_code=404, detail="Stations file not found")
    return json.loads(STATIONS_PATH.read_text(encoding="utf-8"))


@router.get("/kp-features")
async def get_kp_features(
    pipeline_id: Optional[int] = Query(None, description="Filter by Pipeline ID"),
    risk_class: Optional[str] = Query(None, description="Filter by Risk Class (Critical, High, Medium, Low)"),
):
    """Return KP-by-KP failure features, 6 quantitative determinants, and failure diagnostics."""
    if not KP_FEATURES_PATH.exists():
        raise HTTPException(status_code=404, detail="KP features file not found")

    features = json.loads(KP_FEATURES_PATH.read_text(encoding="utf-8"))

    if pipeline_id is not None:
        features = [f for f in features if f.get("pipeline_id") == pipeline_id]

    if risk_class is not None:
        features = [f for f in features if f.get("risk_class", "").lower() == risk_class.lower()]

    return features


@router.get("/locations/features")
async def get_location_features():
    """CSV fallback endpoint for legacy support."""
    if not FEATURES_CSV_PATH.exists():
        raise HTTPException(status_code=404, detail="Features CSV file not found")
    with FEATURES_CSV_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


@router.post("/predict-kp", response_model=KPPredictResponse)
async def predict_kp(payload: KPPredictRequest):
    """Predict dynamic Failure Probability and Failure Cause using 6 Quantitative Determinants."""
    if not REGRESSOR_PATH.exists() or not MODEL_PATH.exists():
        raise HTTPException(status_code=404, detail="Trained model files not found")

    regressor = joblib.load(REGRESSOR_PATH)
    classifier = joblib.load(MODEL_PATH)

    X = [[
        payload.flooding_index,
        payload.earthquake_factor,
        payload.erosion_factor,
        payload.landslide_index,
        payload.soil_corrosivity_index,
        payload.hoop_stress_ratio,
        payload.slope_deg,
        payload.elevation,
        payload.river_proximity_km,
        payload.fault_distance_km,
        payload.operating_pressure_psig,
        payload.pipe_diameter_inches,
        payload.design_wall_thickness_mm,
    ]]

    predicted_pof = float(regressor.predict(X)[0])
    predicted_pof = max(0.01, min(0.99, predicted_pof))
    predicted_pof_percent = round(predicted_pof * 100.0, 1)

    predicted_class = str(classifier.predict(X)[0])

    # Assign Root Cause Diagnostic based on highest determinant score
    dets = {
        "Flooding & River Scour": payload.flooding_index,
        "Slope Landslide": payload.landslide_index,
        "Earthquake & Seismic Shearing": payload.earthquake_factor,
        "Corrosive Soil & Groundwater": payload.soil_corrosivity_index,
        "Severe Soil Erosion": payload.erosion_factor,
    }
    top_hazard = max(dets, key=dets.get)

    if top_hazard == "Flooding & River Scour" and payload.flooding_index >= 0.40:
        hazard = "Hydrodynamic River Scour & Flood Inundation"
        code = "ERR-GEO-HYDRO-01"
        diag = f"High predicted failure risk ({predicted_pof_percent}%) due to river bed scour (Flood Index {payload.flooding_index:.2f})."
        remed = "Deep HDD re-burial & concrete articulated mat placement."
    elif top_hazard == "Slope Landslide" and payload.landslide_index >= 0.40:
        hazard = "Slope Instability & Landslide Hazard"
        code = "ERR-GEO-SLOPE-02"
        diag = f"Slope stability hazard ({predicted_pof_percent}%) on steep terrain (Landslide Index {payload.landslide_index:.2f})."
        remed = "Gabion retaining walls & strain gauge monitoring."
    elif top_hazard == "Earthquake & Seismic Shearing" and payload.earthquake_factor >= 0.40:
        hazard = "Active Seismic Fault Shearing & Ground Motion"
        code = "ERR-GEO-SEISMIC-03"
        diag = f"Subsurface shear stress hazard ({predicted_pof_percent}%) near active fault trace (Seismic Factor {payload.earthquake_factor:.2f})."
        remed = "Flexible expansion joints & thick-wall replacement pipe."
    elif top_hazard == "Corrosive Soil & Groundwater" and payload.soil_corrosivity_index >= 0.40:
        hazard = "Corrosive Soil & Anoxic Groundwater Degradation"
        code = "ERR-GEO-CORR-04"
        diag = f"High corrosion degradation risk ({predicted_pof_percent}%) in saturated soil (Corrosivity Index {payload.soil_corrosivity_index:.2f})."
        remed = "3LPE coating repair & cathodic protection system upgrade."
    elif top_hazard == "Severe Soil Erosion" and payload.erosion_factor >= 0.40:
        hazard = "Severe Rainfall Erosion & Trench Washout"
        code = "ERR-GEO-EROSION-05"
        diag = f"Trench washout hazard ({predicted_pof_percent}%) caused by runoff erosion (Erosion Factor {payload.erosion_factor:.2f})."
        remed = "Backfill trench with compacted gravel-soil matrix and concrete breaker berms."
    else:
        hazard = "Low Geo-Hazard Stress (Nominal Operational)"
        code = "NOMINAL-00"
        diag = f"Pipeline segment operating within standard safety envelope ({predicted_pof_percent}% PoF)."
        remed = "Standard periodic Right-of-Way aerial survey."

    return KPPredictResponse(
        failure_probability=round(predicted_pof, 4),
        failure_probability_percent=predicted_pof_percent,
        risk_class=predicted_class,
        primary_hazard=hazard,
        failure_code=code,
        diagnostic_message=diag,
        remediation_plan=remed,
    )
