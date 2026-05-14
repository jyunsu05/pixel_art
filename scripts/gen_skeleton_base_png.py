"""One-shot: writes frontend/public/skeleton_base.png (4x4 pose grid placeholder)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "skeleton_base.png"


def main() -> None:
    W, H = 512, 512
    cols, rows = 4, 4
    cw, ch = W // cols, H // rows
    img = Image.new("RGBA", (W, H), (248, 249, 252, 255))
    d = ImageDraw.Draw(img)

    for r in range(rows + 1):
        d.line([(0, r * ch), (W, r * ch)], fill=(220, 224, 232, 255), width=1)
    for c in range(cols + 1):
        d.line([(c * cw, 0), (c * cw, H)], fill=(220, 224, 232, 255), width=1)

    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cw, r * ch
            cx = x0 + cw // 2
            bot = y0 + ch - 18
            top = y0 + 22
            off = (c % 4 - 1.5) * 6
            d.ellipse(
                [cx - 10 + off, top, cx + 10 + off, top + 18],
                outline=(45, 52, 70, 255),
                width=2,
            )
            d.line([(cx + off, top + 18), (cx + off, bot - 28)], fill=(45, 52, 70, 255), width=2)
            d.line(
                [(cx + off, y0 + ch // 2), (x0 + 18, y0 + ch // 2 + 8)],
                fill=(45, 52, 70, 255),
                width=2,
            )
            d.line(
                [(cx + off, y0 + ch // 2), (x0 + cw - 18, y0 + ch // 2 + 8)],
                fill=(45, 52, 70, 255),
                width=2,
            )
            d.line([(cx + off, bot - 28), (x0 + 22, bot)], fill=(45, 52, 70, 255), width=2)
            d.line([(cx + off, bot - 28), (x0 + cw - 22, bot)], fill=(45, 52, 70, 255), width=2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
