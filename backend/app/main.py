from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import segments

app = FastAPI(
    title="Environmental Hazard Risk API",
    description="API for environmental hazard location risk data and predictions.",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(segments.router, prefix="/api")
