import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Literal

from app.utils.image_utils import load_pil_image, save_pil_image, generate_file_id
from app.services.pixel_service import pixelate_cv2
from app.services.bg_remove_service import auto_remove_background, auto_remove_background_human

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")


class PixelRequest(BaseModel):
    file_id: str
    filename: str
    pixel_size: int = Field(default=16, ge=4, le=128)
    num_colors: int = Field(default=16, ge=2, le=64)
    preview_scale: int = Field(default=8, ge=1, le=16)
    # Auto background removal before pixelating
    auto_remove_bg: bool = False
    bg_model: Literal["general", "human"] = "human"


@router.post("")
def pixelate_image(req: PixelRequest):
    # Search in uploads/ first, then outputs/ (for manually bg-removed images)
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        filepath = os.path.join(OUTPUT_DIR, req.filename)
    try:
        img = load_pil_image(filepath)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Source image not found")

    # ── Step 0: Auto background removal (AI segmentation) ──────────────────
    bg_removed_url = None
    if req.auto_remove_bg:
        try:
            if req.bg_model == "human":
                img = auto_remove_background_human(img)
            else:
                img = auto_remove_background(img)

            out_id_bg = generate_file_id()
            bg_name = f"bg_removed_{out_id_bg}.png"
            save_pil_image(img, OUTPUT_DIR, bg_name)
            bg_removed_url = f"/outputs/{bg_name}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Background removal failed: {e}")

    # ── Step 1: Pixelate ────────────────────────────────────────────────────
    preview, raw = pixelate_cv2(
        img,
        pixel_size=req.pixel_size,
        num_colors=req.num_colors,
        preview_scale=req.preview_scale,
    )

    out_id = generate_file_id()
    preview_name = f"pixel_preview_{out_id}.png"
    raw_name = f"pixel_raw_{out_id}.png"

    save_pil_image(preview, OUTPUT_DIR, preview_name)
    save_pil_image(raw, OUTPUT_DIR, raw_name)

    return JSONResponse(
        {
            "pixel_id": out_id,
            "preview_url": f"/outputs/{preview_name}",
            "raw_url": f"/outputs/{raw_name}",
            "bg_removed_url": bg_removed_url,
            "auto_remove_bg": req.auto_remove_bg,
            "pixel_size": req.pixel_size,
            "num_colors": req.num_colors,
            "dimensions": {"width": raw.width, "height": raw.height},
        }
    )
