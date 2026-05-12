"""
Unity export service.
- Builds a sprite sheet (fixed-cell grid).
- Generates a JSON metadata file compatible with Unity's sprite slicer.
- Names frames as 'Character_Action_FrameIndex.png' (Unity convention).
"""

import os
import json
from PIL import Image

from app.utils.image_utils import resize_to_cell, save_pil_image


def build_sprite_sheet(
    frames: list[Image.Image],
    action: str,
    character_name: str = "Character",
    cell_size: int = 64,
    output_dir: str = "outputs",
    file_id: str = "export",
) -> dict:
    """
    Build a sprite sheet PNG + JSON metadata file for Unity.

    Layout: horizontal strip (all frames in one row).

    Returns dict with keys: sheet_path, json_path, frame_paths, metadata.
    """
    os.makedirs(output_dir, exist_ok=True)
    n = len(frames)

    # Resize every frame to the uniform cell size
    cells = [resize_to_cell(f, cell_size) for f in frames]

    # Create sheet (horizontal strip)
    sheet_w = cell_size * n
    sheet_h = cell_size
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    frame_paths = []
    sprites_meta = []

    for i, cell in enumerate(cells):
        x = i * cell_size
        sheet.paste(cell, (x, 0), cell)

        # Save individual frame with Unity naming convention
        frame_filename = f"{character_name}_{action}_{i:02d}.png"
        frame_path = os.path.join(output_dir, frame_filename)
        cell.save(frame_path)
        frame_paths.append(frame_path)

        sprites_meta.append(
            {
                "name": f"{character_name}_{action}_{i:02d}",
                "x": x,
                "y": 0,
                "width": cell_size,
                "height": cell_size,
                "pivot": {"x": 0.5, "y": 0.5},
            }
        )

    # Save sheet
    sheet_filename = f"{character_name}_{action}_sheet_{file_id}.png"
    sheet_path = os.path.join(output_dir, sheet_filename)
    sheet.save(sheet_path)

    # Build Unity-compatible JSON
    metadata = {
        "character": character_name,
        "action": action,
        "cell_size": cell_size,
        "frame_count": n,
        "sheet_width": sheet_w,
        "sheet_height": sheet_h,
        "sheet_file": sheet_filename,
        "sprites": sprites_meta,
        "unity_hint": {
            "sprite_mode": "Multiple",
            "pixels_per_unit": cell_size,
            "filter_mode": "Point",
            "compression": "None",
            "note": "Import the sheet PNG, set Sprite Mode to Multiple, then use Sprite Editor to Slice by Cell Size.",
        },
    }

    json_filename = f"{character_name}_{action}_meta_{file_id}.json"
    json_path = os.path.join(output_dir, json_filename)
    with open(json_path, "w", encoding="utf-8") as fp:
        json.dump(metadata, fp, indent=2, ensure_ascii=False)

    return {
        "sheet_path": sheet_path,
        "sheet_url": f"/outputs/{sheet_filename}",
        "json_path": json_path,
        "json_url": f"/outputs/{json_filename}",
        "frame_paths": frame_paths,
        "frame_urls": [f"/outputs/{os.path.basename(p)}" for p in frame_paths],
        "metadata": metadata,
    }
