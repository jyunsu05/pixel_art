import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from app.routers import upload, pixel, chromakey, ai_transform, animation, export, video

load_dotenv()

app = FastAPI(
    title="Pixel Art Converter API",
    description="Convert images to Unity-ready pixel art sprite resources",
    version="1.0.0",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
app.include_router(pixel.router, prefix="/api/pixel", tags=["Pixel"])
app.include_router(chromakey.router, prefix="/api/chromakey", tags=["Chromakey"])
app.include_router(ai_transform.router, prefix="/api/ai", tags=["AI Transform"])
app.include_router(animation.router, prefix="/api/animation", tags=["Animation"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])
app.include_router(video.router, prefix="/api/video", tags=["Video"])


@app.get("/")
def root():
    return {"message": "Pixel Art Converter API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
