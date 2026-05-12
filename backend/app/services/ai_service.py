"""
AI pixel-art transformation service.

Priority order:
  1. Replicate  — fofr/sdxl-pixel-art  (best quality, needs REPLICATE_API_TOKEN)
  2. HuggingFace — timbrooks/instruct-pix2pix  (free token, good quality)
  3. Local       — cv2.stylization pipeline  (no API key, acceptable quality)

Set API keys in backend/.env:
  REPLICATE_API_TOKEN=r8_xxxx
  HF_API_TOKEN=hf_xxxx
"""

from __future__ import annotations

import os
import io
import base64
import time
import cv2
import numpy as np
import httpx
from PIL import Image, ImageEnhance
from dotenv import load_dotenv

load_dotenv()

REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN", "").strip()
HF_API_TOKEN        = os.getenv("HF_API_TOKEN", "").strip()

# Replicate — SDXL pixel art LoRA (fofr/sdxl-pixel-art)
REPLICATE_MODEL = "fofr/sdxl-pixel-art"

# HuggingFace — instruct-pix2pix (img2img via text instruction)
HF_MODEL_URL = "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix"

# Pixel art system prompt
PIXEL_ART_PROMPT = (
    "pixel art game character sprite, chibi style, 16-bit retro game, "
    "flat colors, bold dark outline, clean palette, transparent background, "
    "Eternal Return style, game asset, no background, sharp pixels"
)
PIXEL_ART_NEGATIVE = (
    "photo, realistic, blurry, gradient, 3d, smooth, anti-aliasing, "
    "photography, background, noise, watermark"
)
PIXEL_ART_INSTRUCTION = (
    "Convert this character into a pixel art game sprite in Eternal Return style. "
    "Use flat colors, bold dark outlines, chibi proportions, 16-bit retro game aesthetic."
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def transform_to_pixel_art(
    img: Image.Image,
    prompt: str = PIXEL_ART_PROMPT,
    strength: float = 0.75,
) -> Image.Image:
    """
    Transform the character image into pixel art.
    Tries Replicate → HuggingFace → local, in that order.
    Returns RGBA image.
    """
    # Preserve original alpha to restore after AI transform
    img_rgba = img.convert("RGBA")

    if REPLICATE_API_TOKEN:
        try:
            result = await _replicate_transform(img_rgba, prompt, strength)
            return _restore_alpha(result, img_rgba)
        except Exception as e:
            print(f"[AI] Replicate failed: {e}. Trying HuggingFace…")

    if HF_API_TOKEN:
        try:
            result = await _hf_transform(img_rgba, strength)
            return _restore_alpha(result, img_rgba)
        except Exception as e:
            print(f"[AI] HuggingFace failed: {e}. Using local pipeline…")

    return await _local_stylize(img_rgba, strength)


def get_provider_status() -> dict:
    """Return which providers are configured."""
    return {
        "replicate": bool(REPLICATE_API_TOKEN),
        "huggingface": bool(HF_API_TOKEN),
        "local": True,
        "active": (
            "replicate" if REPLICATE_API_TOKEN
            else "huggingface" if HF_API_TOKEN
            else "local"
        ),
    }


# ---------------------------------------------------------------------------
# Replicate  (fofr/sdxl-pixel-art)
# ---------------------------------------------------------------------------

async def _replicate_transform(
    img: Image.Image,
    prompt: str,
    strength: float,
) -> Image.Image:
    import replicate

    os.environ["REPLICATE_API_TOKEN"] = REPLICATE_API_TOKEN

    # Encode image to base64 data URI
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    buf.seek(0)
    img_b64 = base64.b64encode(buf.getvalue()).decode()
    img_uri  = f"data:image/png;base64,{img_b64}"

    output = replicate.run(
        REPLICATE_MODEL,
        input={
            "image":            img_uri,
            "prompt":           prompt or PIXEL_ART_PROMPT,
            "negative_prompt":  PIXEL_ART_NEGATIVE,
            "prompt_strength":  strength,
            "num_inference_steps": 30,
            "guidance_scale":   7.5,
        },
    )
    if isinstance(output, list):
        output = output[0]

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(str(output))
        resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGBA")


# ---------------------------------------------------------------------------
# HuggingFace  (timbrooks/instruct-pix2pix)
# ---------------------------------------------------------------------------

async def _hf_transform(
    img: Image.Image,
    strength: float,
) -> Image.Image:
    """
    Use InstructPix2Pix via the HF Inference API.
    Sends the image + a pixel art transformation instruction.
    """
    # Resize to max 512px — InstructPix2Pix is trained at 512
    img_resized = _fit(img.convert("RGB"), 512)
    buf = io.BytesIO()
    img_resized.save(buf, format="PNG")
    buf.seek(0)

    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    payload = {
        "inputs":     base64.b64encode(buf.getvalue()).decode(),
        "parameters": {
            "prompt":           PIXEL_ART_INSTRUCTION,
            "negative_prompt":  PIXEL_ART_NEGATIVE,
            "image_guidance_scale": 1.5,
            "guidance_scale":   7.0,
            "num_inference_steps": 20,
        },
    }

    async with httpx.AsyncClient(timeout=120) as client:
        # HF models may be cold — retry once after a short wait
        for attempt in range(2):
            resp = await client.post(HF_MODEL_URL, headers=headers, json=payload)
            if resp.status_code == 503 and attempt == 0:
                await _async_sleep(20)
                continue
            resp.raise_for_status()
            break

    result = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    # Upscale back to original size with NEAREST for pixel-art crispness
    result = result.resize(img.size, Image.NEAREST)
    return result


# ---------------------------------------------------------------------------
# Local fallback  (cv2.stylization pipeline)
# ---------------------------------------------------------------------------

async def _local_stylize(
    img: Image.Image,
    strength: float = 0.75,
) -> Image.Image:
    """
    Local pixel art reconstruction using cv2.stylization.
    No API key required. Quality is lower than AI models.
    """
    rgba = np.array(img.convert("RGBA"))
    rgb  = rgba[:, :, :3]
    alpha = rgba[:, :, 3]

    bgr      = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    stylized = cv2.stylization(bgr, sigma_s=80, sigma_r=0.30)
    stylized = cv2.cvtColor(stylized, cv2.COLOR_BGR2RGB)

    pil = Image.fromarray(stylized)
    pil = ImageEnhance.Color(pil).enhance(2.0)
    pil = ImageEnhance.Contrast(pil).enhance(1.35)
    stylized = np.array(pil)

    fg = alpha > 20
    result = stylized.copy()

    # K-means palette
    if fg.sum() > 0:
        num_colors = max(8, int(8 + strength * 16))
        pixels = stylized[fg].reshape(-1, 3).astype(np.float32)
        k = min(num_colors, len(pixels))
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
        _, labels, centers = cv2.kmeans(pixels, k, None, crit, 8, cv2.KMEANS_PP_CENTERS)
        centers = np.clip(np.round(centers), 0, 255).astype(np.uint8)
        result[fg] = centers[labels.flatten()]

    # Outline
    gray  = cv2.cvtColor(result, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 20, 60)
    fg_u8 = fg.astype(np.uint8)
    k3    = np.ones((3, 3), np.uint8)
    inner = (fg_u8 - cv2.erode(fg_u8, k3)).astype(bool)
    result[inner | ((edges > 0) & fg)] = [8, 8, 14]

    out = np.dstack([result, alpha])
    return Image.fromarray(out, "RGBA")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _fit(img: Image.Image, max_dim: int) -> Image.Image:
    w, h = img.size
    scale = min(1.0, max_dim / max(w, h))
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def _restore_alpha(result: Image.Image, original: Image.Image) -> Image.Image:
    """
    Put back the original alpha channel onto the AI-generated result.
    Ensures the transparent background is preserved even if the AI model
    painted a background.
    """
    result = result.resize(original.size, Image.LANCZOS).convert("RGBA")
    orig_a = original.split()[3]
    r, g, b, _ = result.split()
    return Image.merge("RGBA", (r, g, b, orig_a))


async def _async_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)
