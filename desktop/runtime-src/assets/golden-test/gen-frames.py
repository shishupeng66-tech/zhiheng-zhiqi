# -*- coding: utf-8 -*-
"""生成黄金测试素材标签帧（PNG 1920x1080，含中文标签）。"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"D:\知衡智企\desktop\runtime-src\assets\golden-test\frames"
os.makedirs(OUT, exist_ok=True)

FONT = r"C:\Windows\Fonts\msyh.ttc"
CLIPS = [
    ("01_aseptic_filling", "无菌灌装车间", (42, 111, 151)),
    ("02_bottling_line", "瓶装生产线", (58, 125, 68)),
    ("03_warehouse", "成品仓储", (181, 101, 29)),
    ("04_quality_check", "质量检测", (109, 89, 122)),
    ("05_labeling_pack", "包装贴标", (0, 127, 95)),
    ("06_raw_material", "原料仓库", (187, 133, 0)),
    ("07_shipping", "发货装车", (53, 80, 112)),
    ("08_rd_sampling", "研发打样", (156, 102, 68)),
]

for key, label, rgb in CLIPS:
    img = Image.new("RGB", (1920, 1080), rgb)
    d = ImageDraw.Draw(img)
    try:
        font_big = ImageFont.truetype(FONT, 120)
        font_sub = ImageFont.truetype(FONT, 44)
    except Exception:
        font_big = ImageFont.load_default()
        font_sub = ImageFont.load_default()
    # 装饰线
    d.rectangle([80, 120, 1840, 126], fill=(255, 255, 255, 160))
    d.rectangle([80, 954, 1840, 960], fill=(255, 255, 255, 160))
    # 主标签
    bb = d.textbbox((0, 0), label, font=font_big)
    d.text(((1920 - (bb[2] - bb[0])) / 2, 400), label, font=font_big, fill=(255, 255, 255))
    sub = "ZHI-HENG GOLDEN TEST MATERIAL"
    bb2 = d.textbbox((0, 0), sub, font=font_sub)
    d.text(((1920 - (bb2[2] - bb2[0])) / 2, 620), sub, font=font_sub, fill=(235, 235, 235))
    img.save(os.path.join(OUT, key + ".png"), "PNG")
    print("OK", key)
print("DONE")
