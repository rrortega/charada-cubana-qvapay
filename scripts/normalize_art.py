#!/usr/bin/env python3
"""Normalise the charada artwork so every drawing fills its canvas the same way.

The files arrive as 128x128 canvases whose content occupies between 16% and 77%
of the area, so an icon like `06/botella.png` (38x70 of drawing) renders tiny next
to `55/iglesia-grande.png` (112x112). Setting width and height in CSS cannot fix
that: the difference lives inside the file.

This trims the transparent margin, scales the drawing to fit a common box and
centres it on the same canvas. Sources are at most 112px of content and displays
are 44-132px, so the scaled copy is what the screen needs.

Usage:
    python3 scripts/normalize_art.py           # aplica los cambios
    python3 scripts/normalize_art.py --dry     # solo informa
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "significados"
CANVAS = 128
BOX = 108  # el dibujo ocupa 108 de los 128, dejando 10 px de aire por lado


def main(dry_run: bool) -> None:
    changed = 0
    skipped = 0

    for path in sorted(ART.rglob("*.png")):
        image = Image.open(path).convert("RGBA")
        bbox = image.getbbox()
        if not bbox:
            skipped += 1
            continue

        drawing = image.crop(bbox)
        scale = BOX / max(drawing.size)
        size = (max(1, round(drawing.width * scale)), max(1, round(drawing.height * scale)))
        drawing = drawing.resize(size, Image.LANCZOS)

        canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.paste(drawing, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2), drawing)

        if dry_run:
            print(f"{path.relative_to(ART)}: {bbox[2] - bbox[0]}x{bbox[3] - bbox[1]} -> {size[0]}x{size[1]}")
        else:
            canvas.save(path, optimize=True)
        changed += 1

    print(f"{'would normalise' if dry_run else 'normalised'} {changed} icons, skipped {skipped}")


if __name__ == "__main__":
    main("--dry" in sys.argv)
