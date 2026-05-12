"""
AI Image-to-Image transformation service.
Supports:
  - Replicate (pixel-art model)
  - Hugging Face Inference API
  - Mock mode (returns the input image, for testing without API keys)
"""

import os
import io
import base64
import httpx
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "mock")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")

# Replicate pixel-art model (publicly available)
REPLICATE_MODEL = "cjwbw/pixel-art-style:a6efe56e-8c44-4d31-9dc2-c8aa4bf7acc5"

# HuggingFace model (img2img ControlNet pixel-art LoRA)
HF_MODEL_URL = (
    "https://api-inference.huggingface.co/models/nerijs/pixel-art-medium-128-LoRA"
)


async def transform_to_pixel_art(
    img: Image.Image,
    prompt: str = "pixel art game character, 16-bit style, transparent background",
    strength: float = 0.75,
) -> Image.Image:
    """
    Run AI image-to-image to produce polished pixel art.
    Falls back through providers: replicate → huggingface → mock.
    """
    provider = AI_PROVIDER.lower()

    if provider == "replicate" and REPLICATE_API_TOKEN:
        return await _replicate_transform(img, prompt, strength)
    elif provider == "huggingface" and HF_API_TOKEN:
        return await _hf_transform(img, prompt, strength)
    else:
        return await _mock_transform(img)


# ---------------------------------------------------------------------------
# Replicate
# ---------------------------------------------------------------------------

async def _replicate_transform(
    img: Image.Image, prompt: str, strength: float
) -> Image.Image:
    import replicate

    os.environ["REPLICATE_API_TOKEN"] = REPLICATE_API_TOKEN

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    output = replicate.run(
        "cjwbw/pixar-style:c2c5c46f9e9acd14c2e35de6e8b5af3e7eb6f4c1",
        input={
            "image": buffer,
            "prompt": prompt,
            "strength": strength,
            "num_inference_steps": 30,
        },
    )
    # output is a URL string for Replicate
    if isinstance(output, list):
        output = output[0]

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(str(output))
        resp.raise_for_status()

    return Image.open(io.BytesIO(resp.content)).convert("RGBA")


# ---------------------------------------------------------------------------
# Hugging Face
# ---------------------------------------------------------------------------

async def _hf_transform(
    img: Image.Image, prompt: str, strength: float
) -> Image.Image:
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    image_bytes = buffer.getvalue()

    payload = {
        "inputs": prompt,
        "parameters": {"strength": strength, "num_inference_steps": 20},
    }
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            HF_MODEL_URL,
            headers=headers,
            content=image_bytes,
        )
        resp.raise_for_status()

    return Image.open(io.BytesIO(resp.content)).convert("RGBA")


# ---------------------------------------------------------------------------
# Mock (no API key needed, used for local testing)
# ---------------------------------------------------------------------------

async def _mock_transform(img: Image.Image) -> Image.Image:
    """
    Simulate AI output by applying a simple palette reduction + edge-sharpening.
    This is returned instantly without any external API call.
    """
    from app.services.pixel_service import pixelate_cv2

    preview, raw = pixelate_cv2(img, pixel_size=32, num_colors=24, preview_scale=6)
    return preview
