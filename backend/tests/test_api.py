import unittest

from fastapi.testclient import TestClient

from app.main import app


PREDICTION_PAYLOAD = {
    "flooding_index": 0.62,
    "earthquake_factor": 0.12,
    "erosion_factor": 0.30,
    "landslide_index": 0.18,
    "soil_corrosivity_index": 0.44,
    "hoop_stress_ratio": 0.59,
    "slope_deg": 12.5,
    "elevation": 180.0,
    "river_proximity_km": 0.8,
    "fault_distance_km": 1.5,
    "operating_pressure_psig": 1440.0,
    "pipe_diameter_inches": 40.0,
    "design_wall_thickness_mm": 22.2,
    "operational_age_years": 8.0,
}


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def test_health_check_reports_ready_models(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertTrue(response.json()["models_loaded"])

    def test_data_endpoints_return_expected_shapes(self):
        pipelines = self.client.get("/api/pipelines")
        stations = self.client.get("/api/stations")
        features = self.client.get("/api/kp-features?pipeline_id=1")

        self.assertEqual(pipelines.status_code, 200)
        self.assertEqual(pipelines.json()["type"], "FeatureCollection")
        self.assertGreater(len(pipelines.json()["features"]), 0)
        self.assertEqual(stations.status_code, 200)
        self.assertGreater(len(stations.json()), 0)
        self.assertEqual(features.status_code, 200)
        self.assertTrue(all(feature["pipeline_id"] == 1 for feature in features.json()))
        # Verify degradation fields in KP features
        first_kp = features.json()[0]
        self.assertIn("thickness_loss_mm", first_kp)
        self.assertIn("remaining_wall_thickness_mm", first_kp)
        self.assertIn("degradation_condition", first_kp)

    def test_prediction_returns_a_valid_risk_and_degradation_assessment(self):
        response = self.client.post("/api/predict-kp", json=PREDICTION_PAYLOAD)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn(body["risk_class"], {"Low", "Medium", "High", "Critical"})
        self.assertGreaterEqual(body["failure_probability"], 0.01)
        self.assertLessEqual(body["failure_probability"], 0.99)
        self.assertTrue(body["primary_hazard"])
        # Verify degradation response
        self.assertIn(body["degradation_condition"], {"Normal", "Moderate", "Critical"})
        self.assertGreater(body["thickness_loss_mm"], 0.0)
        self.assertGreater(body["remaining_wall_thickness_mm"], 0.0)
        self.assertLessEqual(body["remaining_wall_thickness_mm"], PREDICTION_PAYLOAD["design_wall_thickness_mm"])

    def test_prediction_rejects_an_incomplete_payload(self):
        response = self.client.post("/api/predict-kp", json={"flooding_index": 0.5})

        self.assertEqual(response.status_code, 422)
