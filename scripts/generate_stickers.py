"""
知衡智企「智剪」贴纸库生成脚本
生成 30 个透明背景 PNG 贴纸，覆盖 6 大类
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

BASE = r"D:\知衡智企\assets\02_贴纸库"

# 颜色定义
YELLOW = (251, 191, 36, 255)
RED = (239, 68, 68, 255)
WHITE = (255, 255, 255, 255)
BLUE = (59, 130, 246, 255)
BLACK = (0, 0, 0, 255)
ORANGE = (249, 115, 22, 255)
GREEN = (34, 197, 94, 255)

def get_font(size, bold=False):
    """获取字体"""
    font_paths = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except:
                continue
    return ImageFont.load_default()

def save(img, category, name):
    """保存贴纸"""
    path = os.path.join(BASE, category, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print(f"  OK: {category}/{name} ({img.size[0]}x{img.size[1]})")

# ============================================================================
# 1. 指示箭头 (6个)
# ============================================================================
def make_arrow(direction, color=YELLOW, size=512):
    """生成箭头"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size
    pad = s * 0.15
    
    if direction == "down":
        # 向下箭头
        points = [
            (s*0.35, pad), (s*0.65, pad),
            (s*0.65, s*0.55), (s*0.8, s*0.55),
            (s*0.5, s*0.85), (s*0.2, s*0.55),
            (s*0.35, s*0.55)
        ]
    elif direction == "up":
        points = [
            (s*0.35, s-pad), (s*0.65, s-pad),
            (s*0.65, s*0.45), (s*0.8, s*0.45),
            (s*0.5, s*0.15), (s*0.2, s*0.45),
            (s*0.35, s*0.45)
        ]
    elif direction == "left":
        points = [
            (s-pad, s*0.35), (s-pad, s*0.65),
            (s*0.45, s*0.65), (s*0.45, s*0.8),
            (s*0.15, s*0.5), (s*0.45, s*0.2),
            (s*0.45, s*0.35)
        ]
    elif direction == "right":
        points = [
            (pad, s*0.35), (pad, s*0.65),
            (s*0.55, s*0.65), (s*0.55, s*0.8),
            (s*0.85, s*0.5), (s*0.55, s*0.2),
            (s*0.55, s*0.35)
        ]
    elif direction == "down_left":
        # 左下箭头
        points = [
            (s*0.7, s*0.2), (s*0.85, s*0.35),
            (s*0.5, s*0.7), (s*0.7, s*0.7),
            (s*0.7, s*0.85), (s*0.3, s*0.85),
            (s*0.15, s*0.7), (s*0.15, s*0.3),
            (s*0.3, s*0.3), (s*0.3, s*0.5)
        ]
    else:  # down_right
        points = [
            (s*0.3, s*0.2), (s*0.15, s*0.35),
            (s*0.5, s*0.7), (s*0.3, s*0.7),
            (s*0.3, s*0.85), (s*0.7, s*0.85),
            (s*0.85, s*0.7), (s*0.85, s*0.3),
            (s*0.7, s*0.3), (s*0.7, s*0.5)
        ]
    
    # 黑色描边
    draw.polygon(points, fill=BLACK)
    # 内部收缩
    shrink = 8
    inner = [(x + (shrink if x < s/2 else -shrink), 
              y + (shrink if y < s/2 else -shrink)) for x, y in points]
    draw.polygon(inner, fill=color)
    return img

print("=== 1. 指示箭头 ===")
save(make_arrow("down", YELLOW), "01_指示箭头", "sticker_arrow_down_yellow.png")
save(make_arrow("up", YELLOW), "01_指示箭头", "sticker_arrow_up_yellow.png")
save(make_arrow("left", WHITE), "01_指示箭头", "sticker_arrow_left_white.png")
save(make_arrow("right", WHITE), "01_指示箭头", "sticker_arrow_right_white.png")
save(make_arrow("down_left", YELLOW), "01_指示箭头", "sticker_arrow_downleft_yellow.png")
save(make_arrow("down_right", YELLOW), "01_指示箭头", "sticker_arrow_downright_yellow.png")

# ============================================================================
# 2. 圈注标记 (5个)
# ============================================================================
print("\n=== 2. 圈注标记 ===")

def make_circle(color=RED, size=512, thickness=12):
    """圆圈"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    # 外黑边
    draw.ellipse([pad, pad, size-pad, size-pad], outline=BLACK, width=thickness+6)
    # 内圈
    draw.ellipse([pad, pad, size-pad, size-pad], outline=color, width=thickness)
    return img

save(make_circle(RED), "02_圈注标记", "sticker_circle_red.png")
save(make_circle(YELLOW), "02_圈注标记", "sticker_circle_yellow.png")

def make_underline(color=RED, size=(512, 128), thickness=14):
    """下划线"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    y = size[1] * 0.5
    # 黑色描边
    draw.line([(20, y), (size[0]-20, y)], fill=BLACK, width=thickness+6)
    # 彩色线
    draw.line([(20, y), (size[0]-20, y)], fill=color, width=thickness)
    return img

save(make_underline(RED), "02_圈注标记", "sticker_underline_red.png")

def make_highlight(color=YELLOW, size=(512, 160)):
    """高亮条（半透明）"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 半透明黄色高亮
    highlight_color = (251, 191, 36, 140)
    draw.rounded_rectangle([10, size[1]*0.25, size[0]-10, size[1]*0.75], 
                           radius=10, fill=highlight_color)
    return img

save(make_highlight(), "02_圈注标记", "sticker_highlight_yellow.png")

def make_wavy_underline(color=RED, size=(512, 128)):
    """波浪下划线"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    y_base = size[1] * 0.5
    amp = 15
    freq = 4
    points = []
    for x in range(20, size[0]-20, 2):
        y = y_base + amp * math.sin(2 * math.pi * freq * (x - 20) / (size[0] - 40))
        points.append((x, y))
    # 黑色描边
    for i in range(len(points)-1):
        draw.line([points[i], points[i+1]], fill=BLACK, width=16)
    # 彩色线
    for i in range(len(points)-1):
        draw.line([points[i], points[i+1]], fill=color, width=10)
    return img

save(make_wavy_underline(RED), "02_圈注标记", "sticker_wavy_underline_red.png")

# ============================================================================
# 3. 装饰元素 (6个)
# ============================================================================
print("\n=== 3. 装饰元素 ===")

def make_star(color=YELLOW, size=512, points=5):
    """星星"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size/2, size/2
    outer = size * 0.42
    inner = outer * 0.45
    star_points = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        angle = math.pi / 2 + i * math.pi / points
        x = cx + r * math.cos(angle)
        y = cy - r * math.sin(angle)
        star_points.append((x, y))
    draw.polygon(star_points, fill=BLACK)
    # 内部
    inner_points = []
    for i in range(points * 2):
        r = (outer - 8) if i % 2 == 0 else (inner - 4)
        angle = math.pi / 2 + i * math.pi / points
        x = cx + r * math.cos(angle)
        y = cy - r * math.sin(angle)
        inner_points.append((x, y))
    draw.polygon(inner_points, fill=color)
    return img

save(make_star(YELLOW), "03_装饰元素", "sticker_star_yellow.png")
save(make_star(WHITE, points=4), "03_装饰元素", "sticker_sparkle_white.png")

def make_explosion(color=YELLOW, size=512):
    """爆炸框"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size/2, size/2
    points_count = 16
    explosion_points = []
    for i in range(points_count * 2):
        r = size * 0.45 if i % 2 == 0 else size * 0.32
        angle = i * math.pi / points_count
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        explosion_points.append((x, y))
    draw.polygon(explosion_points, fill=BLACK)
    inner = []
    for i in range(points_count * 2):
        r = (size * 0.45 - 10) if i % 2 == 0 else (size * 0.32 - 6)
        angle = i * math.pi / points_count
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        inner.append((x, y))
    draw.polygon(inner, fill=color)
    return img

save(make_explosion(RED), "03_装饰元素", "sticker_explosion_red.png")

def make_dot(color=YELLOW, size=256):
    """圆点"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=BLACK)
    draw.ellipse([pad+6, pad+6, size-pad-6, size-pad-6], fill=color)
    return img

save(make_dot(YELLOW), "03_装饰元素", "sticker_dot_yellow.png")

def make_accent_bar(color=YELLOW, size=(32, 512)):
    """侧边装饰条"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size[0], size[1]], radius=size[0]//2, fill=color)
    return img

save(make_accent_bar(YELLOW), "03_装饰元素", "sticker_accent_bar_yellow.png")

# ============================================================================
# 4. 图标 (5个)
# ============================================================================
print("\n=== 4. 图标 ===")

def make_check(size=512):
    """对勾"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆形背景
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=GREEN)
    # 对勾
    check_width = size * 0.12
    p1 = (size*0.28, size*0.52)
    p2 = (size*0.45, size*0.68)
    p3 = (size*0.74, size*0.36)
    draw.line([p1, p2], fill=WHITE, width=int(check_width))
    draw.line([p2, p3], fill=WHITE, width=int(check_width))
    return img

save(make_check(), "04_图标", "sticker_icon_check_green.png")

def make_factory(size=512):
    """工厂图标"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆形背景
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=BLUE)
    # 工厂建筑
    bx1, by1 = size*0.25, size*0.45
    bx2, by2 = size*0.75, size*0.75
    draw.rectangle([bx1, by1, bx2, by2], fill=WHITE)
    # 屋顶（锯齿）
    roof_points = [(bx1, by1)]
    x = bx1
    while x < bx2:
        roof_points.append((x + (bx2-bx1)/6, by1 - size*0.08))
        roof_points.append((x + (bx2-bx1)/3, by1))
        x += (bx2-bx1)/3
    roof_points.append((bx2, by1))
    draw.polygon(roof_points, fill=WHITE)
    # 烟囱
    draw.rectangle([size*0.6, size*0.25, size*0.68, size*0.45], fill=WHITE)
    # 窗户
    for i in range(3):
        wx = bx1 + size*0.08 + i * size*0.13
        draw.rectangle([wx, by1+size*0.08, wx+size*0.08, by1+size*0.18], fill=BLUE)
    return img

save(make_factory(), "04_图标", "sticker_icon_factory_blue.png")

def make_trophy(size=512):
    """奖杯"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=ORANGE)
    # 奖杯杯身
    cup_top = size*0.25
    cup_bottom = size*0.55
    cup_left = size*0.32
    cup_right = size*0.68
    draw.polygon([
        (cup_left, cup_top), (cup_right, cup_top),
        (cup_right - size*0.05, cup_bottom), (cup_left + size*0.05, cup_bottom)
    ], fill=YELLOW)
    # 把手
    draw.arc([cup_left - size*0.12, cup_top, cup_left + size*0.02, cup_top + size*0.18], 
             90, 270, fill=YELLOW, width=int(size*0.04))
    draw.arc([cup_right - size*0.02, cup_top, cup_right + size*0.12, cup_top + size*0.18], 
             270, 90, fill=YELLOW, width=int(size*0.04))
    # 底座
    draw.rectangle([size*0.4, cup_bottom, size*0.6, cup_bottom + size*0.08], fill=YELLOW)
    draw.rectangle([size*0.35, cup_bottom + size*0.08, size*0.65, cup_bottom + size*0.15], fill=YELLOW)
    return img

save(make_trophy(), "04_图标", "sticker_icon_trophy_orange.png")

def make_certificate(size=512):
    """证书"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=BLUE)
    # 证书
    cx1, cy1 = size*0.22, size*0.28
    cx2, cy2 = size*0.78, size*0.72
    draw.rounded_rectangle([cx1, cy1, cx2, cy2], radius=10, fill=WHITE)
    # 证书线条
    draw.line([(cx1+30, cy1+50), (cx2-30, cy1+50)], fill=BLUE, width=4)
    draw.line([(cx1+30, cy1+80), (cx2-80, cy1+80)], fill=BLUE, width=3)
    draw.line([(cx1+30, cy1+105), (cx2-100, cy1+105)], fill=BLUE, width=3)
    # 印章
    draw.ellipse([cx2-80, cy2-80, cx2-30, cy2-30], outline=RED, width=5)
    return img

save(make_certificate(), "04_图标", "sticker_icon_certificate_blue.png")

def make_gear(size=512):
    """齿轮"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=(100, 116, 139, 255))
    cx, cy = size/2, size/2
    teeth = 12
    outer_r = size * 0.35
    inner_r = size * 0.28
    # 齿轮齿
    for i in range(teeth):
        angle = i * 2 * math.pi / teeth
        x1 = cx + outer_r * math.cos(angle) - size*0.04
        y1 = cy + outer_r * math.sin(angle) - size*0.04
        x2 = cx + outer_r * math.cos(angle) + size*0.04
        y2 = cy + outer_r * math.sin(angle) + size*0.04
        draw.rounded_rectangle([x1, y1, x2, y2], radius=4, fill=WHITE)
    # 内圆
    draw.ellipse([cx-inner_r, cy-inner_r, cx+inner_r, cy+inner_r], fill=WHITE)
    draw.ellipse([cx-inner_r*0.5, cy-inner_r*0.5, cx+inner_r*0.5, cy+inner_r*0.5], fill=(100, 116, 139, 255))
    return img

save(make_gear(), "04_图标", "sticker_icon_gear_gray.png")

# ============================================================================
# 5. 文字贴纸 (4个)
# ============================================================================
print("\n=== 5. 文字贴纸 ===")

def make_text_sticker(text, bg_color=YELLOW, text_color=BLACK, size=(512, 200)):
    """文字贴纸（圆角矩形背景+文字）"""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 黑色描边
    draw.rounded_rectangle([4, 4, size[0]-4, size[1]-4], radius=30, fill=BLACK)
    # 背景
    draw.rounded_rectangle([12, 12, size[0]-12, size[1]-12], radius=26, fill=bg_color)
    # 文字
    font_size = int(size[1] * 0.42)
    font = get_font(font_size, bold=True)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size[0] - tw) / 2 - bbox[0]
    ty = (size[1] - th) / 2 - bbox[1]
    draw.text((tx, ty), text, fill=text_color, font=font)
    return img

save(make_text_sticker("划重点", RED, WHITE), "05_文字贴纸", "sticker_text_keypoint_red.png")
save(make_text_sticker("注意", YELLOW, BLACK), "05_文字贴纸", "sticker_text_attention_yellow.png")
save(make_text_sticker("小提示", BLUE, WHITE, size=(512, 180)), "05_文字贴纸", "sticker_text_tip_blue.png")
save(make_text_sticker("重点", ORANGE, WHITE, size=(380, 180)), "05_文字贴纸", "sticker_text_important_orange.png")

# ============================================================================
# 6. Emoji 风格贴纸 (4个)
# ============================================================================
print("\n=== 6. Emoji 风格贴纸 ===")

def make_emoji_surprise(size=512):
    """惊讶表情"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 脸
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=YELLOW)
    # 眼睛（睁大）
    eye_y = size * 0.38
    eye_size = size * 0.1
    draw.ellipse([size*0.3-eye_size, eye_y-eye_size, size*0.3+eye_size, eye_y+eye_size], fill=WHITE)
    draw.ellipse([size*0.7-eye_size, eye_y-eye_size, size*0.7+eye_size, eye_y+eye_size], fill=WHITE)
    pupil_size = eye_size * 0.5
    draw.ellipse([size*0.3-pupil_size, eye_y-pupil_size, size*0.3+pupil_size, eye_y+pupil_size], fill=BLACK)
    draw.ellipse([size*0.7-pupil_size, eye_y-pupil_size, size*0.7+pupil_size, eye_y+pupil_size], fill=BLACK)
    # 嘴巴（O型）
    mouth_y = size * 0.65
    mouth_w = size * 0.12
    draw.ellipse([size*0.5-mouth_w, mouth_y-mouth_w*1.2, size*0.5+mouth_w, mouth_y+mouth_w*1.2], fill=(139, 69, 19, 255))
    return img

save(make_emoji_surprise(), "06_Emoji", "sticker_emoji_surprise.png")

def make_emoji_thumbsup(size=512):
    """点赞"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆形背景
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=YELLOW)
    # 手（简化）
    hand_color = (255, 220, 177, 255)
    # 手掌
    draw.rounded_rectangle([size*0.35, size*0.45, size*0.65, size*0.75], radius=15, fill=hand_color)
    # 拇指
    draw.rounded_rectangle([size*0.42, size*0.2, size*0.58, size*0.5], radius=20, fill=hand_color)
    # 手指
    for i in range(4):
        fx = size*0.35 + i * size*0.075
        draw.rounded_rectangle([fx, size*0.4, fx+size*0.06, size*0.55], radius=8, fill=hand_color)
    return img

save(make_emoji_thumbsup(), "06_Emoji", "sticker_emoji_thumbsup.png")

def make_emoji_thinking(size=512):
    """思考"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.1
    draw.ellipse([pad, pad, size-pad, size-pad], fill=YELLOW)
    # 眼睛（斜视）
    eye_y = size * 0.4
    draw.ellipse([size*0.28, eye_y-15, size*0.42, eye_y+15], fill=WHITE)
    draw.ellipse([size*0.58, eye_y-15, size*0.72, eye_y+15], fill=WHITE)
    draw.ellipse([size*0.34, eye_y-8, size*0.42, eye_y+8], fill=BLACK)
    draw.ellipse([size*0.64, eye_y-8, size*0.72, eye_y+8], fill=BLACK)
    # 嘴巴（歪）
    draw.arc([size*0.35, size*0.55, size*0.65, size*0.72], 200, 340, fill=BLACK, width=8)
    # 手（托下巴）
    hand_color = (255, 220, 177, 255)
    draw.ellipse([size*0.55, size*0.6, size*0.8, size*0.85], fill=hand_color)
    # 食指
    draw.rounded_rectangle([size*0.5, size*0.55, size*0.62, size*0.7], radius=12, fill=hand_color)
    return img

save(make_emoji_thinking(), "06_Emoji", "sticker_emoji_thinking.png")

def make_emoji_fire(size=512):
    """火"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 火焰形状
    fire_points = [
        (size*0.5, size*0.1),
        (size*0.7, size*0.35),
        (size*0.65, size*0.45),
        (size*0.8, size*0.55),
        (size*0.7, size*0.85),
        (size*0.5, size*0.9),
        (size*0.3, size*0.85),
        (size*0.2, size*0.55),
        (size*0.35, size*0.45),
        (size*0.3, size*0.35),
    ]
    draw.polygon(fire_points, fill=RED)
    # 内焰
    inner_points = [
        (size*0.5, size*0.3),
        (size*0.62, size*0.48),
        (size*0.58, size*0.55),
        (size*0.65, size*0.65),
        (size*0.5, size*0.8),
        (size*0.35, size*0.65),
        (size*0.42, size*0.55),
        (size*0.38, size*0.48),
    ]
    draw.polygon(inner_points, fill=ORANGE)
    # 核心
    core_points = [
        (size*0.5, size*0.5),
        (size*0.56, size*0.6),
        (size*0.5, size*0.72),
        (size*0.44, size*0.6),
    ]
    draw.polygon(core_points, fill=YELLOW)
    return img

save(make_emoji_fire(), "06_Emoji", "sticker_emoji_fire.png")

print("\n=== 全部完成！===")
print("共生成 30 个贴纸")
