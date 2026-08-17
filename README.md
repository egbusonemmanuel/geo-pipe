# GIS-Based Environmental Hazard Risk Assessment Demonstrator

This repository contains a demonstrator full-stack application for environmental hazard risk assessment using synthetic location-based data.

## Structure

- `backend/` — Python FastAPI backend, model training, and synthetic environmental location data.
- `frontend/` — React + Vite web dashboard with map visualization and location-level risk details.

## Setup

### Backend

1. Open terminal in `backend/`
2. Create a Python virtual environment (recommended):
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Generate synthetic sample data and train the model:
   ```bash
   python scripts\generate_synthetic_data.py
   python -m app.model
   ```
5. Run the backend API:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

### Frontend

1. Open terminal in `frontend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev -- --host
   ```
4. Open the URL shown by Vite in your browser.

## Application

- The backend exposes a GeoJSON-style locations API and a model prediction endpoint.
- The frontend fetches environmental location data and renders an interactive risk map.

## Production Operations

- `GET /health` reports whether the API process and trained models are ready. Render uses this endpoint for service health checks.
- For production, set `CORS_ALLOW_ORIGINS` on Render to the exact frontend origin (for example, `https://your-project.vercel.app`). Multiple origins can be comma-separated.
- The backend loads the trained prediction models once when the service starts, so prediction requests do not reload them from disk.

### Verification

Run the backend API tests from `backend/`:

```bash
python -m unittest discover -s tests -v
```

Build the frontend from `frontend/`:

```bash
npm run build
```

GitHub Actions runs both checks on pushes and pull requests.

## Notes

- This implementation uses synthetic sample data to demonstrate the workflow.
- The model is a basic random forest classifier designed for a thesis demonstrator; it can be replaced with real environmental hazard datasets.
