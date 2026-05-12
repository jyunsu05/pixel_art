"""
Automatic background removal service using rembg (U2Net AI model).

Unlike chromakey (which requires a specific solid color background),
this works on ANY photo — complex backgrounds, natural scenes, etc.

Alpha matting is enabled to preserve fine details like hair, legs,
fingers and other thin parts that a hard mask would clip.

First run: model weights (~170MB) are downloaded automatically and cached.
"""

from __future__ import annotations

import io
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session


# Module-level session caches (load model once per process)
_session_general: object | None = None
_session_human: object | None = None


def _get_session_general():
    global _session_general
    if _session_general is None:
        _session_general = new_session("u2net")
    return _session_general


def _get_session_human():
    global _session_human
    if _session_human is None:
        _session_human = new_session("u2net_human_seg")
    return _session_human


def auto_remove_background(img: Image.Image) -> Image.Image:
    """
    General-purpose background removal (objects, animals, etc.).
    Uses alpha matting to recover fine edge details.
    """
    return _run_rembg(img, session=_get_session_general())


def auto_remove_background_human(img: Image.Image) -> Image.Image:
    """
    Background removal optimised for human / character subjects.
    Uses u2net_human_seg + alpha matting for best detail preservation
    (legs, fingers, hair edges, etc.).
    """
    return _run_rembg(img, session=_get_session_human())


def _run_rembg(img: Image.Image, session) -> Image.Image:
    """
    Internal helper: run rembg with alpha matting enabled, then
    apply a slight edge-dilation to recover any clipped details.
    """
    if img.mode != "RGB":
        img = img.convert("RGB")

    buf_in = io.BytesIO()
    img.save(buf_in, format="PNG")
    raw_bytes = buf_in.getvalue()

    # ── Pass 1: soft mask with alpha matting ──────────────────────────────
    # alpha_matting recovers thin structures (hair, legs, fingers).
    # foreground_threshold: pixels brighter than this are always foreground.
    # background_threshold: pixels darker than this are always background.
    # erode_size: shrinks the uncertain region before matting (smaller = more detail).
    try:
        result_bytes = remove(
            raw_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=3,          # small value → keep more detail
            post_process_mask=True,
        )
    except Exception:
        # Fallback: no alpha matting (faster, less detail)
        result_bytes = remove(raw_bytes, session=session, post_process_mask=True)

    result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    # ── Pass 2: edge dilation to recover any clipped border pixels ────────
    result = _dilate_alpha_edges(result, radius=1)

    return result


def _dilate_alpha_edges(img: Image.Image, radius: int = 1) -> Image.Image:
    """
    Slightly expand the opaque region of the alpha channel so that
    thin edges (e.g. the bottom of legs, fingertips) are not clipped.
    """
    arr = np.array(img)
    alpha = arr[:, :, 3]

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)
    )
    dilated = cv2.dilate(alpha, kernel, iterations=1)

    # Only dilate where the original image had non-black RGB content
    # (avoids pulling in background noise at pure-black borders)
    rgb_sum = arr[:, :, 0].astype(np.uint16) + arr[:, :, 1] + arr[:, :, 2]
    has_color = (rgb_sum > 30).astype(np.uint8) * 255
    dilated = np.minimum(dilated, has_color)

    result = arr.copy()
    result[:, :, 3] = np.maximum(alpha, dilated)
    return Image.fromarray(result.astype(np.uint8), "RGBA")
