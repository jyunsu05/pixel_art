"""
Video router.
POST /api/video/upload  — Upload a video file (mp4, gif, webm, avi)
POST /api/video/extract — Extract frames from an uploaded video
GET  /api/video/info    — Get video metadata
"""

import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import aiofiles

from app.utils.image_utils import generate_file_id, save_pil_image
from app.services.video_service import (
    extract_frames_from_video,
    extract_frames_from_gif,
    get_video_info,
)
from app.services.export_service import build_sprite_sheet

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")

ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/x-msvideo",
    "video/quicktime",
    "image/gif",
    "application/octet-stream",  # some browsers send this for .gif/.webm
}
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100 MB


# ── Upload ──────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    contents = await file.read()
    if len(contents) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=413, detail="Video file exceeds 100 MB limit")

    ext = os.path.splitext(file.filename or "video.mp4")[1].lower() or ".mp4"
    if ext not in (".mp4", ".webm", ".avi", ".mov", ".gif"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {ext}. Supported: mp4, webm, avi, mov, gif",
        )

    file_id = generate_file_id()
    filename = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(contents)

    # Get basic metadata
    try:
        info = get_video_info(filepath)
    except Exception:
        info = {}

    return JSONResponse(
        {
            "file_id": file_id,
            "filename": filename,
            "url": f"/uploads/{filename}",
            "size": len(contents),
            "ext": ext,
            "info": info,
        }
    )


# ── Extract frames ──────────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    filename: str
    max_frames: int = Field(default=8, ge=1, le=24)
    frame_interval: int = Field(default=1, ge=1, le=30)
    apply_pixelate: bool = False
    pixel_size: int = Field(default=32, ge=4, le=128)
    num_colors: int = Field(default=24, ge=2, le=64)
    background_removal: bool = False
    # Sprite sheet options
    character_name: str = Field(default="Character", max_length=32)
    action: str = Field(default="walk", max_length=32)
    cell_size: int = Field(default=64, ge=16, le=256)
    auto_build_sheet: bool = True


@router.post("/extract")
def extract_frames(req: ExtractRequest):
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Video not found: {req.filename}")

    ext = os.path.splitext(req.filename)[1].lower()

    try:
        if ext == ".gif":
            frames = extract_frames_from_gif(filepath, max_frames=req.max_frames)
            # Apply pixelation if requested
            if req.apply_pixelate:
                from app.services.pixel_service import pixelate_cv2
                pixelated = []
                for f in frames:
                    _, raw = pixelate_cv2(f, pixel_size=req.pixel_size, num_colors=req.num_colors, preview_scale=1)
                    pixelated.append(raw)
                frames = pixelated
        else:
            frames = extract_frames_from_video(
                filepath,
                max_frames=req.max_frames,
                frame_interval=req.frame_interval,
                apply_pixelate=req.apply_pixelate,
                pixel_size=req.pixel_size,
                num_colors=req.num_colors,
                background_removal=req.background_removal,
            )
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame extraction failed: {e}")

    session_id = generate_file_id()

    # Save individual frames
    frame_urls = []
    for i, frame in enumerate(frames):
        fname = f"vframe_{session_id}_{req.action}_{i:02d}.png"
        save_pil_image(frame, OUTPUT_DIR, fname)
        frame_urls.append(f"/outputs/{fname}")

    result = {
        "session_id": session_id,
        "frame_count": len(frames),
        "frame_urls": frame_urls,
    }

    # Auto-build sprite sheet
    if req.auto_build_sheet:
        sheet_result = build_sprite_sheet(
            frames=frames,
            action=req.action,
            character_name=req.character_name,
            cell_size=req.cell_size,
            output_dir=OUTPUT_DIR,
            file_id=session_id,
        )
        result["sheet_url"] = sheet_result["sheet_url"]
        result["json_url"] = sheet_result["json_url"]
        result["metadata"] = sheet_result["metadata"]

    return JSONResponse(result)


# ── Video info ──────────────────────────────────────────────────────────────

@router.get("/info")
def video_info(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    try:
        info = get_video_info(filepath)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse({"filename": filename, "info": info})
