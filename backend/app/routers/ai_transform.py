"""
AI Transform router.

Endpoints:
  POST /api/ai/generate      — single character pixel art (txt2img + dual ControlNet)
  POST /api/ai/animate       — 8-frame animation sprite sheet
  GET  /api/ai/skeleton-default — built-in placeholder skeleton PNG
  GET  /api/ai/sd/status     — check SD WebUI connection
  GET  /api/ai/sd/loras      — list installed LoRAs
"""

import io
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response
from PIL import Image

from app.utils.image_utils import save_pil_image, generate_file_id
from app.services.sd_service import (
    generate_animation_frames,
    check_sd_connection,
    get_available_loras,
    _remove_background,
    DEFAULT_SD_URL,
    default_skeleton_sheet_png_bytes,
    resolve_sd_webui_base,
)

router    = APIRouter()
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/tmp/outputs")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/uploads")


# ---------------------------------------------------------------------------
# POST /api/ai/animate
# Accept: multipart/form-data
#   - skeleton_sheet  : PNG file  (8-frame horizontal strip)
#   - reference_photo : PNG/JPEG file (user's character photo)
#   - sd_url, num_frames, lora_pixel, lora_chibi, lora_weight, ...
# ---------------------------------------------------------------------------

@router.post("/animate")
async def animate(
    skeleton_sheet:  UploadFile = File(..., description="8-frame horizontal skeleton strip"),
    reference_photo: UploadFile = File(..., description="User character photo"),
    sd_url:          str  = Form(default=DEFAULT_SD_URL),
    num_frames:      int  = Form(default=8),
    extra_prompt:    str  = Form(default=""),
    extra_negative:  str  = Form(default=""),
    lora_pixel:      str  = Form(default="pixel_art"),
    lora_chibi:      str  = Form(default="chibi_style"),
    lora_weight:     float = Form(default=1.0),
    steps:           int  = Form(default=25),
    cfg_scale:       float = Form(default=7.5),
    canny_weight:    float = Form(default=1.0),
    ref_weight:      float = Form(default=0.8),
    frame_width:     int  = Form(default=512),
    frame_height:    int  = Form(default=512),
    remove_bg:       bool = Form(default=True),
    use_ref_only:    bool = Form(default=True),
    output_width:    int  = Form(default=64),   # final art pixel size per frame
    output_height:   int  = Form(default=64),
    sheet_cols:      int  = Form(default=0),    # grid cols (0 = horizontal strip)
    sheet_rows:      int  = Form(default=1),    # grid rows
    row_index:       int  = Form(default=0),    # which row to use
    skel_is_lineart: bool = Form(default=False), # skip canny preprocessor if already lineart
):
    # Load images
    try:
        skeleton_img  = Image.open(io.BytesIO(await skeleton_sheet.read())).convert("RGBA")
        reference_img = Image.open(io.BytesIO(await reference_photo.read())).convert("RGBA")
    except Exception as e:
        detail = str(e)
        if "cannot identify image file" in detail.lower():
            detail += (
                " — HTML(웹 페이지)이 PNG로 넘어온 경우가 많습니다. "
                "기본 뼈대는 /api/ai/skeleton-default 를 쓰고, 참조 이미지는 실제 PNG/JPEG URL(/uploads/…)인지 확인하세요."
            )
        raise HTTPException(400, f"이미지 로드 실패: {detail}")

    # Generate frames
    try:
        result = await generate_animation_frames(
            skeleton_sheet  = skeleton_img,
            reference_photo = reference_img,
            sd_url          = sd_url,
            num_frames      = num_frames,
            extra_prompt    = extra_prompt,
            extra_negative  = extra_negative,
            lora_pixel      = lora_pixel,
            lora_chibi      = lora_chibi,
            lora_weight     = lora_weight,
            steps           = steps,
            cfg_scale       = cfg_scale,
            canny_weight    = canny_weight,
            ref_weight      = ref_weight,
            frame_width     = frame_width,
            frame_height    = frame_height,
            remove_bg       = remove_bg,
            use_ref_only    = use_ref_only,
            sheet_cols      = sheet_cols,
            sheet_rows      = sheet_rows,
            row_index       = row_index,
            skel_is_lineart = skel_is_lineart,
        )
    except ConnectionError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"생성 실패: {e}")

    session = generate_file_id()
    frame_urls = []

    # Save individual frames (resized to output pixel art size)
    for i, frame in enumerate(result["frames"]):
        small  = frame.resize((output_width, output_height), Image.NEAREST)
        name   = f"frame_{session}_{i:02d}.png"
        save_pil_image(small, OUTPUT_DIR, name)
        frame_urls.append(f"/outputs/{name}")

    # Save sprite sheet
    from app.services.sd_service import _assemble_sprite_sheet
    sheet      = _assemble_sprite_sheet(
        [f.resize((output_width, output_height), Image.NEAREST)
         for f in result["frames"]],
        output_width, output_height,
    )
    sheet_name = f"sprite_sheet_{session}.png"
    save_pil_image(sheet, OUTPUT_DIR, sheet_name)

    return JSONResponse({
        "session":          session,
        "frame_urls":       frame_urls,
        "sprite_sheet_url": f"/outputs/{sheet_name}",
        "frame_count":      result["frame_count"],
        "frame_size":       f"{output_width}×{output_height}",
    })


# ---------------------------------------------------------------------------
# POST /api/ai/generate  (single image — for preview/testing)
# ---------------------------------------------------------------------------

@router.post("/generate")
async def generate_single(
    reference_photo: UploadFile = File(...),
    sd_url:      str   = Form(default=DEFAULT_SD_URL),
    extra_prompt: str  = Form(default=""),
    lora_pixel:  str   = Form(default="pixel_art"),
    lora_chibi:  str   = Form(default="chibi_style"),
    lora_weight: float = Form(default=1.0),
    steps:       int   = Form(default=25),
    cfg_scale:   float = Form(default=7.5),
    width:       int   = Form(default=512),
    height:      int   = Form(default=512),
    remove_bg:   bool  = Form(default=True),
):
    """Generate a single pixel art character (no skeleton — no ControlNet Canny)."""
    try:
        ref_img = Image.open(io.BytesIO(await reference_photo.read())).convert("RGBA")
    except Exception as e:
        detail = str(e)
        if "cannot identify image file" in detail.lower():
            detail += " — 업로드 파일이 손상되었거나 PNG/JPEG가 아닐 수 있습니다."
        raise HTTPException(400, f"이미지 로드 실패: {detail}")

    from app.services.sd_service import _generate_single_frame, _pil_to_b64, BASE_POSITIVE, BASE_NEGATIVE

    lora_tags = f"<lora:{lora_pixel}:{lora_weight:.2f}>, <lora:{lora_chibi}:{lora_weight:.2f}>"
    prompt    = f"{BASE_POSITIVE}, {lora_tags}"
    if extra_prompt:
        prompt += f", {extra_prompt}"

    # Use a blank white image as skeleton (no pose constraint)
    blank = Image.new("RGB", (width, height), (255, 255, 255))

    try:
        sd_base = await resolve_sd_webui_base(sd_url)
    except ConnectionError as e:
        raise HTTPException(503, str(e))

    try:
        result = await _generate_single_frame(
            skeleton_frame = blank,
            ref_b64        = _pil_to_b64(ref_img.convert("RGB")),
            sd_url         = sd_base,
            prompt         = prompt,
            negative       = BASE_NEGATIVE,
            steps          = steps,
            cfg_scale      = cfg_scale,
            denoising      = 0.75,
            canny_weight   = 0.0,   # disabled
            ref_weight     = 0.8,
            width          = width,
            height         = height,
            canny_low      = 100,
            canny_high     = 200,
            use_ref_only   = True,
        )
    except ConnectionError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, str(e))

    if remove_bg:
        result = _remove_background(result)

    out_id   = generate_file_id()
    out_name = f"gen_{out_id}.png"
    save_pil_image(result, OUTPUT_DIR, out_name)

    return JSONResponse({
        "result_url": f"/outputs/{out_name}",
        "prompt":     prompt,
        "provider":   "stable-diffusion",
    })


# ---------------------------------------------------------------------------
# GET /api/ai/skeleton-default
# ---------------------------------------------------------------------------

@router.get("/skeleton-default")
async def skeleton_default_png():
    return Response(content=default_skeleton_sheet_png_bytes(), media_type="image/png")


# ---------------------------------------------------------------------------
# GET /api/ai/sd/status
# ---------------------------------------------------------------------------

@router.get("/sd/status")
async def sd_status(url: str = DEFAULT_SD_URL):
    return JSONResponse(await check_sd_connection(url))


# ---------------------------------------------------------------------------
# GET /api/ai/sd/loras
# ---------------------------------------------------------------------------

@router.get("/sd/loras")
async def sd_loras(url: str = DEFAULT_SD_URL):
    loras = await get_available_loras(url)
    return JSONResponse({"loras": loras})


# ---------------------------------------------------------------------------
# GET /api/ai/status (legacy — kept for compatibility)
# ---------------------------------------------------------------------------

@router.get("/status")
def ai_status():
    from app.services.ai_service import get_provider_status
    return JSONResponse(get_provider_status())
