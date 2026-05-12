import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.utils.image_utils import load_pil_image, save_pil_image, generate_file_id
from app.services.pixel_service import pixelate_cv2

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")


class PixelRequest(BaseModel):
    file_id: str
    filename: str
    pixel_size: int = Field(default=16, ge=4, le=128)
    num_colors: int = Field(default=16, ge=2, le=64)
    preview_scale: int = Field(default=8, ge=1, le=16)


@router.post("")
def pixelate_image(req: PixelRequest):
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    try:
        img = load_pil_image(filepath)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Source image not found")

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
            "pixel_size": req.pixel_size,
            "num_colors": req.num_colors,
            "dimensions": {"width": raw.width, "height": raw.height},
        }
    )
