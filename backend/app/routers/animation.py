import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Literal

from app.utils.image_utils import load_pil_image, save_pil_image, generate_file_id
from app.services.animation_service import generate_frames, MOTIONS

router = APIRouter()

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")

MotionType = Literal["idle", "walk", "attack", "jump", "hurt"]


class AnimationRequest(BaseModel):
    source_path: str
    motion: MotionType = "walk"
    frame_count: int = Field(default=0, ge=0, le=12)  # 0 = use default


@router.post("")
def create_animation(req: AnimationRequest):
    src = req.source_path.lstrip("/")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail=f"Source file not found: {src}")

    try:
        img = load_pil_image(src)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    fc = req.frame_count if req.frame_count > 0 else None
    frames = generate_frames(img, motion=req.motion, frame_count=fc)

    session_id = generate_file_id()
    frame_urls = []
    for i, frame in enumerate(frames):
        fname = f"anim_{session_id}_{req.motion}_{i:02d}.png"
        save_pil_image(frame, OUTPUT_DIR, fname)
        frame_urls.append(f"/outputs/{fname}")

    return JSONResponse(
        {
            "session_id": session_id,
            "motion": req.motion,
            "frame_count": len(frames),
            "frame_urls": frame_urls,
            "motion_info": MOTIONS.get(req.motion, {}),
        }
    )


@router.get("/motions")
def list_motions():
    return JSONResponse({"motions": MOTIONS})
