"""
Animation frame generation service.
Generates multiple frames for Walk / Attack / Idle motions from a single
character sprite by applying simple 2D transforms (shift, scale, rotate).
"""

import math
from PIL import Image

from app.utils.image_utils import ensure_rgba


# ---------------------------------------------------------------------------
# Motion definitions  (frame_count, transform params per frame)
# ---------------------------------------------------------------------------

MOTIONS = {
    "idle": {"frames": 4, "desc": "Breathing / idle animation"},
    "walk": {"frames": 6, "desc": "Side-walk cycle"},
    "attack": {"frames": 5, "desc": "Attack swing"},
    "jump": {"frames": 4, "desc": "Jump arc"},
    "hurt": {"frames": 3, "desc": "Hit reaction"},
}


def generate_frames(
    img: Image.Image,
    motion: str = "walk",
    frame_count: int | None = None,
) -> list[Image.Image]:
    """
    Generate animation frames from a single sprite image.

    Args:
        img: Source RGBA sprite.
        motion: One of MOTIONS keys.
        frame_count: Override the default frame count.
    Returns:
        List of PIL RGBA frames.
    """
    img = ensure_rgba(img)
    n = frame_count or MOTIONS.get(motion, MOTIONS["walk"])["frames"]

    handlers = {
        "idle": _idle_frames,
        "walk": _walk_frames,
        "attack": _attack_frames,
        "jump": _jump_frames,
        "hurt": _hurt_frames,
    }
    handler = handlers.get(motion, _walk_frames)
    return handler(img, n)


# ---------------------------------------------------------------------------
# Per-motion frame generators
# ---------------------------------------------------------------------------

def _idle_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Subtle vertical bob."""
    frames = []
    for i in range(n):
        t = i / n
        dy = int(math.sin(t * math.pi * 2) * 2)
        frame = Image.new("RGBA", img.size, (0, 0, 0, 0))
        frame.paste(img, (0, dy), img)
        frames.append(frame)
    return frames


def _walk_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Horizontal bounce cycle to simulate walking."""
    frames = []
    w, h = img.size
    for i in range(n):
        t = i / n
        dy = int(abs(math.sin(t * math.pi * 2)) * 3)  # vertical bob
        dx = int(math.sin(t * math.pi * 2) * 1)       # slight horizontal sway
        frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        frame.paste(img, (dx, dy), img)
        frames.append(frame)
    return frames


def _attack_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Lean forward then return."""
    frames = []
    w, h = img.size
    pivots = [0, 3, 6, 3, 0]  # lean offsets in pixels
    pivots = _interpolate_list(pivots, n)
    for dx in pivots:
        frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        frame.paste(img, (int(dx), 0), img)
        frames.append(frame)
    return frames


def _jump_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Parabolic jump arc."""
    frames = []
    w, h = img.size
    for i in range(n):
        t = i / max(n - 1, 1)
        dy = int(-math.sin(t * math.pi) * 10)  # arc upward
        frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        frame.paste(img, (0, dy), img)
        frames.append(frame)
    return frames


def _hurt_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Flash (alternate slight redness tint) and shake."""
    frames = []
    w, h = img.size
    shakes = [0, -4, 4]
    shakes = _interpolate_list(shakes, n)
    for i, dx in enumerate(shakes):
        frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        frame.paste(img, (int(dx), 0), img)
        # Red tint on odd frames
        if i % 2 == 1:
            tint = Image.new("RGBA", (w, h), (255, 0, 0, 60))
            frame = Image.alpha_composite(frame, tint)
        frames.append(frame)
    return frames


def _interpolate_list(values: list, target_len: int) -> list:
    """Linearly interpolate a short list to target_len values."""
    if len(values) == target_len:
        return values
    result = []
    for i in range(target_len):
        t = i / max(target_len - 1, 1) * (len(values) - 1)
        lo = int(t)
        hi = min(lo + 1, len(values) - 1)
        frac = t - lo
        result.append(values[lo] * (1 - frac) + values[hi] * frac)
    return result
