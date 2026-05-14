import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from dotenv import load_dotenv

from app.routers import upload, pixel, chromakey, ai_transform, animation, export, video
from app.services.sd_service import default_skeleton_sheet_png_bytes

load_dotenv()

app = FastAPI(
    title="Pixel Art Converter API",
    description="Convert images to Unity-ready pixel art sprite resources",
    version="1.0.0",
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store_frontend_cache(request: Request, call_next):
    """Avoid stale JS/CSS after npm build (browser & ngrok caching)."""
    response = await call_next(request)
    p = request.url.path
    if p == "/" or p.startswith("/assets/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/tmp/outputs")
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/skeleton_base.png")
def legacy_skeleton_base_png():
    """Without a real static file, the SPA catch-all returned HTML and PIL failed."""
    return Response(content=default_skeleton_sheet_png_bytes(), media_type="image/png")


_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
_FRONTEND_DIST = os.path.normpath(_FRONTEND_DIST)

if os.path.isdir(_FRONTEND_DIST):
    _nocache = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"}
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"), headers=_nocache)

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file = os.path.join(_FRONTEND_DIST, full_path)
        if os.path.isfile(file):
            return FileResponse(file, headers=_nocache)
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"), headers=_nocache)
else:
    @app.get("/")
    def root():
        return {"message": "Pixel Art Converter API is running"}
