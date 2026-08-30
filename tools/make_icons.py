# -*- coding: utf-8 -*-
"""Genera le icone della PWA a partire da stemmabasilica.png.

Uso:  python tools/make_icons.py
"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "stemmabasilica.png")
OUT = os.path.join(BASE, "app", "icons")
BG = (251, 247, 239, 255)  # avorio, coerente col tema chiaro dell'app


def compose(size, margin_ratio, bg=BG):
    """Stemma centrato su fondo quadrato, con margine proporzionale."""
    canvas = Image.new("RGBA", (size, size), bg)
    logo = Image.open(SRC).convert("RGBA")
    box = int(size * (1 - 2 * margin_ratio))
    scale = min(box / logo.width, box / logo.height)
    logo = logo.resize((max(1, int(logo.width * scale)), max(1, int(logo.height * scale))), Image.LANCZOS)
    canvas.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
    return canvas


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.06, BG),
        ("icon-512.png", 512, 0.06, BG),
        # maskable: il logo deve stare nel 80% centrale, il resto puo' essere ritagliato
        ("icon-maskable-512.png", 512, 0.20, BG),
        ("apple-touch-icon.png", 180, 0.08, BG),
        ("favicon-32.png", 32, 0.04, BG),
    ]
    for name, size, margin, bg in jobs:
        compose(size, margin, bg).save(os.path.join(OUT, name))
        print("  ", name, "%dx%d" % (size, size))

    # logo trasparente per l'intestazione dell'app e la stampa
    logo = Image.open(SRC).convert("RGBA")
    h = 320
    logo.resize((int(logo.width * h / logo.height), h), Image.LANCZOS).save(
        os.path.join(OUT, "logo.png")
    )
    print("   logo.png (trasparente, h=320)")


if __name__ == "__main__":
    main()
