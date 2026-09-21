#!/usr/bin/env python3
"""Generate PALACE launcher / adaptive / splash icons (card mark, same sizes as RIGCORE)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "resources"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

BG = (9, 8, 15, 255)
PANEL = (18, 16, 25, 255)
PURPLE = (180, 85, 245, 255)
CYAN = (62, 198, 240, 255)
WHITE = (244, 242, 249, 255)
GOLD = (255, 182, 72, 255)

MIPMAPS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def rounded_rect(draw, box, radius, **kwargs):
    draw.rounded_rectangle(box, radius=radius, **kwargs)


def draw_mark(size: int, pad_ratio: float = 0.18) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * pad_ratio)
    # Playing-card body
    card_box = (pad + size * 0.08, pad, size - pad - size * 0.08, size - pad)
    radius = int(size * 0.08)
    # Gradient-ish fill via two stacked rounded rects
    rounded_rect(draw, card_box, radius, fill=PANEL)
    inner = (
        card_box[0] + size * 0.04,
        card_box[1] + size * 0.04,
        card_box[2] - size * 0.04,
        card_box[3] - size * 0.04,
    )
    rounded_rect(draw, inner, max(4, radius - 4), outline=CYAN, width=max(2, size // 48))
    # Corner pips
    pip = max(3, size // 18)
    draw.ellipse((inner[0] + pip, inner[1] + pip, inner[0] + pip * 2.4, inner[1] + pip * 2.4), fill=PURPLE)
    draw.ellipse((inner[2] - pip * 2.4, inner[3] - pip * 2.4, inner[2] - pip, inner[3] - pip), fill=GOLD)

    font_size = int(size * 0.38)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, font_size)
    letter = "P"
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.02
    draw.text((x + size * 0.01, y + size * 0.01), letter, font=font, fill=(0, 0, 0, 90))
    draw.text((x, y), letter, font=font, fill=WHITE)
    return img


def rounded_app_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    mark = draw_mark(size, pad_ratio=0.14)
    img.alpha_composite(mark)
    radius = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def adaptive_foreground(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = draw_mark(int(size * 0.72), pad_ratio=0.12)
    offset = (size - mark.size[0]) // 2
    img.alpha_composite(mark, (offset, offset))
    return img


def splash(size: int = 2732) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((size * -0.1, size * -0.2, size * 0.55, size * 0.45), fill=(180, 85, 245, 40))
    gdraw.ellipse((size * 0.5, size * 0.05, size * 1.15, size * 0.6), fill=(62, 198, 240, 28))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(180)))
    mark = draw_mark(int(size * 0.28), pad_ratio=0.12)
    x = (size - mark.size[0]) // 2
    y = (size - mark.size[1]) // 2
    img.alpha_composite(mark, (x, y))
    return img


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"wrote {path}")


def main() -> None:
    RES.mkdir(parents=True, exist_ok=True)
    icon = rounded_app_icon(1024)
    save_png(icon, RES / "icon.png")
    save_png(adaptive_foreground(1024), RES / "icon-foreground.png")
    save_png(Image.new("RGBA", (1024, 1024), BG), RES / "icon-background.png")
    save_png(splash(2732), RES / "splash.png")

    if ANDROID_RES.exists():
        fg = adaptive_foreground(432)
        for folder, size in MIPMAPS.items():
            d = ANDROID_RES / folder
            d.mkdir(parents=True, exist_ok=True)
            save_png(rounded_app_icon(size), d / "ic_launcher.png")
            save_png(rounded_app_icon(size), d / "ic_launcher_round.png")
        anydpi = ANDROID_RES / "mipmap-anydpi-v26"
        anydpi.mkdir(parents=True, exist_ok=True)
        (anydpi / "ic_launcher.xml").write_text(
            """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
        )
        (anydpi / "ic_launcher_round.xml").write_text(
            """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
        )
        save_png(fg, ANDROID_RES / "mipmap-xxxhdpi" / "ic_launcher_foreground.png")
        save_png(fg.resize((288, 288), Image.Resampling.LANCZOS), ANDROID_RES / "mipmap-xxhdpi" / "ic_launcher_foreground.png")
        save_png(fg.resize((192, 192), Image.Resampling.LANCZOS), ANDROID_RES / "mipmap-xhdpi" / "ic_launcher_foreground.png")
        save_png(fg.resize((144, 144), Image.Resampling.LANCZOS), ANDROID_RES / "mipmap-hdpi" / "ic_launcher_foreground.png")
        save_png(fg.resize((108, 108), Image.Resampling.LANCZOS), ANDROID_RES / "mipmap-mdpi" / "ic_launcher_foreground.png")
        values = ANDROID_RES / "values"
        values.mkdir(parents=True, exist_ok=True)
        (values / "ic_launcher_background.xml").write_text(
            """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#09080F</color>
</resources>
"""
        )
        splash_hi = splash(1440)
        for path in ANDROID_RES.rglob("splash.png"):
            try:
                existing = Image.open(path)
                w, h = existing.size
            except Exception:
                w, h = 480, 800
            sized = splash(max(w, h)).resize((w, h), Image.Resampling.LANCZOS)
            save_png(sized, path)
        save_png(splash_hi, ANDROID_RES / "drawable" / "splash.png")


if __name__ == "__main__":
    main()
