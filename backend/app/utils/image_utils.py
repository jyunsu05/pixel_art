import os
import uuid
from pathlib import Path
from PIL import Image
import numpy as np


def generate_file_id() -> str:
    return uuid.uuid4().hex


def save_pil_image(img: Image.Image, directory: str, filename: str) -> str:
    """Save a PIL image and return its relative path."""
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    img.save(filepath)
    return filepath


def load_pil_image(filepath: str) -> Image.Image:
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Image not found: {filepath}")
    return Image.open(filepath).convert("RGBA")


def pil_to_numpy(img: Image.Image) -> np.ndarray:
    return np.array(img)


def numpy_to_pil(arr: np.ndarray, mode: str = "RGBA") -> Image.Image:
    return Image.fromarray(arr.astype(np.uint8), mode)


def ensure_rgba(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        return img.convert("RGBA")
    return img


def pad_to_square(img: Image.Image, fill_color: tuple = (0, 0, 0, 0)) -> Image.Image:
    """Pad image to square dimensions (for uniform sprite sheets)."""
    w, h = img.size
    side = max(w, h)
    result = Image.new("RGBA", (side, side), fill_color)
    result.paste(img, ((side - w) // 2, (side - h) // 2))
    return result


def resize_to_cell(img: Image.Image, cell_size: int) -> Image.Image:
    """Resize image to fit inside cell_size x cell_size, preserving aspect ratio."""
    img.thumbnail((cell_size, cell_size), Image.NEAREST)
    padded = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    x = (cell_size - img.width) // 2
    y = (cell_size - img.height) // 2
    padded.paste(img, (x, y), img if img.mode == "RGBA" else None)
    return padded
