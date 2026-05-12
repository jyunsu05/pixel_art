"""
Video frame extraction service.
Takes an animation video file (mp4, gif, webm, avi) and:
  1. Extracts frames at a given interval.
  2. Optionally applies pixelation to each frame.
  3. Returns a list of RGBA PIL images ready for sprite sheet assembly.

This is the core feature shown in the reference video (2:53~4:14):
  "영상을 프레임별로 쪼개서 스프라이트 시트가 자동으로 생성됩니다"
"""

import os
import cv2
import numpy as np
from PIL import Image

from app.utils.image_utils import numpy_to_pil, ensure_rgba
from app.services.pixel_service import pixelate_cv2


def extract_frames_from_video(
    video_path: str,
    max_frames: int = 12,
    frame_interval: int = 1,
    apply_pixelate: bool = False,
    pixel_size: int = 32,
    num_colors: int = 24,
    background_removal: bool = False,
    bg_threshold: int = 30,
) -> list[Image.Image]:
    """
    Extract frames from a video file.

    Args:
        video_path: Path to the video file (mp4 / gif / webm / avi).
        max_frames: Maximum number of frames to extract (default 12).
        frame_interval: Extract every N-th frame (1 = every frame, 2 = every other, …).
        apply_pixelate: Run pixelation on each extracted frame.
        pixel_size: Pixel art size if apply_pixelate=True.
        num_colors: Palette size if apply_pixelate=True.
        background_removal: Auto-remove near-black background (for dark-bg animations).
        bg_threshold: Luma threshold for background removal (0-255).
    Returns:
        List of RGBA PIL frames.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24

    # Decide actual sampling interval so we never exceed max_frames
    if total_frames > 0 and frame_interval == 1:
        auto_interval = max(1, total_frames // max_frames)
        effective_interval = auto_interval
    else:
        effective_interval = max(1, frame_interval)

    frames: list[Image.Image] = []
    frame_idx = 0

    while len(frames) < max_frames:
        ret, bgr = cap.read()
        if not ret:
            break

        if frame_idx % effective_interval == 0:
            # BGR → RGB
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)

            if background_removal:
                rgba = _remove_dark_background(rgba, bg_threshold)

            pil_frame = numpy_to_pil(rgba)

            if apply_pixelate:
                _, pil_frame = pixelate_cv2(
                    pil_frame,
                    pixel_size=pixel_size,
                    num_colors=num_colors,
                    preview_scale=1,  # keep raw size, no upscale
                )

            frames.append(ensure_rgba(pil_frame))

        frame_idx += 1

    cap.release()

    if not frames:
        raise ValueError("No frames could be extracted from the video.")

    return frames


def extract_frames_from_gif(
    gif_path: str,
    max_frames: int = 12,
) -> list[Image.Image]:
    """
    Extract frames from an animated GIF using Pillow.
    Handles palette/transparency correctly.
    """
    img = Image.open(gif_path)
    frames = []
    try:
        while True:
            if len(frames) >= max_frames:
                break
            frame = img.copy().convert("RGBA")
            frames.append(frame)
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames


def _remove_dark_background(
    rgba: np.ndarray,
    threshold: int = 30,
) -> np.ndarray:
    """
    Simple luma-based background removal for dark backgrounds.
    Pixels darker than threshold become transparent.
    """
    rgb = rgba[:, :, :3].astype(np.float32)
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    mask = (luma > threshold).astype(np.uint8) * 255
    result = rgba.copy()
    result[:, :, 3] = np.minimum(result[:, :, 3], mask)
    return result


def get_video_info(video_path: str) -> dict:
    """Return basic metadata about a video file."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {}
    info = {
        "total_frames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        "fps": round(cap.get(cv2.CAP_PROP_FPS), 2),
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "duration_sec": round(
            cap.get(cv2.CAP_PROP_FRAME_COUNT) / max(cap.get(cv2.CAP_PROP_FPS), 1), 2
        ),
    }
    cap.release()
    return info
