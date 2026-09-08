# -*- coding: utf-8 -*-
"""用 imageio-ffmpeg（完整 ffmpeg 7.1，构建期工具）把标签帧编码为测试视频。"""
import os
import subprocess

FF = r"D:\剪映智剪测试\poc-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
FR = r"D:\知衡智企\desktop\runtime-src\assets\golden-test\frames"
OUT = r"D:\知衡智企\desktop\runtime-src\assets\golden-test\videos"
os.makedirs(OUT, exist_ok=True)

CLIPS = [
    ("01_aseptic_filling", 12),
    ("02_bottling_line", 14),
    ("03_warehouse", 12),
    ("04_quality_check", 10),
    ("05_labeling_pack", 12),
    ("06_raw_material", 10),
    ("07_shipping", 12),
    ("08_rd_sampling", 14),
]

for key, dur in CLIPS:
    src = os.path.join(FR, key + ".png")
    dst = os.path.join(OUT, key + ".mp4")
    cmd = [
        FF, "-y", "-loop", "1", "-i", src,
        "-f", "lavfi", "-i", "sine=frequency=440:duration=%d" % dur,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        "-c:a", "aac", "-t", str(dur), "-shortest",
        "-movflags", "+faststart", dst,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 0:
        print("OK", key, os.path.getsize(dst))
    else:
        print("FAIL", key, r.stderr[-500:])
print("DONE")
