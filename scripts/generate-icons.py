#!/usr/bin/env python3
"""Generate RIGCORE launcher / adaptive / splash icons."""
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

MIPMAPS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def gradient_circle(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    r = size / 2
    for y in range(size):
        for x in range(size):
            dx = (x + 0.5 - r) / r
            dy = (y + 0.5 - r) / r
            d = (dx * dx + dy * dy) ** 0.5
            if d > 1:
                continue
            t = (dx + 1) * 0.5
            col = lerp(PURPLE, CYAN, t)
            fade = max(0.0, 1.0 - max(0.0, d - 0.92) / 0.08)
            px[x, y] = (col[0], col[1], col[2], int(255 * fade))
    return img


def draw_mark(size: int, pad_ratio: float = 0.18) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * pad_ratio)
    inner = size - pad * 2
    # Outer ring (weight plate)
    draw.ellipse((pad, pad, size - pad, size - pad), fill=PANEL)
    ring = gradient_circle(inner)
    img.alpha_composite(ring, (pad, pad))
    hole = int(size * 0.16)
    cx = cy = size // 2
    draw.ellipse((cx - hole, cy - hole, cx + hole, cy + hole), fill=BG)

    font_size = int(size * 0.42)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, font_size)
    letter = "R"
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.02
    # Gradient-ish letter via cyan overlay
    draw.text((x + size * 0.01, y + size * 0.01), letter, font=font, fill=(0, 0, 0, 90))
    draw.text((x, y), letter, font=font, fill=WHITE)
    return img


def rounded_app_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    mark = draw_mark(size, pad_ratio=0.14)
    img.alpha_composite(mark)
    # round mask for play-store style preview
    radius = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def adaptive_foreground(size: int = 1024) -> Image.Image:
    # Adaptive safe zone is the inner 66%. Keep the mark inside that.
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = draw_mark(int(size * 0.72), pad_ratio=0.12)
    offset = (size - mark.size[0]) // 2
    img.alpha_composite(mark, (offset, offset))
    return img


def splash(size: int = 2732) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    # Soft radial glows
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
        bg = Image.new("RGBA", (432, 432), BG)
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
        colors = values / "ic_launcher_background.xml"
        colors.write_text(
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

    ios_icon_dir = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset"
    ios_splash_dir = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "Splash.imageset"
    if ios_icon_dir.exists():
        save_png(rounded_app_icon(1024), ios_icon_dir / "AppIcon-512@2x.png")
    if ios_splash_dir.exists():
        splash_img = splash(2732)
        save_png(splash_img, ios_splash_dir / "splash-2732x2732.png")
        save_png(splash_img, ios_splash_dir / "splash-2732x2732-1.png")
        save_png(splash_img, ios_splash_dir / "splash-2732x2732-2.png")


if __name__ == "__main__":
    main()
