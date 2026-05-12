import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Literal, Optional

from app.utils.image_utils import load_pil_image, save_pil_image, generate_file_id
from app.services.chromakey_service import remove_chroma, remove_chroma_custom_color

router = APIRouter()

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")


class ChromakeyRequest(BaseModel):
    source_path: str  # relative path under outputs/ or uploads/
    color: Literal["green", "blue", "red", "magenta", "custom"] = "green"
    tolerance: int = Field(default=30, ge=0, le=100)
    spill_reduction: bool = True
    feather_radius: int = Field(default=1, ge=0, le=5)
    # Only used when color == "custom"
    custom_rgb: Optional[list[int]] = None


@router.post("")
def apply_chromakey(req: ChromakeyRequest):
    # Accept both /outputs/... and /uploads/... prefixed paths
    src = req.source_path.lstrip("/")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail=f"Source file not found: {src}")

    try:
        img = load_pil_image(src)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if req.color == "custom":
        if not req.custom_rgb or len(req.custom_rgb) != 3:
            raise HTTPException(
                status_code=400, detail="custom_rgb must be [R, G, B] when color=custom"
            )
        result = remove_chroma_custom_color(
            img,
            tuple(req.custom_rgb),
            tolerance=req.tolerance,
            feather_radius=req.feather_radius,
        )
    else:
        result = remove_chroma(
            img,
            color=req.color,
            tolerance=req.tolerance,
            spill_reduction=req.spill_reduction,
            feather_radius=req.feather_radius,
        )

    out_id = generate_file_id()
    out_name = f"chroma_{out_id}.png"
    save_pil_image(result, OUTPUT_DIR, out_name)

    return JSONResponse(
        {
            "chroma_id": out_id,
            "result_url": f"/outputs/{out_name}",
            "color_removed": req.color,
            "dimensions": {"width": result.width, "height": result.height},
        }
    )
