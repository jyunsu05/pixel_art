"""
Google Colab / 원격 GPU에서 실행하는 미니 FastAPI 백엔드.

- 같은 런타임의 Stable Diffusion WebUI(API, 포트 7860)에 httpx로 호출합니다.
- 로컬 pixel_art 프론트(Vercel)와 호환되도록 `/api/upload`, `/api/ai/*` 를 제공합니다.

환경 변수:
  SD_WEBUI_URL   기본 http://127.0.0.1:7860
  CORS_ORIGINS   쉼표 구분 (반드시 Vercel 도메인 포함)
  UPLOAD_DIR     기본 /tmp/colab_uploads
  OUTPUT_DIR     기본 /tmp/colab_outputs
  CANNY_MODEL    ControlNet 모델 표시 이름(WebUI 드롭다운과 동일)
  SKIP_LORA_TAGS 1 이면 프롬프트에서 <lora:...> 제외

실행 예:
  uvicorn colab_pixel_backend:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import base64
import io
import os
import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw

# ─── 동일 런타임 내 SD WebUI ────────────────────────────────────────────────

SD_WEBUI_URL = os.getenv("SD_WEBUI_URL", "http://127.0.0.1:7860").rstrip("/")
CANNY_MODEL = os.getenv("CANNY_MODEL", "control_v11p_sd15_canny [b18e0966]")
REFONLY_MODULE = "reference_only"

DEFAULT_LORA_PIXEL = os.getenv("LORA_PIXEL", "pixel_art")
DEFAULT_LORA_CHIBI = os.getenv("LORA_CHIBI", "chibi_style")

BASE_POSITIVE = (
    "best quality, masterpiece, pixel art game character sprite, "
    "chibi proportions, bold dark outline, flat colors, clean palette, "
    "transparent background, front view, full body"
)
BASE_NEGATIVE = (
    "worst quality, low quality, photo, realistic, 3d render, "
    "blurry, gradient, noise, watermark, background, extra limbs, "
    "deformed, ugly, bad anatomy"
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/colab_uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/colab_outputs"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,https://pixelart-snowy.vercel.app",
    ).split(",")
    if o.strip()
]

app = FastAPI(title="Pixel Art SD Colab Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


def _sd_candidates(sd_url: str) -> list[str]:
    u = sd_url.strip().rstrip("/")
    out = [u]
    if "127.0.0.1" in u:
        out.append(u.replace("127.0.0.1", "localhost", 1))
    elif "localhost" in u.lower():
        out.append(u.replace("localhost", "127.0.0.1", 1))
    return list(dict.fromkeys(out))


def default_skeleton_sheet_png_bytes() -> bytes:
    W, H = 512, 512
    cols, rows = 4, 4
    cw, ch = W // cols, H // rows
    img = Image.new("RGBA", (W, H), (248, 249, 252, 255))
    d = ImageDraw.Draw(img)
    for r in range(rows + 1):
        d.line([(0, r * ch), (W, r * ch)], fill=(220, 224, 232, 255), width=1)
    for c in range(cols + 1):
        d.line([(c * cw, 0), (c * cw, H)], fill=(220, 224, 232, 255), width=1)
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cw, r * ch
            cx = x0 + cw // 2
            bot, top = y0 + ch - 18, y0 + 22
            off = (c % 4 - 1.5) * 6
            d.ellipse(
                [cx - 10 + off, top, cx + 10 + off, top + 18],
                outline=(45, 52, 70, 255),
                width=2,
            )
            d.line([(cx + off, top + 18), (cx + off, bot - 28)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, y0 + ch // 2), (x0 + 18, y0 + ch // 2 + 8)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, y0 + ch // 2), (x0 + cw - 18, y0 + ch // 2 + 8)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, bot - 28), (x0 + 22, bot)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, bot - 28), (x0 + cw - 22, bot)], fill=(45, 52, 70, 255), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def split_sprite_sheet(
    sheet: Image.Image,
    num_frames: int,
    sheet_cols: int = 0,
    sheet_rows: int = 1,
    row_index: int = 0,
) -> list[Image.Image]:
    sheet = sheet.convert("RGBA")
    w, h = sheet.size
    if sheet_cols > 0:
        fw = w // sheet_cols
        fh = h // max(sheet_rows, 1)
        y0 = row_index * fh
        frames = [sheet.crop((c * fw, y0, (c + 1) * fw, y0 + fh)) for c in range(sheet_cols)]
        return frames[:num_frames]
    fw = w // num_frames
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(num_frames)]


def _assemble_sprite_sheet(frames: list[Image.Image], fw: int, fh: int) -> Image.Image:
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        t = frame.resize((fw, fh), Image.NEAREST)
        sheet.paste(t, (i * fw, 0), t)
    return sheet


def _pil_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


async def check_sd_connection(sd_url: str) -> dict:
    sd_url = sd_url.strip().rstrip("/") or SD_WEBUI_URL
    primary = _sd_candidates(sd_url)[0]
    last_err: Optional[Exception] = None
    async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
        for base in _sd_candidates(sd_url):
            try:
                resp = await client.get(f"{base}/sdapi/v1/options")
                resp.raise_for_status()
                data = resp.json()
                return {"connected": True, "model": data.get("sd_model_checkpoint", "unknown"), "url": base}
            except Exception as e:
                last_err = e
                continue
    err = str(last_err) if last_err else "unknown"
    return {"connected": False, "error": err + " — WebUI --api 및 실행 확인.", "url": primary}


async def resolve_sd_base(sd_url: str) -> str:
    r = await check_sd_connection(sd_url or SD_WEBUI_URL)
    if not r.get("connected"):
        raise ConnectionError(r.get("error", "SD unreachable"))
    return str(r["url"]).rstrip("/")


async def _generate_single_frame(
    skeleton_frame: Image.Image,
    ref_b64: str,
    sd_url: str,
    prompt: str,
    negative: str,
    steps: int,
    cfg_scale: float,
    denoising: float,
    canny_weight: float,
    ref_weight: float,
    width: int,
    height: int,
    canny_low: int,
    canny_high: int,
    use_ref_only: bool,
    skel_is_lineart: bool,
) -> Image.Image:
    skel_b64 = _pil_to_b64(skeleton_frame.convert("RGB"))
    cn_canny = {
        "enabled": True,
        "input_image": skel_b64,
        "module": "none" if skel_is_lineart else "canny",
        "model": CANNY_MODEL,
        "weight": canny_weight,
        "resize_mode": 1,
        "lowvram": False,
        "processor_res": 512,
        "threshold_a": canny_low,
        "threshold_b": canny_high,
        "guidance_start": 0.0,
        "guidance_end": 1.0,
        "control_mode": 2,
        "pixel_perfect": True,
    }
    cn_ref = {
        "enabled": True,
        "input_image": ref_b64,
        "module": REFONLY_MODULE,
        "model": "none",
        "weight": ref_weight,
        "resize_mode": 1,
        "control_mode": 0,
        "pixel_perfect": True,
    }
    cn_args = [cn_canny]
    if use_ref_only:
        cn_args.append(cn_ref)

    payload = {
        "prompt": prompt,
        "negative_prompt": negative,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "sampler_name": "DPM++ 2M Karras",
        "batch_size": 1,
        "n_iter": 1,
        "alwayson_scripts": {"ControlNet": {"args": cn_args}},
    }

    async with httpx.AsyncClient(timeout=300.0, trust_env=False) as client:
        resp = await client.post(f"{sd_url}/sdapi/v1/txt2img", json=payload)
        resp.raise_for_status()
        b64 = resp.json()["images"][0]
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


async def generate_animation_frames(**kw) -> dict:
    sd_url = await resolve_sd_base(kw.get("sd_url") or SD_WEBUI_URL)
    skeleton_sheet = kw["skeleton_sheet"]
    reference_photo = kw["reference_photo"]
    num_frames = kw.get("num_frames", 8)
    sheet_cols = kw.get("sheet_cols", 0)
    sheet_rows = kw.get("sheet_rows", 1)
    row_index = kw.get("row_index", 0)
    extra_prompt = kw.get("extra_prompt", "") or ""
    extra_negative = kw.get("extra_negative", "") or ""
    lora_pixel = kw.get("lora_pixel", DEFAULT_LORA_PIXEL)
    lora_chibi = kw.get("lora_chibi", DEFAULT_LORA_CHIBI)
    lora_weight = float(kw.get("lora_weight", 1.0))
    steps = int(kw.get("steps", 25))
    cfg_scale = float(kw.get("cfg_scale", 7.5))
    denoising = float(kw.get("denoising", 0.5))
    canny_weight = float(kw.get("canny_weight", 1.8))
    ref_weight = float(kw.get("ref_weight", 0.7))
    frame_width = int(kw.get("frame_width", 512))
    frame_height = int(kw.get("frame_height", 512))
    canny_low = int(kw.get("canny_low", 100))
    canny_high = int(kw.get("canny_high", 200))
    use_ref_only = kw.get("use_ref_only", True)
    skel_is_lineart = kw.get("skel_is_lineart", False)

    if os.getenv("SKIP_LORA_TAGS", "").strip() in ("1", "true", "yes"):
        prompt = BASE_POSITIVE + (f", {extra_prompt}" if extra_prompt else "")
    else:
        lora_tags = f"<lora:{lora_pixel}:{lora_weight:.2f}>, <lora:{lora_chibi}:{lora_weight:.2f}>"
        prompt = f"{BASE_POSITIVE}, {lora_tags}" + (f", {extra_prompt}" if extra_prompt else "")
    negative = BASE_NEGATIVE + (f", {extra_negative}" if extra_negative else "")
    ref_b64 = _pil_to_b64(reference_photo.convert("RGB"))

    skeleton_frames = split_sprite_sheet(
        skeleton_sheet, num_frames,
        sheet_cols=sheet_cols, sheet_rows=sheet_rows, row_index=row_index,
    )
    result_frames: list[Image.Image] = []
    for i, skel in enumerate(skeleton_frames):
        print(f"[colab SD] frame {i + 1}/{len(skeleton_frames)}")
        frame = await _generate_single_frame(
            skeleton_frame=skel,
            ref_b64=ref_b64,
            sd_url=sd_url,
            prompt=prompt,
            negative=negative,
            steps=steps,
            cfg_scale=cfg_scale,
            denoising=denoising,
            canny_weight=canny_weight,
            ref_weight=ref_weight,
            width=frame_width,
            height=frame_height,
            canny_low=canny_low,
            canny_high=canny_high,
            use_ref_only=use_ref_only,
            skel_is_lineart=skel_is_lineart,
        )
        result_frames.append(frame)

    sheet = _assemble_sprite_sheet(result_frames, frame_width, frame_height)
    return {"frames": result_frames, "frame_count": len(result_frames), "sprite_sheet": sheet}


router = APIRouter()


@router.get("/status")
def ai_status_stub():
    return JSONResponse({"provider": "colab-fastapi", "sd_webui": SD_WEBUI_URL})


@router.get("/sd/status")
async def sd_status(url: str = SD_WEBUI_URL):
    return JSONResponse(await check_sd_connection(url))


@router.get("/sd/loras")
async def sd_loras(url: str = SD_WEBUI_URL):
    async with httpx.AsyncClient(timeout=25.0, trust_env=False) as client:
        for base in _sd_candidates(url.strip().rstrip("/") or SD_WEBUI_URL):
            try:
                resp = await client.get(f"{base}/sdapi/v1/loras")
                resp.raise_for_status()
                return JSONResponse({"loras": resp.json()})
            except Exception:
                continue
    return JSONResponse({"loras": []})


@router.get("/skeleton-default")
async def skeleton_default():
    return Response(content=default_skeleton_sheet_png_bytes(), media_type="image/png")


@router.post("/animate")
async def animate(
    skeleton_sheet: UploadFile = File(...),
    reference_photo: UploadFile = File(...),
    sd_url: str = Form(default=SD_WEBUI_URL),
    num_frames: int = Form(default=8),
    extra_prompt: str = Form(default=""),
    extra_negative: str = Form(default=""),
    lora_pixel: str = Form(default=DEFAULT_LORA_PIXEL),
    lora_chibi: str = Form(default=DEFAULT_LORA_CHIBI),
    lora_weight: float = Form(default=1.0),
    steps: int = Form(default=25),
    cfg_scale: float = Form(default=7.5),
    canny_weight: float = Form(default=1.0),
    ref_weight: float = Form(default=0.8),
    frame_width: int = Form(default=512),
    frame_height: int = Form(default=512),
    remove_bg: bool = Form(default=True),
    use_ref_only: bool = Form(default=True),
    output_width: int = Form(default=64),
    output_height: int = Form(default=64),
    sheet_cols: int = Form(default=0),
    sheet_rows: int = Form(default=1),
    row_index: int = Form(default=0),
    skel_is_lineart: bool = Form(default=False),
):
    try:
        sk_img = Image.open(io.BytesIO(await skeleton_sheet.read())).convert("RGBA")
        ref_img = Image.open(io.BytesIO(await reference_photo.read())).convert("RGBA")
    except Exception as e:
        raise HTTPException(400, f"이미지 로드 실패: {e}")

    try:
        result = await generate_animation_frames(
            skeleton_sheet=sk_img,
            reference_photo=ref_img,
            sd_url=sd_url,
            num_frames=num_frames,
            extra_prompt=extra_prompt,
            extra_negative=extra_negative,
            lora_pixel=lora_pixel,
            lora_chibi=lora_chibi,
            lora_weight=lora_weight,
            steps=steps,
            cfg_scale=cfg_scale,
            denoising=0.5,
            canny_weight=canny_weight,
            ref_weight=ref_weight,
            frame_width=frame_width,
            frame_height=frame_height,
            remove_bg=remove_bg,
            canny_low=100,
            canny_high=200,
            use_ref_only=use_ref_only,
            sheet_cols=sheet_cols,
            sheet_rows=sheet_rows,
            row_index=row_index,
            skel_is_lineart=skel_is_lineart,
        )
    except ConnectionError as e:
        raise HTTPException(503, str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"WebUI 오류: {e.response.status_code} {e.response.text[:500]}")
    except Exception as e:
        raise HTTPException(502, f"생성 실패: {e}")

    session = uuid.uuid4().hex[:12]
    frame_urls = []
    for i, frame in enumerate(result["frames"]):
        small = frame.resize((output_width, output_height), Image.NEAREST)
        name = f"frame_{session}_{i:02d}.png"
        small.save(OUTPUT_DIR / name)
        frame_urls.append(f"/outputs/{name}")

    sheet = _assemble_sprite_sheet(
        [f.resize((output_width, output_height), Image.NEAREST) for f in result["frames"]],
        output_width,
        output_height,
    )
    sheet_name = f"sprite_sheet_{session}.png"
    sheet.save(OUTPUT_DIR / sheet_name)

    return JSONResponse({
        "session": session,
        "frame_urls": frame_urls,
        "sprite_sheet_url": f"/outputs/{sheet_name}",
        "frame_count": result["frame_count"],
        "frame_size": f"{output_width}×{output_height}",
    })


upload_router = APIRouter()


@upload_router.post("")
async def upload_image(file: UploadFile = File(...)):
    ext = Path(file.filename or "img.png").suffix or ".png"
    fid = uuid.uuid4().hex[:16]
    fname = f"{fid}{ext}"
    data = await file.read()
    dest = UPLOAD_DIR / fname
    dest.write_bytes(data)
    return JSONResponse({
        "file_id": fid,
        "filename": fname,
        "original_name": file.filename,
        "url": f"/uploads/{fname}",
        "size": len(data),
        "content_type": file.content_type or "application/octet-stream",
    })


@upload_router.post("/bg-removed")
async def upload_bg_removed(file: UploadFile = File(...)):
    fid = uuid.uuid4().hex[:16]
    fname = f"manual_bg_{fid}.png"
    data = await file.read()
    dest = OUTPUT_DIR / fname
    dest.write_bytes(data)
    return JSONResponse({"file_id": fid, "filename": fname, "url": f"/outputs/{fname}", "size": len(data)})


app.include_router(router, prefix="/api/ai")
app.include_router(upload_router, prefix="/api/upload")


@app.get("/health")
def health():
    return {"status": "ok", "sd_webui": SD_WEBUI_URL, "cors": CORS_ORIGINS}

