import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.utils.image_utils import load_pil_image, save_pil_image, generate_file_id
from app.services.ai_service import transform_to_pixel_art, get_provider_status

router = APIRouter()

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")


class AITransformRequest(BaseModel):
    source_path: str
    prompt: str = (
        "pixel art game character sprite, 16-bit retro style, "
        "clean transparent background, game asset"
    )
    strength: float = Field(default=0.75, ge=0.1, le=1.0)


@router.post("")
async def ai_transform(req: AITransformRequest):
    src = req.source_path.lstrip("/")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail=f"Source file not found: {src}")

    try:
        img = load_pil_image(src)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        result = await transform_to_pixel_art(img, prompt=req.prompt, strength=req.strength)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI transform failed: {e}")

    out_id = generate_file_id()
    out_name = f"ai_{out_id}.png"
    save_pil_image(result, OUTPUT_DIR, out_name)

    return JSONResponse(
        {
            "ai_id":       out_id,
            "result_url":  f"/outputs/{out_name}",
            "provider":    get_provider_status()["active"],
            "prompt":      req.prompt,
        }
    )


@router.get("/status")
def ai_status():
    """Return which AI providers are configured."""
    return JSONResponse(get_provider_status())
