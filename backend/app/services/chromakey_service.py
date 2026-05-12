"""
Chroma key (green / blue screen) removal service using OpenCV.
"""

import cv2
import numpy as np
from PIL import Image

from app.utils.image_utils import ensure_rgba, pil_to_numpy, numpy_to_pil


# Preset HSV ranges for common chroma colours
CHROMA_PRESETS = {
    "green": {"lower": np.array([35, 50, 50]), "upper": np.array([85, 255, 255])},
    "blue": {"lower": np.array([90, 50, 50]), "upper": np.array([130, 255, 255])},
    "red": {"lower": np.array([0, 50, 50]), "upper": np.array([10, 255, 255])},
    "magenta": {"lower": np.array([140, 50, 50]), "upper": np.array([170, 255, 255])},
}


def remove_chroma(
    img: Image.Image,
    color: str = "green",
    tolerance: int = 30,
    spill_reduction: bool = True,
    feather_radius: int = 1,
) -> Image.Image:
    """
    Remove chroma key background from an image.

    Args:
        img: Input PIL image.
        color: Preset name ('green', 'blue', 'red', 'magenta') or 'custom'.
        tolerance: Expand the mask range by this many HSV units (0-50).
        spill_reduction: Slightly desaturate green/blue fringing.
        feather_radius: Gaussian blur radius applied to the alpha mask edge (0 = none).
    Returns:
        PIL image with transparent background (RGBA).
    """
    img = ensure_rgba(img)
    arr = pil_to_numpy(img)  # H×W×4 RGBA numpy

    rgb = arr[:, :, :3]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    preset = CHROMA_PRESETS.get(color, CHROMA_PRESETS["green"])
    lower = preset["lower"].copy().astype(int)
    upper = preset["upper"].copy().astype(int)

    # Expand by tolerance
    lower[1] = max(0, lower[1] - tolerance)
    lower[2] = max(0, lower[2] - tolerance)
    upper[1] = min(255, upper[1] + tolerance)
    upper[2] = min(255, upper[2] + tolerance)

    mask = cv2.inRange(hsv, lower.astype(np.uint8), upper.astype(np.uint8))

    # --- Feather mask edges for smoother compositing ---
    if feather_radius > 0:
        ksize = feather_radius * 2 + 1
        mask_f = cv2.GaussianBlur(mask, (ksize, ksize), 0)
    else:
        mask_f = mask

    # Invert mask: chroma region → transparent
    alpha_channel = 255 - mask_f
    # Merge with existing alpha (respect pre-existing transparency)
    original_alpha = arr[:, :, 3]
    combined_alpha = np.minimum(alpha_channel, original_alpha)

    result = arr.copy()
    result[:, :, 3] = combined_alpha

    # --- Spill reduction (green / blue channel suppression at edges) ---
    if spill_reduction and color in ("green", "blue"):
        channel_idx = 1 if color == "green" else 2  # G or B in RGB
        spill_mask = (mask_f > 0) & (mask_f < 255)
        result[spill_mask, channel_idx] = (
            result[spill_mask, channel_idx] * 0.5
        ).astype(np.uint8)

    return numpy_to_pil(result)


def remove_chroma_custom_color(
    img: Image.Image,
    target_rgb: tuple,
    tolerance: int = 40,
    feather_radius: int = 1,
) -> Image.Image:
    """
    Remove a custom solid background color using Euclidean RGB distance.

    Args:
        img: Input PIL image.
        target_rgb: (R, G, B) tuple of the background color.
        tolerance: Max colour distance (0-255) to consider as background.
        feather_radius: Blur radius for alpha edge softening.
    """
    img = ensure_rgba(img)
    arr = pil_to_numpy(img).astype(np.float32)

    tr, tg, tb = target_rgb
    diff = np.sqrt(
        (arr[:, :, 0] - tr) ** 2
        + (arr[:, :, 1] - tg) ** 2
        + (arr[:, :, 2] - tb) ** 2
    )

    # Smooth gradient: pixels within tolerance → transparent
    alpha = np.clip((diff - tolerance) / max(tolerance * 0.5, 1), 0, 1) * 255
    alpha = alpha.astype(np.uint8)

    if feather_radius > 0:
        ksize = feather_radius * 2 + 1
        alpha = cv2.GaussianBlur(alpha, (ksize, ksize), 0)

    result = arr.astype(np.uint8).copy()
    result[:, :, 3] = np.minimum(alpha, arr[:, :, 3].astype(np.uint8))

    return numpy_to_pil(result)
