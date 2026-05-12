"""
Pixel art reconstruction — game-sprite style (Eternal Return aesthetic).

The input photo is used only as a colour/shape REFERENCE.
The result should look like it was hand-drawn as a game sprite, NOT a
filtered photograph.

Pipeline:
  1. cv2.stylization  — converts the photo into a flat-colour illustration
                        (like a cartoon/painting — no photo gradients).
  2. Saturation + contrast boost — vivid game palette.
  3. Downscale to art grid.
  4. K-means palette (PP seeds, small k for clean colour blocks).
  5. 3×3 median + re-snap — removes isolated pixels.
  6. Pure dark outlines — silhouette inner ring + internal colour edges.
  7. INTER_NEAREST upscale — hard pixel blocks, no blur.
"""

import cv2
import numpy as np
from PIL import Image, ImageEnhance

from app.utils.image_utils import ensure_rgba, pil_to_numpy, numpy_to_pil


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def pixelate_cv2(
    img: Image.Image,
    pixel_size: int = 48,
    num_colors: int = 10,
    preview_scale: int = 8,
) -> tuple[Image.Image, Image.Image]:
    """
    Reconstruct the character as a hand-drawn game-sprite pixel art.
    Returns (preview_image, raw_pixel_art_image).
    """
    img = ensure_rgba(img)
    arr = pil_to_numpy(img)
    orig_h, orig_w = arr.shape[:2]

    # ── 1. Target pixel art size ──────────────────────────────────────────
    if orig_w >= orig_h:
        small_w = pixel_size
        small_h = max(1, round(orig_h * pixel_size / orig_w))
    else:
        small_h = pixel_size
        small_w = max(1, round(orig_w * pixel_size / orig_h))

    rgb   = arr[:, :, :3].astype(np.uint8)
    alpha = arr[:, :, 3]

    # ── 2. Illustration-style flattening (cv2.stylization) ────────────────
    # stylization() turns a photo into a flat-colour illustration / cartoon.
    # sigma_s controls spatial smoothing (higher = larger flat regions).
    # sigma_r controls colour similarity threshold (lower = fewer regions).
    bgr      = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    stylized = cv2.stylization(bgr, sigma_s=80, sigma_r=0.30)
    stylized = cv2.cvtColor(stylized, cv2.COLOR_BGR2RGB)

    # ── 3. Vivid game colours ─────────────────────────────────────────────
    pil      = Image.fromarray(stylized)
    pil      = ImageEnhance.Color(pil).enhance(2.0)       # vivid palette
    pil      = ImageEnhance.Contrast(pil).enhance(1.35)   # push brights/darks
    stylized = np.array(pil)

    # ── 4. Downscale ──────────────────────────────────────────────────────
    flat_rgba = np.dstack([stylized, alpha])
    small     = cv2.resize(flat_rgba, (small_w, small_h),
                           interpolation=cv2.INTER_AREA)
    srgb      = small[:, :, :3].astype(np.uint8)
    salpha    = small[:, :, 3]
    fg        = salpha > 20

    # ── 5. K-means palette — small k for clean distinct colours ──────────
    srgb, palette = _quantize_kmeans(srgb, fg, k=num_colors)

    # ── 6. Clean isolated pixels ──────────────────────────────────────────
    srgb = _clean_isolated(srgb, fg, palette)

    # ── 7. Pure dark outlines ─────────────────────────────────────────────
    srgb = _draw_outline(srgb, salpha)

    # ── 8. Compose & upscale ─────────────────────────────────────────────
    small_rgba = np.dstack([srgb, salpha])
    pw = small_w * preview_scale
    ph = small_h * preview_scale
    preview = cv2.resize(small_rgba, (pw, ph), interpolation=cv2.INTER_NEAREST)

    return numpy_to_pil(preview), numpy_to_pil(small_rgba)


pixelate = pixelate_cv2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _quantize_kmeans(
    rgb: np.ndarray,
    fg: np.ndarray,
    k: int,
) -> tuple[np.ndarray, np.ndarray]:
    result = rgb.copy()
    if fg.sum() == 0:
        return result, np.zeros((k, 3), dtype=np.uint8)

    pixels = rgb[fg].reshape(-1, 3).astype(np.float32)
    k      = min(k, len(pixels))
    crit   = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2)
    _, labels, centers = cv2.kmeans(
        pixels, k, None, crit, 10, cv2.KMEANS_PP_CENTERS
    )
    palette = np.clip(np.round(centers), 0, 255).astype(np.uint8)
    result[fg] = palette[labels.flatten()]
    return result, palette


def _snap_to_palette(rgb: np.ndarray, fg: np.ndarray,
                     palette: np.ndarray) -> np.ndarray:
    if fg.sum() == 0 or len(palette) == 0:
        return rgb
    result  = rgb.copy()
    fg_pix  = rgb[fg].astype(np.float32)
    pal_f   = palette.astype(np.float32)
    diff    = fg_pix[:, None, :] - pal_f[None, :, :]
    nearest = np.argmin(np.sum(diff ** 2, axis=2), axis=1)
    result[fg] = palette[nearest]
    return result


def _clean_isolated(rgb: np.ndarray, fg: np.ndarray,
                    palette: np.ndarray) -> np.ndarray:
    blurred      = cv2.medianBlur(rgb, 3)
    result       = rgb.copy()
    result[fg]   = blurred[fg]
    return _snap_to_palette(result, fg, palette)


def _draw_outline(
    rgb: np.ndarray,
    alpha: np.ndarray,
    outline_color: tuple = (8, 8, 14),
) -> np.ndarray:
    result = rgb.copy()
    fg     = (alpha > 20).astype(np.uint8)
    k3     = np.ones((3, 3), np.uint8)
    oc     = np.array(outline_color, dtype=np.float32)

    # A) 1-px inner silhouette
    eroded       = cv2.erode(fg, k3, iterations=1)
    inner_border = (fg - eroded).astype(bool)
    result[inner_border] = outline_color

    # B) Internal colour edges — strong blend toward outline colour
    gray   = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges  = cv2.Canny(gray, 15, 50)
    cedges = (edges > 0) & eroded.astype(bool)

    blend = 0.88
    for c in range(3):
        result[:, :, c] = np.where(
            cedges,
            np.clip(result[:, :, c] * (1 - blend) + oc[c] * blend, 0, 255),
            result[:, :, c],
        ).astype(np.uint8)

    return result
