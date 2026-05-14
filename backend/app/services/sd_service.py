"""
Stable Diffusion WebUI API service — AI pixel art animation generator.

Architecture:
  Frontend → (Colab ngrok URL) → SD WebUI API → result PNG

Core pipeline per animation frame
──────────────────────────────────
  1. Split user's 8-frame skeleton sheet into individual pose images.
  2. For EACH frame:
       a. txt2img with TWO ControlNet units:
            Unit 0 — Canny (skeleton frame)  → locks character pose
            Unit 1 — Reference-only (user photo) → extracts colour/style
       b. rembg  → remove background from generated image
  3. Assemble all frames into a horizontal sprite sheet.
  4. Return individual frame URLs + sprite sheet URL.

SD WebUI must be running with:
    --api  (to enable REST API)
    ControlNet extension installed
    (optional) IP-Adapter extension for better style transfer

Prompts:
    Positive: <lora:pixel_art:1>, <lora:chibi_style:1> + user additions
    Negative: standard photo/realistic negative
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
from typing import Optional

import httpx
from PIL import Image, ImageDraw

# rembg is optional — gracefully degrade if not installed
try:
    from rembg import remove as rembg_remove
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_SD_URL = os.getenv("SD_WEBUI_URL", "http://127.0.0.1:7860")

# LoRA weights embedded in the prompt
DEFAULT_LORA_PIXEL  = "pixel_art"
DEFAULT_LORA_CHIBI  = "chibi_style"
DEFAULT_LORA_WEIGHT = 1.0

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

# ControlNet model IDs (change if your WebUI uses different names)
CANNY_MODEL    = "control_v11p_sd15_canny [b18e0966]"
REFONLY_MODULE = "reference_only"   # no model file needed for reference-only


def _sd_url_candidates(sd_url: str) -> list[str]:
    """127.0.0.1 vs localhost can differ on Windows; probe both when applicable."""
    u = sd_url.strip().rstrip("/")
    order = [u]
    if "127.0.0.1" in u:
        order.append(u.replace("127.0.0.1", "localhost", 1))
    elif "localhost" in u.lower():
        order.append(u.replace("localhost", "127.0.0.1", 1))
    return list(dict.fromkeys(order))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_animation_frames(
    skeleton_sheet:   Image.Image,
    reference_photo:  Image.Image,
    sd_url:           str   = DEFAULT_SD_URL,
    num_frames:       int   = 8,
    extra_prompt:     str   = "",
    extra_negative:   str   = "",
    lora_pixel:       str   = DEFAULT_LORA_PIXEL,
    lora_chibi:       str   = DEFAULT_LORA_CHIBI,
    lora_weight:      float = DEFAULT_LORA_WEIGHT,
    steps:            int   = 25,
    cfg_scale:        float = 7.5,
    denoising:        float = 0.5,
    canny_weight:     float = 1.8,   # raised: ControlNet must not be ignored
    ref_weight:       float = 0.7,
    frame_width:      int   = 512,
    frame_height:     int   = 512,
    remove_bg:        bool  = True,
    canny_low:        int   = 100,
    canny_high:       int   = 200,
    use_ref_only:     bool  = True,
    sheet_cols:       int   = 0,
    sheet_rows:       int   = 1,
    row_index:        int   = 0,
    skel_is_lineart:  bool  = False,
) -> dict:
    """
    Generate pixel art animation frames using SD WebUI + ControlNet.

    Args:
        skeleton_sheet  : 8-frame horizontal strip (Human Base poses).
        reference_photo : User's character photo (colour/style reference).
        sd_url          : Colab ngrok URL or local WebUI URL.
        num_frames      : Number of animation frames (default 8).
        extra_prompt    : Additional positive prompt tokens.
        extra_negative  : Additional negative prompt tokens.
        lora_pixel      : LoRA name for pixel art style.
        lora_chibi      : LoRA name for chibi proportions.
        lora_weight     : Weight applied to both LoRAs.
        steps           : Sampling steps per frame.
        cfg_scale       : CFG guidance scale.
        denoising       : img2img denoising strength.
        canny_weight    : ControlNet Canny influence.
        ref_weight      : ControlNet Reference-only influence.
        frame_width/height: Generation resolution per frame.
        remove_bg       : Run rembg background removal on each frame.
        canny_low/high  : Canny edge thresholds.
        use_ref_only    : Use Reference-only for colour; disable if not installed.

    Returns:
        {
          "frames": [PIL.Image, ...],        # RGBA frames
          "frame_count": int,
          "sprite_sheet": PIL.Image,         # horizontal sprite sheet (RGBA)
        }
    """
    try:
        sd_url = await resolve_sd_webui_base(sd_url)
    except ConnectionError:
        raise

    # ── 1. Split skeleton sheet into individual frame images ──────────────
    skeleton_frames = split_sprite_sheet(
        skeleton_sheet, num_frames,
        sheet_cols=sheet_cols, sheet_rows=sheet_rows, row_index=row_index,
    )

    # ── 2. Build prompt ───────────────────────────────────────────────────
    lora_tags = f"<lora:{lora_pixel}:{lora_weight:.2f}>, <lora:{lora_chibi}:{lora_weight:.2f}>"
    prompt    = f"{BASE_POSITIVE}, {lora_tags}"
    if extra_prompt:
        prompt += f", {extra_prompt}"
    negative  = BASE_NEGATIVE
    if extra_negative:
        negative += f", {extra_negative}"

    # ── 3. Encode reference photo once ────────────────────────────────────
    ref_b64 = _pil_to_b64(reference_photo.convert("RGB"))

    # ── 4. Generate each frame (sequential API calls) ─────────────────────
    result_frames: list[Image.Image] = []
    for i, skeleton_frame in enumerate(skeleton_frames):
        print(f"[SD] Generating frame {i + 1}/{num_frames}…")
        frame = await _generate_single_frame(
            skeleton_frame   = skeleton_frame,
            ref_b64          = ref_b64,
            sd_url           = sd_url,
            prompt           = prompt,
            negative         = negative,
            steps            = steps,
            cfg_scale        = cfg_scale,
            denoising        = denoising,
            canny_weight     = canny_weight,
            ref_weight       = ref_weight,
            width            = frame_width,
            height           = frame_height,
            canny_low        = canny_low,
            canny_high       = canny_high,
            use_ref_only     = use_ref_only,
            skel_is_lineart  = skel_is_lineart,
        )
        if remove_bg:
            frame = _remove_background(frame)
        result_frames.append(frame)

    # ── 5. Assemble sprite sheet ──────────────────────────────────────────
    sheet = _assemble_sprite_sheet(result_frames, frame_width, frame_height)

    return {
        "frames":       result_frames,
        "frame_count":  len(result_frames),
        "sprite_sheet": sheet,
    }


async def check_sd_connection(sd_url: str = DEFAULT_SD_URL) -> dict:
    """Ping SD WebUI and return model info."""
    candidates = _sd_url_candidates(sd_url)
    primary = candidates[0]

    last_err: Optional[Exception] = None
    # trust_env=False: ignore HTTP(S)_PROXY so 127.0.0.1 is not sent via corporate proxy
    async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
        for base in candidates:
            try:
                resp = await client.get(f"{base}/sdapi/v1/options")
                resp.raise_for_status()
                data = resp.json()
                return {
                    "connected": True,
                    "model":     data.get("sd_model_checkpoint", "unknown"),
                    "url":       base,
                    "rembg":     HAS_REMBG,
                }
            except Exception as e:
                last_err = e
                continue

    hint = (
        " WebUI가 켜져 있고 --api가 붙었는지 확인하세요. "
        "Colab/ngrok면 방화벽·URL을 확인하세요."
    )
    err_txt = str(last_err) + hint if last_err else "unknown error" + hint
    return {"connected": False, "error": err_txt, "url": primary}


async def resolve_sd_webui_base(sd_url: str) -> str:
    """Raise ConnectionError unless WebUI responds on /sdapi/v1/options."""
    conn = await check_sd_connection(sd_url)
    if not conn.get("connected"):
        raise ConnectionError(conn.get("error", "SD WebUI에 연결할 수 없습니다."))
    return str(conn["url"]).rstrip("/")


def default_skeleton_sheet_png_bytes() -> bytes:
    """
    Built-in 512×512 4×4 pose placeholder sheet.

    The SPA used to fetch /skeleton_base.png from static files; if that file is missing,
    the backend serves index.html and PIL fails with 'cannot identify image file'.
    """
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
            bot = y0 + ch - 18
            top = y0 + 22
            off = (c % 4 - 1.5) * 6
            d.ellipse(
                [cx - 10 + off, top, cx + 10 + off, top + 18],
                outline=(45, 52, 70, 255),
                width=2,
            )
            d.line([(cx + off, top + 18), (cx + off, bot - 28)], fill=(45, 52, 70, 255), width=2)
            d.line(
                [(cx + off, y0 + ch // 2), (x0 + 18, y0 + ch // 2 + 8)],
                fill=(45, 52, 70, 255),
                width=2,
            )
            d.line(
                [(cx + off, y0 + ch // 2), (x0 + cw - 18, y0 + ch // 2 + 8)],
                fill=(45, 52, 70, 255),
                width=2,
            )
            d.line([(cx + off, bot - 28), (x0 + 22, bot)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, bot - 28), (x0 + cw - 22, bot)], fill=(45, 52, 70, 255), width=2)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def get_available_loras(sd_url: str = DEFAULT_SD_URL) -> list[dict]:
    async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
        for base in _sd_url_candidates(sd_url):
            try:
                resp = await client.get(f"{base}/sdapi/v1/loras")
                resp.raise_for_status()
                return resp.json()
            except Exception:
                continue
    return []


# ---------------------------------------------------------------------------
# Core single-frame generation
# ---------------------------------------------------------------------------

async def _generate_single_frame(
    skeleton_frame: Image.Image,
    ref_b64:        str,
    sd_url:         str,
    prompt:         str,
    negative:       str,
    steps:          int,
    cfg_scale:      float,
    denoising:      float,
    canny_weight:   float,
    ref_weight:     float,
    width:          int,
    height:         int,
    canny_low:      int,
    canny_high:     int,
    use_ref_only:   bool,
    skel_is_lineart: bool = False,
) -> Image.Image:
    """
    Send ONE txt2img request with dual ControlNet:
      Unit 0 — Canny/Lineart (skeleton pose)  → control_mode=2 (ControlNet priority)
      Unit 1 — Reference-only (user photo)    → colour/style only
    """
    skel_b64 = _pil_to_b64(skeleton_frame.convert("RGB"))

    # ── ControlNet Unit 0: pose lock ──────────────────────────────────────
    # If the skeleton is already a clean line-art / silhouette, skip the
    # Canny preprocessor (module="none") so the lines are used as-is.
    # Otherwise run the Canny preprocessor to extract edges first.
    cn_unit_canny = {
        "enabled":        True,
        "input_image":    skel_b64,
        "module":         "none" if skel_is_lineart else "canny",
        "model":          CANNY_MODEL,
        "weight":         canny_weight,          # raised to 1.8 by default
        "resize_mode":    1,
        "lowvram":        False,
        "processor_res":  512,
        "threshold_a":    canny_low,
        "threshold_b":    canny_high,
        "guidance_start": 0.0,
        "guidance_end":   1.0,
        # 2 = "ControlNet is more important" — pose CANNOT be ignored
        "control_mode":   2,
        "pixel_perfect":  True,
    }

    # ── ControlNet Unit 1: colour / style reference ───────────────────────
    # Uses reference_only module — shape comes entirely from Unit 0 above.
    cn_unit_ref = {
        "enabled":        True,
        "input_image":    ref_b64,
        "module":         REFONLY_MODULE,
        "model":          "none",
        "weight":         ref_weight,
        "resize_mode":    1,
        # Keep balanced here so the reference only influences colour/style
        "control_mode":   0,
        "pixel_perfect":  True,
    }

    cn_args = [cn_unit_canny]
    if use_ref_only:
        cn_args.append(cn_unit_ref)

    payload = {
        "prompt":          prompt,
        "negative_prompt": negative,
        "width":           width,
        "height":          height,
        "steps":           steps,
        "cfg_scale":       cfg_scale,
        "sampler_name":    "DPM++ 2M Karras",
        "batch_size":      1,
        "n_iter":          1,
        "alwayson_scripts": {
            "ControlNet": {"args": cn_args},
        },
    }

    async with httpx.AsyncClient(timeout=180.0, trust_env=False) as client:
        try:
            resp = await client.post(f"{sd_url}/sdapi/v1/txt2img", json=payload)
            resp.raise_for_status()
        except httpx.ConnectError:
            raise ConnectionError(
                f"SD WebUI 연결 실패: {sd_url}\n"
                "Colab에서 WebUI가 실행 중인지, URL이 맞는지 확인하세요."
            )

    b64 = resp.json()["images"][0]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def split_sprite_sheet(
    sheet: Image.Image,
    num_frames: int,
    sheet_cols: int = 0,
    sheet_rows: int = 1,
    row_index:  int = 0,
) -> list[Image.Image]:
    """
    Split a sprite sheet into individual frames.

    Grid mode  (sheet_cols > 0):
        Treats the sheet as a `sheet_cols` × `sheet_rows` grid.
        `row_index` selects which row to use (0 = top row).
        Returns up to `num_frames` cells from that row.

    Strip mode (sheet_cols == 0, default):
        Treats the sheet as a single horizontal strip.
        Divides width into `num_frames` equal tiles.
    """
    sheet = sheet.convert("RGBA")
    w, h  = sheet.size

    if sheet_cols > 0:
        fw  = w // sheet_cols
        fh  = h // max(sheet_rows, 1)
        y0  = row_index * fh
        frames = [
            sheet.crop((c * fw, y0, (c + 1) * fw, y0 + fh))
            for c in range(sheet_cols)
        ]
        return frames[:num_frames]
    else:
        fw = w // num_frames
        return [
            sheet.crop((i * fw, 0, (i + 1) * fw, h))
            for i in range(num_frames)
        ]


def _assemble_sprite_sheet(
    frames: list[Image.Image],
    frame_width:  int,
    frame_height: int,
) -> Image.Image:
    """
    Combine frames into a horizontal sprite sheet.
    Each frame is resized to (frame_width × frame_height) first.
    """
    n     = len(frames)
    sheet = Image.new("RGBA", (frame_width * n, frame_height), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        thumb = frame.resize((frame_width, frame_height), Image.NEAREST)
        sheet.paste(thumb, (i * frame_width, 0), thumb)
    return sheet


def _remove_background(img: Image.Image) -> Image.Image:
    """Remove background using rembg (U2Net). Falls back to noop if not installed."""
    if not HAS_REMBG:
        return img
    buf_in  = io.BytesIO()
    img.convert("RGBA").save(buf_in, format="PNG")
    buf_out = rembg_remove(buf_in.getvalue())
    return Image.open(io.BytesIO(buf_out)).convert("RGBA")


def _pil_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
