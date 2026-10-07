#!/usr/bin/env python3
"""Animated WebP for the README, encoded with Pillow (libwebp's own animation encoder).

ffmpeg's libwebp_anim left traces of fading highlights in the brief panel (lossy frame
differences); here every frame is encoded whole against the previous one by libwebp itself.

    python3 webp.py out/klient.mp4 ../../docs/media/klient.webp [WIDTH=1000] [FPS=20] [Q=85]
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

src, out = sys.argv[1], Path(sys.argv[2])
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
fps = int(sys.argv[4]) if len(sys.argv) > 4 else 20
q = int(sys.argv[5]) if len(sys.argv) > 5 else 85

with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"fps={fps},scale={width}:-2:flags=lanczos", f"{tmp}/f-%04d.png"],
        check=True,
    )
    frames = [Image.open(p).convert("RGB") for p in sorted(Path(tmp).glob("f-*.png"))]
    part = out.with_suffix(".part.webp")
    frames[0].save(
        part,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / fps),
        loop=0,
        quality=q,
        method=6,
        allow_mixed=False,
        minimize_size=False,
    )
    part.replace(out)
print(out, frames[0].size, len(frames), "frames", f"{out.stat().st_size / 1e6:.2f} MB")
