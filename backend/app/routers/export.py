import os
import zipfile
import tempfile
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Literal

from app.utils.image_utils import load_pil_image, generate_file_id
from app.services.animation_service import generate_frames, MOTIONS
from app.services.export_service import build_sprite_sheet

router = APIRouter()

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")

MotionType = Literal["idle", "walk", "attack", "jump", "hurt"]


class ExportRequest(BaseModel):
    source_path: str
    character_name: str = Field(default="Character", min_length=1, max_length=32)
    action: MotionType = "walk"
    cell_size: int = Field(default=64, ge=16, le=256)
    frame_count: int = Field(default=0, ge=0, le=12)


@router.post("")
def export_sprite_sheet(req: ExportRequest):
    src = req.source_path.lstrip("/")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail=f"Source file not found: {src}")

    try:
        img = load_pil_image(src)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    fc = req.frame_count if req.frame_count > 0 else None
    frames = generate_frames(img, motion=req.action, frame_count=fc)

    file_id = generate_file_id()
    result = build_sprite_sheet(
        frames=frames,
        action=req.action,
        character_name=req.character_name,
        cell_size=req.cell_size,
        output_dir=OUTPUT_DIR,
        file_id=file_id,
    )

    return JSONResponse(
        {
            "export_id": file_id,
            "character_name": req.character_name,
            "action": req.action,
            "cell_size": req.cell_size,
            "frame_count": len(frames),
            "sheet_url": result["sheet_url"],
            "json_url": result["json_url"],
            "frame_urls": result["frame_urls"],
            "metadata": result["metadata"],
        }
    )


@router.post("/zip")
def export_zip(req: ExportRequest):
    """Return a downloadable ZIP with sheet PNG + JSON + individual frames."""
    src = req.source_path.lstrip("/")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail=f"Source file not found: {src}")

    try:
        img = load_pil_image(src)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    fc = req.frame_count if req.frame_count > 0 else None
    frames = generate_frames(img, motion=req.action, frame_count=fc)

    file_id = generate_file_id()
    result = build_sprite_sheet(
        frames=frames,
        action=req.action,
        character_name=req.character_name,
        cell_size=req.cell_size,
        output_dir=OUTPUT_DIR,
        file_id=file_id,
    )

    zip_name = f"{req.character_name}_{req.action}_{file_id}.zip"
    zip_path = os.path.join(OUTPUT_DIR, zip_name)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(result["sheet_path"], os.path.basename(result["sheet_path"]))
        zf.write(result["json_path"], os.path.basename(result["json_path"]))
        for fp in result["frame_paths"]:
            zf.write(fp, os.path.basename(fp))

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=zip_name,
    )
