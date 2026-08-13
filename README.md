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

## Notes

- This implementation uses synthetic sample data to demonstrate the workflow.
- The model is a basic random forest classifier designed for a thesis demonstrator; it can be replaced with real environmental hazard datasets.
