#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "offline-app" / "assets"
SOURCE = ASSET_DIR / "rider-marker-source.jpg"


def make_marker(size: int, out_path: Path) -> None:
    src = Image.open(SOURCE).convert("RGB")
    width, height = src.size
    crop_size = min(width, height)
    # Bias the crop slightly upward, while leaving the lower face intact.
    left = (width - crop_size) // 2
    top = min(max(28, int((height - crop_size) * 0.12)), height - crop_size)
    crop = src.crop((left, top, left + crop_size, top + crop_size))

    padding = max(18, size // 11)
    inner = size - padding * 2
    img = crop.resize((inner, inner), Image.Resampling.LANCZOS).convert("RGBA")

    inner_mask = Image.new("L", (inner, inner), 0)
    inner_draw = ImageDraw.Draw(inner_mask)
    inner_draw.ellipse((0, 0, inner, inner), fill=255)

    clipped = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    clipped.paste(img, (padding, padding), inner_mask)

    shadow_source = Image.new("L", (size, size), 0)
    shadow_source.paste(inner_mask, (padding + max(1, size // 80), padding + max(2, size // 70)))
    shadow = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    shadow_mask = shadow_source.filter(ImageFilter.GaussianBlur(max(3, size // 34)))
    shadow.paste((0, 0, 0, 80), (0, 0), shadow_mask)

    ring = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    ring_draw = ImageDraw.Draw(ring)
    ring_width = max(5, size // 22)
    ring_draw.ellipse(
        (padding, padding, size - padding, size - padding),
        outline=(255, 255, 255, 255),
        width=ring_width,
    )
    accent_width = max(2, size // 64)
    ring_draw.ellipse(
        (padding + ring_width, padding + ring_width, size - padding - ring_width, size - padding - ring_width),
        outline=(46, 107, 78, 255),
        width=accent_width,
    )

    canvas = Image.alpha_composite(shadow, clipped)
    canvas = Image.alpha_composite(canvas, ring)
    canvas.save(out_path)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source image: {SOURCE}")
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    make_marker(256, ASSET_DIR / "rider-marker.png")
    make_marker(512, ASSET_DIR / "rider-marker@2x.png")
    print(ASSET_DIR / "rider-marker.png")
    print(ASSET_DIR / "rider-marker@2x.png")


if __name__ == "__main__":
    main()
