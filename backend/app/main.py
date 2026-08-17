import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import segments


def get_cors_origins() -> list[str]:
    """Read a comma-separated allowlist without breaking local development."""
    configured_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
    origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    return origins or ["*"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Fail fast during deployment if the packaged prediction models cannot load.
    segments.load_prediction_models()
    yield


app = FastAPI(
    title="Environmental Hazard Risk API",
    description="API for environmental hazard location risk data and predictions.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health", tags=["health"])
async def health_check():
    """Lightweight readiness endpoint used by Render and uptime monitors."""
    return {
        "status": "ok",
        "service": "pipe-ai-backend",
        "version": app.version,
        "models_loaded": segments.prediction_models_loaded(),
    }


app.include_router(segments.router, prefix="/api")
