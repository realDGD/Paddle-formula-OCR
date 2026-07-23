from __future__ import annotations

from pathlib import Path


def ensure_smoke_formula(path: Path) -> Path:
    """Create a tiny local formula fixture for backend activation tests."""
    if path.exists():
        return path
    from PIL import Image, ImageDraw

    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (620, 160), "white")
    draw = ImageDraw.Draw(image)
    draw.text((38, 50), "x^2 + y^2 = z^2", fill="black", font=None, stroke_width=0)
    image.save(path, format="PNG")
    return path
