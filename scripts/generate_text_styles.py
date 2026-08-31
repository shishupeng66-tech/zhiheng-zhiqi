"""
知衡智企「智剪」花字模板库生成脚本
生成 10 个花字模板 JSON 配置
"""
import json
import os

BASE = r"D:\知衡智企\assets\03_花字模板库"

# 颜色定义（ASS 格式：&HBBGGRR）
WHITE = "&H00FFFFFF"
BLACK = "&H00000000"
YELLOW = "&H0024BBFB"    # #FBBF24
RED = "&H004444EF"       # #EF4444
BLUE = "&H00F6823B"      # #3B82F6
ORANGE = "&H001671F9"    # #F97316
DARK_GRAY = "&H00333333"

def make_template(tid, name, category, description, ass_style, decorations, animation, usage, tags):
    """生成花字模板"""
    return {
        "id": tid,
        "name": name,
        "category": category,
        "description": description,
        "version": "1.0",
        "status": "provisional",
        "assStyle": ass_style,
        "decorations": decorations,
        "animation": animation,
        "usage": usage,
        "tags": tags
    }

# 通用字体
FONT_BOLD = "Microsoft YaHei"
FONT_REGULAR = "Microsoft YaHei"

templates = []

# ============================================================================
# 1. 开场爆炸式
# ============================================================================
templates.append(make_template(
    "textstyle_opening_boom",
    "开场爆炸式",
    "opening",
    "红色爆炸框+黄色大字+弹入动画，用于视频开场，视觉冲击力强",
    {
        "fontName": FONT_BOLD,
        "fontSize": 96,
        "primaryColor": YELLOW,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "italic": False,
        "underline": False,
        "borderStyle": 1,
        "outline": 6,
        "shadow": 2,
        "alignment": 5,  # 正中
        "marginL": 60,
        "marginR": 60,
        "marginV": 400
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_explosion_red",
            "position": "behind_text",
            "scale": 1.8,
            "opacity": 0.95,
            "offsetX": 0,
            "offsetY": 0
        }
    ],
    {
        "in": "pop_in",
        "inDuration": 400,
        "out": "fade_out",
        "outDuration": 200,
        "popScale": [0, 1.3, 1.0]
    },
    "用于视频开场0-3秒，大标题+爆炸框，快速抓住注意力。适合'饮品代工怎么选'、'工厂实拍'等开场标题。",
    ["开场", "爆炸", "大标题", "冲击", "黄色", "红色"]
))

# ============================================================================
# 2. 开场简洁式
# ============================================================================
templates.append(make_template(
    "textstyle_opening_clean",
    "开场简洁式",
    "opening",
    "白色大字+黄色侧边条+淡入动画，简洁商务风格",
    {
        "fontName": FONT_BOLD,
        "fontSize": 88,
        "primaryColor": WHITE,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 5,
        "shadow": 2,
        "alignment": 4,  # 左中
        "marginL": 140,
        "marginR": 60,
        "marginV": 380
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_accent_bar_yellow",
            "position": "left_of_text",
            "scale": 0.8,
            "opacity": 1.0,
            "offsetX": -80,
            "offsetY": 0
        }
    ],
    {
        "in": "fade_in",
        "inDuration": 500,
        "out": "fade_out",
        "outDuration": 300
    },
    "用于商务风格开场，简洁不花哨。适合企业介绍、品牌故事等正式场合开场。",
    ["开场", "简洁", "商务", "白色", "侧边条", "淡入"]
))

# ============================================================================
# 3. 重点色块式
# ============================================================================
templates.append(make_template(
    "textstyle_emphasis_block",
    "重点色块式",
    "emphasis",
    "黄色半透明底色块+黑色粗体字+放大弹入，突出核心卖点",
    {
        "fontName": FONT_BOLD,
        "fontSize": 72,
        "primaryColor": BLACK,
        "outlineColor": "&H00000000",
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 0,
        "shadow": 0,
        "alignment": 5,
        "marginL": 80,
        "marginR": 80,
        "marginV": 500
    },
    [
        {
            "type": "graphic",
            "shape": "rounded_rect",
            "position": "behind_text",
            "backgroundColor": "#FBBF24",
            "opacity": 0.9,
            "paddingX": 40,
            "paddingY": 20,
            "cornerRadius": 16
        }
    ],
    {
        "in": "pop_in",
        "inDuration": 350,
        "out": "fade_out",
        "outDuration": 200,
        "popScale": [0, 1.2, 1.0]
    },
    "用于核心卖点、关键数据、重要结论的强调。黄色色块+黑字在任何背景上都清晰可见。",
    ["重点", "色块", "黄色", "强调", "核心卖点", "弹入"]
))

# ============================================================================
# 4. 重点下划线式
# ============================================================================
templates.append(make_template(
    "textstyle_emphasis_underline",
    "重点下划线式",
    "emphasis",
    "白色粗体字+黄色下划线+淡入，简洁优雅的强调方式",
    {
        "fontName": FONT_BOLD,
        "fontSize": 76,
        "primaryColor": WHITE,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "underline": False,
        "borderStyle": 1,
        "outline": 5,
        "shadow": 2,
        "alignment": 5,
        "marginL": 80,
        "marginR": 80,
        "marginV": 500
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_underline_red",
            "position": "below_text",
            "scale": 1.0,
            "opacity": 1.0,
            "offsetY": 50
        }
    ],
    {
        "in": "fade_in",
        "inDuration": 400,
        "out": "fade_out",
        "outDuration": 250
    },
    "用于需要强调但不想太花哨的场合。白色文字+下划线，简洁有力。适合B-roll画面中的重点标注。",
    ["重点", "下划线", "白色", "简洁", "强调", "淡入"]
))

# ============================================================================
# 5. 划重点黄色式
# ============================================================================
templates.append(make_template(
    "textstyle_keypoint_yellow",
    "划重点黄色式",
    "keypoint",
    "黄色圆角底板+黑色粗体字+弹入，类似'划重点'标签",
    {
        "fontName": FONT_BOLD,
        "fontSize": 64,
        "primaryColor": BLACK,
        "outlineColor": "&H00000000",
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 0,
        "shadow": 0,
        "alignment": 5,
        "marginL": 100,
        "marginR": 100,
        "marginV": 450
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_text_attention_yellow",
            "position": "behind_text",
            "scale": 1.5,
            "opacity": 1.0
        }
    ],
    {
        "in": "pop_in",
        "inDuration": 300,
        "out": "fade_out",
        "outDuration": 200,
        "popScale": [0, 1.15, 1.0]
    },
    "用于'划重点'、'注意'、'知识点'等标注。黄色底板+黑字，像便签纸一样醒目。",
    ["划重点", "黄色", "标签", "注意", "知识点", "弹入"]
))

# ============================================================================
# 6. 划重点红色式
# ============================================================================
templates.append(make_template(
    "textstyle_keypoint_red",
    "划重点红色式",
    "keypoint",
    "红色圆角底板+白色粗体字+弹入，用于警告/避坑/重要提醒",
    {
        "fontName": FONT_BOLD,
        "fontSize": 64,
        "primaryColor": WHITE,
        "outlineColor": "&H00000000",
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 0,
        "shadow": 0,
        "alignment": 5,
        "marginL": 100,
        "marginR": 100,
        "marginV": 450
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_text_keypoint_red",
            "position": "behind_text",
            "scale": 1.5,
            "opacity": 1.0
        }
    ],
    {
        "in": "shake_in",
        "inDuration": 400,
        "out": "fade_out",
        "outDuration": 200,
        "shakeAmplitude": 8
    },
    "用于警告、避坑、重要提醒、错误示范等。红色底板+白字，有警示感。",
    ["划重点", "红色", "警告", "避坑", "重要提醒", "抖动"]
))

# ============================================================================
# 7. 数据大字式
# ============================================================================
templates.append(make_template(
    "textstyle_data_big",
    "数据大字式",
    "data",
    "超大黄色数字+白色小单位+淡入，用于突出关键数据",
    {
        "fontName": FONT_BOLD,
        "fontSize": 140,
        "primaryColor": YELLOW,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 7,
        "shadow": 3,
        "alignment": 5,
        "marginL": 60,
        "marginR": 60,
        "marginV": 450
    },
    [
        {
            "type": "text",
            "content": "{unit}",
            "fontSize": 48,
            "color": WHITE,
            "position": "below_number",
            "offsetY": 20
        }
    ],
    {
        "in": "fade_in_scale",
        "inDuration": 600,
        "out": "fade_out",
        "outDuration": 300,
        "startScale": 0.8
    },
    "用于关键数据展示，如'20年'、'10万+'、'99%'等。超大数字+小单位，视觉冲击力强。",
    ["数据", "大字", "数字", "黄色", "统计", "淡入"]
))

# ============================================================================
# 8. 数据带单位式
# ============================================================================
templates.append(make_template(
    "textstyle_data_with_unit",
    "数据带单位式",
    "data",
    "白色数字+黄色单位+图标，用于带单位的数据展示",
    {
        "fontName": FONT_BOLD,
        "fontSize": 100,
        "primaryColor": WHITE,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 5,
        "shadow": 2,
        "alignment": 5,
        "marginL": 80,
        "marginR": 80,
        "marginV": 480
    },
    [
        {
            "type": "sticker",
            "assetId": "sticker_icon_factory_blue",
            "position": "left_of_text",
            "scale": 0.5,
            "opacity": 1.0,
            "offsetX": -120
        }
    ],
    {
        "in": "slide_up",
        "inDuration": 500,
        "out": "fade_out",
        "outDuration": 250
    },
    "用于带图标和单位的数据展示，如'自有工厂'+'工厂图标'，'ISO认证'+'证书图标'等。",
    ["数据", "图标", "单位", "白色", "展示", "滑入"]
))

# ============================================================================
# 9. 震惊警告式
# ============================================================================
templates.append(make_template(
    "textstyle_shock_warning",
    "震惊警告式",
    "emotion",
    "红色底板+白色粗体字+抖动入场，用于震惊/警告/没想到",
    {
        "fontName": FONT_BOLD,
        "fontSize": 80,
        "primaryColor": WHITE,
        "outlineColor": BLACK,
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 5,
        "shadow": 3,
        "alignment": 5,
        "marginL": 80,
        "marginR": 80,
        "marginV": 450
    },
    [
        {
            "type": "graphic",
            "shape": "rounded_rect",
            "position": "behind_text",
            "backgroundColor": "#EF4444",
            "opacity": 0.85,
            "paddingX": 50,
            "paddingY": 25,
            "cornerRadius": 12
        },
        {
            "type": "sticker",
            "assetId": "sticker_emoji_surprise",
            "position": "right_of_text",
            "scale": 0.4,
            "opacity": 1.0,
            "offsetX": 100
        }
    ],
    {
        "in": "shake_in",
        "inDuration": 500,
        "out": "fade_out",
        "outDuration": 250,
        "shakeAmplitude": 10
    },
    "用于'没想到'、'震惊'、'警告'、'避坑'等情绪强烈的场景。红色+抖动+惊讶表情，有冲击力。",
    ["震惊", "警告", "红色", "抖动", "情绪", "避坑"]
))

# ============================================================================
# 10. 结尾引导式
# ============================================================================
templates.append(make_template(
    "textstyle_ending_follow",
    "结尾引导式",
    "ending",
    "蓝色半透明底板+白色字+从右滑入，用于结尾关注/联系/合作引导",
    {
        "fontName": FONT_BOLD,
        "fontSize": 68,
        "primaryColor": WHITE,
        "outlineColor": "&H00000000",
        "backColor": "&H00000000",
        "bold": True,
        "borderStyle": 1,
        "outline": 0,
        "shadow": 0,
        "alignment": 5,
        "marginL": 80,
        "marginR": 80,
        "marginV": 600
    },
    [
        {
            "type": "graphic",
            "shape": "rounded_rect",
            "position": "behind_text",
            "backgroundColor": "#3B82F6",
            "opacity": 0.8,
            "paddingX": 45,
            "paddingY": 22,
            "cornerRadius": 30
        }
    ],
    {
        "in": "slide_right",
        "inDuration": 500,
        "out": "fade_out",
        "outDuration": 400
    },
    "用于视频结尾的引导信息，如'关注我了解更多'、'私信咨询合作'、'评论区告诉我'等。蓝色底板+白字，专业可信。",
    ["结尾", "引导", "蓝色", "关注", "合作", "滑入"]
))

# ============================================================================
# 保存所有模板
# ============================================================================
category_dirs = {
    "opening": "01_开场标题",
    "emphasis": "02_重点强调",
    "keypoint": "03_划重点",
    "data": "04_数据突出",
    "emotion": "05_情绪表达",
    "ending": "06_结尾引导"
}

for t in templates:
    cat_dir = category_dirs.get(t["category"], "misc")
    dir_path = os.path.join(BASE, cat_dir)
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, f"{t['id']}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(t, f, ensure_ascii=False, indent=2)
    print(f"OK: {cat_dir}/{t['id']}.json")

# 生成 index.json
index = {
    "library": "zhiheng-text-styles",
    "name": "知衡智企「智剪」花字模板库",
    "version": "1.0.0",
    "createdAt": "2026-08-30",
    "source": "自制（基于企业短视频包装设计）",
    "license": "自有版权，可自由商用",
    "totalAssets": len(templates),
    "status": "provisional",
    "categories": {
        "opening": {"name": "开场标题", "dir": "01_开场标题", "count": 2},
        "emphasis": {"name": "重点强调", "dir": "02_重点强调", "count": 2},
        "keypoint": {"name": "划重点", "dir": "03_划重点", "count": 2},
        "data": {"name": "数据突出", "dir": "04_数据突出", "count": 2},
        "emotion": {"name": "情绪表达", "dir": "05_情绪表达", "count": 1},
        "ending": {"name": "结尾引导", "dir": "06_结尾引导", "count": 1}
    },
    "assets": [{"id": t["id"], "name": t["name"], "category": t["category"],
                 "file": f"{category_dirs[t['category']]}/{t['id']}.json",
                 "tags": t["tags"], "status": t["status"]} for t in templates],
    "animationTypes": ["fade_in", "pop_in", "shake_in", "slide_up", "slide_right", "fade_in_scale"],
    "rendererIntegration": {
        "timelineField": "titleTrack (styleId)",
        "resolver": "TextStyleResolver",
        "generator": "ASSGenerator + OverlayCompositor"
    }
}

with open(os.path.join(BASE, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=2)
print(f"\nOK: index.json ({len(templates)} 个模板)")
