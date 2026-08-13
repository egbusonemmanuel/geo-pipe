import requests

API_BASE = "http://127.0.0.1:8000/api"

def test_endpoints():
    print("Testing backend API endpoints...")
    try:
        r1 = requests.get(f"{API_BASE}/pipelines")
        print(f"1. GET /api/pipelines: HTTP {r1.status_code}, {len(r1.json()['features'])} routes")

        r2 = requests.get(f"{API_BASE}/stations")
        print(f"2. GET /api/stations: HTTP {r2.status_code}, {len(r2.json())} stations")

        r3 = requests.get(f"{API_BASE}/kp-features")
        print(f"3. GET /api/kp-features: HTTP {r3.status_code}, {len(r3.json())} KPs")

        payload = {
            "slope_deg": 12.5,
            "elevation": 180.0,
            "soil_risk": 2.0,
            "fault_distance_km": 1.5,
            "river_proximity_km": 0.8,
            "groundwater_index": 0.75,
            "erosion_index": 0.65,
            "historic_incidents": 1,
            "operating_pressure_psig": 1440.0,
            "pipe_diameter_inches": 40.0,
            "design_wall_thickness_mm": 22.2,
        }
        r4 = requests.post(f"{API_BASE}/predict-kp", json=payload)
        print(f"4. POST /api/predict-kp: HTTP {r4.status_code}")
        print("   Prediction result:", r4.json())

    except Exception as e:
        print("API test error:", e)

if __name__ == "__main__":
    test_endpoints()
