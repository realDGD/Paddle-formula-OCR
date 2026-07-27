from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


def _rgb_on_white(image: Image.Image) -> tuple[Image.Image, bool]:
    """Return an RGB image while preserving dark content on transparent images."""
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    )
    if not has_alpha:
        return image.convert("RGB"), False

    rgba = image.convert("RGBA")
    sample = rgba.copy()
    sample.thumbnail((256, 256))
    visible_luminance = [
        (red + green + blue) / 3
        for red, green, blue, alpha in sample.getdata()
        if alpha >= 32
    ]
    light_foreground = (
        bool(visible_luminance)
        and sum(visible_luminance) / len(visible_luminance) > 180
    )
    background_value = 0 if light_foreground else 255
    background = Image.new(
        "RGBA",
        rgba.size,
        (background_value, background_value, background_value, 255),
    )
    return Image.alpha_composite(background, rgba).convert("RGB"), True


def _background_luminance(image: Image.Image) -> float:
    width, height = image.size
    points = {
        (0, 0),
        (width // 2, 0),
        (width - 1, 0),
        (0, height // 2),
        (width - 1, height // 2),
        (0, height - 1),
        (width // 2, height - 1),
        (width - 1, height - 1),
    }
    samples = [sum(image.getpixel(point)) / 3 for point in points]
    return sum(samples) / len(samples)


def prepare_image_for_ocr(image_path: str | Path) -> str:
    """Normalize transparency and invert genuinely dark backgrounds.

    A separate PNG is returned only when normalization is necessary. Callers own
    that temporary file and should remove it after inference.
    """
    source_path = Path(image_path)
    with Image.open(source_path) as source:
        image, flattened_alpha = _rgb_on_white(source)
        if image.width == 0 or image.height == 0:
            return str(source_path)
        dark_background = _background_luminance(image) < 110
        if not flattened_alpha and not dark_background:
            return str(source_path)
        if dark_background:
            image = ImageOps.invert(image)
        target_path = source_path.with_name(f"{source_path.name}.normalized.png")
        image.save(target_path, format="PNG")
    return str(target_path)


def preprocess_image_in_place(image_path: Path) -> None:
    """Compatibility helper used by tests and external integrations."""
    prepared_path = Path(prepare_image_for_ocr(image_path))
    if prepared_path == image_path:
        return
    prepared_path.replace(image_path)
