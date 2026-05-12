"""
Animation frame generation service.

Key improvement over the old version:
  The character body is divided into three horizontal zones —
  HEAD / TORSO / LEGS — and each zone is independently offset per frame.
  This creates the illusion of actual limb movement instead of just
  translating the whole image.

Walk  : legs swing L/R, torso counter-swings, head bobs
Attack: torso/head lunge forward, legs stay planted
Jump  : body stretches up, legs trail, lands with squash
Idle  : gentle vertical bob + breathing
Hurt  : stagger with red-tint flash
"""

import math
import numpy as np
from PIL import Image

from app.utils.image_utils import ensure_rgba


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

MOTIONS = {
    "idle":   {"frames": 4,  "desc": "Breathing / idle"},
    "walk":   {"frames": 6,  "desc": "Walk cycle"},
    "attack": {"frames": 5,  "desc": "Attack swing"},
    "jump":   {"frames": 4,  "desc": "Jump arc"},
    "hurt":   {"frames": 3,  "desc": "Hit reaction"},
}


def generate_frames(
    img: Image.Image,
    motion: str = "walk",
    frame_count: int | None = None,
) -> list[Image.Image]:
    img = ensure_rgba(img)
    n = frame_count or MOTIONS.get(motion, MOTIONS["walk"])["frames"]
    handlers = {
        "idle":   _idle_frames,
        "walk":   _walk_frames,
        "attack": _attack_frames,
        "jump":   _jump_frames,
        "hurt":   _hurt_frames,
    }
    return handlers.get(motion, _walk_frames)(img, n)


# ---------------------------------------------------------------------------
# Body-region helpers
# ---------------------------------------------------------------------------

def _find_bbox(img: Image.Image):
    """Return (left, top, right, bottom) of non-transparent pixels."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 20, axis=1)
    cols = np.any(alpha > 20, axis=0)
    if not rows.any():
        return (0, 0, img.width, img.height)
    top, bottom = int(np.argmax(rows)), int(len(rows) - 1 - np.argmax(rows[::-1]))
    left,  right  = int(np.argmax(cols)), int(len(cols) - 1 - np.argmax(cols[::-1]))
    return left, top, right, bottom


def _zones(img: Image.Image):
    """
    Divide the character's active pixel region into thirds:
      head  = top 1/3
      torso = middle 1/3
      legs  = bottom 1/3
    Returns dict with y-coordinates.
    """
    _, top, _, bottom = _find_bbox(img)
    h = max(bottom - top, 1)
    return {
        "top":        top,
        "head_end":   top + h // 3,
        "torso_end":  top + 2 * h // 3,
        "bottom":     bottom + 1,
    }


def _shift_zone(img: Image.Image, y1: int, y2: int,
                dx: int = 0, dy: int = 0,
                scale_x: float = 1.0, scale_y: float = 1.0) -> Image.Image:
    """
    Extract a horizontal strip of `img`, apply a small transform,
    and return it composited back on a transparent canvas of the
    original size.
    """
    w, h = img.size
    strip = img.crop((0, y1, w, y2))
    sw, sh = strip.size

    new_w = max(1, int(sw * scale_x))
    new_h = max(1, int(sh * scale_y))
    if (new_w, new_h) != (sw, sh):
        strip = strip.resize((new_w, new_h), Image.NEAREST)

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    paste_x = max(0, min(w - new_w, (sw - new_w) // 2 + dx))
    paste_y = y1 + dy
    layer.paste(strip, (paste_x, paste_y), strip)
    return layer


def _composite(*layers: Image.Image) -> Image.Image:
    """Alpha-composite a sequence of same-size RGBA layers."""
    result = layers[0].copy()
    for layer in layers[1:]:
        result = Image.alpha_composite(result, layer)
    return result


# ---------------------------------------------------------------------------
# Per-motion frame generators
# ---------------------------------------------------------------------------

def _idle_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Gentle breathing bob — independent head/torso movement."""
    z = _zones(img)
    frames = []
    for i in range(n):
        t = i / n
        # Head: slight nod
        head_dy = int(math.sin(t * math.pi * 2) * 2)
        # Torso: breathing expand
        torso_sx = 1.0 + math.sin(t * math.pi * 2) * 0.015
        # Legs: stable
        head  = _shift_zone(img, z["top"],       z["head_end"],  dy=head_dy)
        torso = _shift_zone(img, z["head_end"],  z["torso_end"], scale_x=torso_sx)
        legs  = _shift_zone(img, z["torso_end"], z["bottom"])
        frames.append(_composite(legs, torso, head))
    return frames


def _walk_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """
    Walk cycle using independent body-zone animation.
    Legs swing L↔R, torso counter-swings, head bobs up/down.
    """
    z = _zones(img)
    w, h = img.size
    frames = []

    # Scale offsets relative to character size
    char_h = z["bottom"] - z["top"]
    leg_amp   = max(2, char_h // 16)   # leg stride pixels
    torso_amp = max(1, char_h // 28)   # upper body counter-sway
    head_amp  = max(1, char_h // 24)   # head vertical bob

    for i in range(n):
        t = i / n

        # Legs alternate left/right (one full sin cycle = one step cycle)
        leg_dx    = int(math.sin(t * math.pi * 2) * leg_amp)
        # Slight leg stretch at mid-stride
        leg_sy    = 1.0 + abs(math.sin(t * math.pi * 2)) * 0.04

        # Torso sways opposite to legs
        torso_dx  = int(-math.sin(t * math.pi * 2) * torso_amp)

        # Head bobs down at each footfall (twice per cycle)
        head_dy   = int(abs(math.sin(t * math.pi * 2)) * head_amp)

        head  = _shift_zone(img, z["top"],       z["head_end"],  dx=torso_dx, dy=head_dy)
        torso = _shift_zone(img, z["head_end"],  z["torso_end"], dx=torso_dx)
        legs  = _shift_zone(img, z["torso_end"], z["bottom"],    dx=leg_dx, scale_y=leg_sy)

        frames.append(_composite(legs, torso, head))
    return frames


def _attack_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """
    Attack: wind-up (lean back) → lunge forward (torso/head extend) → return.
    Legs stay planted; upper body drives the motion.
    """
    z = _zones(img)
    char_h = z["bottom"] - z["top"]
    lunge_amp = max(3, char_h // 10)

    # Keyframe x-offsets for head+torso: [rest, windup, lunge, lunge_peak, return, rest]
    key_upper = [0, -lunge_amp // 2, lunge_amp, lunge_amp + 2, lunge_amp // 2, 0]
    key_upper = _interpolate(key_upper, n)

    frames = []
    for i, dx in enumerate(key_upper):
        dx = int(dx)
        # Slight forward tilt (scale upper body narrower = lean)
        tilt = 1.0 - abs(dx) / (lunge_amp * 6)

        head  = _shift_zone(img, z["top"],       z["head_end"],  dx=dx, scale_x=tilt)
        torso = _shift_zone(img, z["head_end"],  z["torso_end"], dx=dx, scale_x=tilt)
        legs  = _shift_zone(img, z["torso_end"], z["bottom"])
        frames.append(_composite(legs, torso, head))
    return frames


def _jump_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """
    Jump arc: legs trail behind body on ascent, stretch at apex, squash on landing.
    """
    z = _zones(img)
    char_h = z["bottom"] - z["top"]
    jump_h  = max(6, char_h // 5)

    frames = []
    for i in range(n):
        t = i / max(n - 1, 1)
        arc_dy = -int(math.sin(t * math.pi) * jump_h)

        # Apex: slight stretch; take-off/landing: slight squash
        if 0.4 < t < 0.6:          # apex
            body_sy = 1.08
            leg_dy  = arc_dy + int(jump_h * 0.15)   # legs trail up
        elif t < 0.15 or t > 0.85: # landing/takeoff squash
            body_sy = 0.90
            leg_dy  = arc_dy
        else:
            body_sy = 1.0
            leg_dy  = arc_dy

        head  = _shift_zone(img, z["top"],       z["head_end"],  dy=arc_dy, scale_y=body_sy)
        torso = _shift_zone(img, z["head_end"],  z["torso_end"], dy=arc_dy, scale_y=body_sy)
        legs  = _shift_zone(img, z["torso_end"], z["bottom"],    dy=leg_dy)
        frames.append(_composite(legs, torso, head))
    return frames


def _hurt_frames(img: Image.Image, n: int) -> list[Image.Image]:
    """Hit reaction: stagger + torso flinch + red flash."""
    z = _zones(img)
    char_h  = z["bottom"] - z["top"]
    stagger = max(3, char_h // 12)

    key_dx = [0]
    for i in range(1, n - 1):
        t = i / (n - 1)
        key_dx.append(int(math.sin(t * math.pi * 3) * stagger * (1 - t)))
    key_dx.append(0)

    w, h = img.size
    frames = []
    for i, dx in enumerate(key_dx):
        dy_torso = -int(char_h * 0.04) if i == 1 else 0

        head  = _shift_zone(img, z["top"],       z["head_end"],  dx=dx // 2, dy=dy_torso)
        torso = _shift_zone(img, z["head_end"],  z["torso_end"], dx=dx,       dy=dy_torso)
        legs  = _shift_zone(img, z["torso_end"], z["bottom"],    dx=dx // 3)

        frame = _composite(legs, torso, head)
        # Red flash on odd frames
        if i % 2 == 1:
            tint  = Image.new("RGBA", (w, h), (255, 40, 40, 90))
            frame = Image.alpha_composite(frame, tint)
        frames.append(frame)
    return frames


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _interpolate(values: list, target_len: int) -> list:
    """Linearly interpolate a keyframe list to target_len values."""
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
