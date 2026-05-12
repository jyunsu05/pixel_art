"""
Pixel art conversion service.
Steps:
  1. Downscale image to target pixel resolution.
  2. Quantize to a limited palette (color reduction).
  3. Upscale back to preview size using nearest-neighbour (sharp pixels).
"""

import cv2
import numpy as np
from PIL import Image

from app.utils.image_utils import ensure_rgba, pil_to_numpy, numpy_to_pil


def pixelate(
    img: Image.Image,
    pixel_size: int = 16,
    num_colors: int = 16,
    preview_scale: int = 8,
) -> Image.Image:
    """
    Convert an image to pixel art.

    Args:
        img: Input PIL image.
        pixel_size: Target width/height in pixels (e.g. 16 → 16×16 art).
        num_colors: Maximum number of colours in the output palette.
        preview_scale: Upscale factor for the returned preview PNG.
    Returns:
        Pixel-art PIL image (RGBA, upscaled for preview).
    """
    img = ensure_rgba(img)
    original_w, original_h = img.size

    # Keep aspect ratio
    if original_w >= original_h:
        small_w = pixel_size
        small_h = max(1, round(original_h * pixel_size / original_w))
    else:
        small_h = pixel_size
        small_w = max(1, round(original_w * pixel_size / original_h))

    # Downscale
    small = img.resize((small_w, small_h), Image.LANCZOS)

    # --- Color quantisation (only on RGB channels; preserve alpha separately) ---
    rgb = small.convert("RGB")
    alpha = small.split()[3]  # alpha channel

    quantized_rgb = rgb.quantize(colors=num_colors, method=Image.Quantize.MEDIANCUT)
    quantized_rgb = quantized_rgb.convert("RGB")

    # Merge quantised RGB back with original alpha
    r, g, b = quantized_rgb.split()
    small_quantized = Image.merge("RGBA", (r, g, b, alpha))

    # Upscale with nearest-neighbour for crisp pixels
    preview_w = small_w * preview_scale
    preview_h = small_h * preview_scale
    result = small_quantized.resize((preview_w, preview_h), Image.NEAREST)

    return result, small_quantized  # (preview, raw pixel art)


def pixelate_cv2(
    img: Image.Image,
    pixel_size: int = 16,
    num_colors: int = 16,
    preview_scale: int = 8,
) -> Image.Image:
    """
    OpenCV-based pixelation with k-means colour clustering.
    Returns (preview_image, raw_pixel_art_image).
    """
    img = ensure_rgba(img)
    arr = pil_to_numpy(img)  # H×W×4 (RGBA)

    original_h, original_w = arr.shape[:2]

    if original_w >= original_h:
        small_w = pixel_size
        small_h = max(1, round(original_h * pixel_size / original_w))
    else:
        small_h = pixel_size
        small_w = max(1, round(original_w * pixel_size / original_h))

    # Downscale
    small = cv2.resize(arr, (small_w, small_h), interpolation=cv2.INTER_AREA)

    # Separate alpha
    bgr = cv2.cvtColor(small[:, :, :3], cv2.COLOR_RGB2BGR)
    alpha = small[:, :, 3]

    # K-means colour reduction on non-transparent pixels
    mask = alpha > 0
    pixels = bgr[mask].reshape(-1, 3).astype(np.float32)

    if len(pixels) > 0:
        k = min(num_colors, len(pixels))
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, labels, centers = cv2.kmeans(
            pixels, k, None, criteria, 5, cv2.KMEANS_RANDOM_CENTERS
        )
        centers = np.uint8(centers)
        quantized_pixels = centers[labels.flatten()]
        result_bgr = bgr.copy()
        result_bgr[mask] = quantized_pixels
    else:
        result_bgr = bgr

    result_rgb = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)
    small_rgba = np.dstack([result_rgb, alpha])

    # Upscale (nearest-neighbour)
    preview_w = small_w * preview_scale
    preview_h = small_h * preview_scale
    preview = cv2.resize(small_rgba, (preview_w, preview_h), interpolation=cv2.INTER_NEAREST)

    return numpy_to_pil(preview), numpy_to_pil(small_rgba)
