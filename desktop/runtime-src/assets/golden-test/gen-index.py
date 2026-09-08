# -*- coding: utf-8 -*-
"""生成黄金测试素材索引 video-assets-detailed.json（结构与真实索引一致）。"""
import hashlib
import json
import os

VID = r"D:\知衡智企\desktop\runtime-src\assets\golden-test\videos"
INDEX_PATH = r"D:\知衡智企\desktop\runtime-src\assets\golden-test\video-assets-detailed.json"

DEFS = [
    {
        "key": "01_aseptic_filling", "dur": 12.0,
        "content": "无菌灌装车间运转画面", "angle": "车间全景",
        "sem": ["无菌灌装生产线运作", "饮料灌装环节展示", "生产车间实拍", "高温灭菌与无菌灌装"],
        "tags": ["无菌灌装", "生产车间", "灌装线", "饮料生产", "工厂实拍"],
        "equipment": ["无菌灌装设备", "灌装线"],
        "actions": ["灌装"],
        "env": ["工厂车间", "生产环境"],
        "scene": "无菌灌装车间",
    },
    {
        "key": "02_bottling_line", "dur": 14.0,
        "content": "瓶装饮料生产线高速运转画面", "angle": "生产线侧景",
        "sem": ["自动化生产线运作", "瓶子输送环节", "高速瓶装生产", "饮料生产线实拍"],
        "tags": ["瓶装生产线", "自动化生产", "灌装", "饮料生产", "工厂实拍"],
        "equipment": ["输送带", "瓶装设备"],
        "actions": ["输送", "生产"],
        "env": ["工厂车间", "生产线"],
        "scene": "瓶装生产线",
    },
    {
        "key": "03_warehouse", "dur": 12.0,
        "content": "成品饮料仓储码放画面", "angle": "仓库全景",
        "sem": ["成品仓库存储场景", "仓储物流", "饮料成品码放", "仓库管理"],
        "tags": ["成品仓储", "仓库", "物流", "饮料成品", "仓储管理"],
        "equipment": ["货架", "叉车"],
        "actions": ["码放", "存储"],
        "env": ["仓库"],
        "scene": "成品仓库",
    },
    {
        "key": "04_quality_check", "dur": 10.0,
        "content": "质检人员检测饮料样品画面", "angle": "检测台近景",
        "sem": ["质检环节展示", "实验室检测", "质量把控", "抽样检测"],
        "tags": ["质量检测", "质检", "品控", "实验室", "食品安全"],
        "equipment": ["检测仪器"],
        "actions": ["检测", "化验"],
        "env": ["实验室", "质检区"],
        "scene": "质量检测",
    },
    {
        "key": "05_labeling_pack", "dur": 12.0,
        "content": "自动贴标与包装工序画面", "angle": "包装线侧景",
        "sem": ["自动贴标包装", "成品包装环节", "贴标机作业", "包装工序"],
        "tags": ["包装贴标", "自动包装", "贴标", "成品包装", "工厂实拍"],
        "equipment": ["贴标机", "包装机"],
        "actions": ["贴标", "包装"],
        "env": ["工厂车间", "包装线"],
        "scene": "包装贴标",
    },
    {
        "key": "06_raw_material", "dur": 10.0,
        "content": "饮料原料仓库存放画面", "angle": "原料区全景",
        "sem": ["原料存放管理", "原料仓库存放", "供应链原料", "原料管理"],
        "tags": ["原料仓库", "原料", "供应链", "仓储", "饮料生产"],
        "equipment": ["原料桶", "货架"],
        "actions": ["存放", "管理"],
        "env": ["仓库", "原料区"],
        "scene": "原料仓库",
    },
    {
        "key": "07_shipping", "dur": 12.0,
        "content": "成品饮料发货装车画面", "angle": "装车区全景",
        "sem": ["成品发货装车", "物流运输", "出货环节", "成品出库"],
        "tags": ["发货装车", "物流", "出货", "运输", "饮料成品"],
        "equipment": ["运输车", "叉车"],
        "actions": ["装车", "发货"],
        "env": ["装车区", "物流区"],
        "scene": "发货装车",
    },
    {
        "key": "08_rd_sampling", "dur": 14.0,
        "content": "研发实验室配方打样画面", "angle": "实验台近景",
        "sem": ["配方研发", "产品打样", "饮料配方开发", "研发实验室"],
        "tags": ["研发打样", "配方研发", "实验室", "产品开发", "饮料研发"],
        "equipment": ["实验器具", "样品瓶"],
        "actions": ["调配", "研发"],
        "env": ["研发实验室"],
        "scene": "研发打样",
    },
]

COMMON_TAGS = ["饮料", "饮品", "工厂", "生产", "食品饮料", "企业宣传", "B-roll素材"]
COMMON_SEM = ["饮料工厂生产场景", "食品饮料企业生产实力", "饮料代加工工厂"]
COMMON_SKILLS = ["企业宣传混剪", "综合实力展示"]


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


assets = []
for i, d in enumerate(DEFS):
    fname = d["key"] + ".mp4"
    fpath = os.path.join(VID, fname)
    fsize = os.path.getsize(fpath)
    fhash = sha256_file(fpath)
    dur = d["dur"]
    # 3 段
    seg_len = dur / 3
    segs = []
    cuts = []
    for s in range(3):
        st = round(s * seg_len, 2)
        en = round((s + 1) * seg_len, 2) if s < 2 else dur
        content = ("开头段：" if s == 0 else "中段%d：" % s if s == 1 else "收尾段：") + d["content"]
        role = ["Hook", "正文B-roll", "转场"] if s == 0 else ["正文B-roll", "转场"]
        sem = list(dict.fromkeys(COMMON_SEM + d["sem"]))
        tags = list(dict.fromkeys(COMMON_TAGS + d["tags"]))
        segs.append({
            "start": st, "end": en, "content": content, "action": d["actions"][0],
            "subjects": [], "shotType": "全景" if s != 2 else "中景",
            "cameraMovement": "基本固定", "cameraAngle": d["angle"],
            "visualQuality": "good", "stability": "good", "clarity": "good",
            "subjectCompleteness": "good", "usable": True, "usageRoles": role,
            "topicTags": tags, "semanticMatches": sem,
            "recommendedClipLength": {"min": round(1.2, 1), "max": round(min(3.5, seg_len - 0.2), 1)},
            "recommendedSkills": COMMON_SKILLS, "avoidUses": [],
            "subjectPosition": "center", "cropSafety": "good",
            "verticalCropSuitability": "good",
            "notes": "黄金测试合成素材（构建期生成）",
        })
        cuts.append({
            "start": st, "end": en, "reason": d["content"] + "，适合" + "、".join(role),
            "bestFor": sem, "usageRoles": role, "priority": "medium",
        })
    assets.append({
        "id": hashlib.md5(fname.encode("utf-8")).hexdigest()[:12],
        "fileName": fname,
        "relativePath": "videos/" + fname,
        "absolutePath": str(fpath),
        "sourceCategory": "黄金测试素材",
        "normalizedCategory": "总目录精选",
        "durationSeconds": dur,
        "width": 1920, "height": 1080, "orientation": "landscape", "fps": 25.0,
        "fileSize": fsize, "hash": fhash,
        "overallContent": d["content"], "overallCameraAngle": d["angle"],
        "overallScene": d["scene"], "people": [], "products": ["饮料"],
        "equipment": d["equipment"], "actions": d["actions"], "environment": d["env"],
        "sceneTags": list(dict.fromkeys(COMMON_TAGS + d["tags"])),
        "topicTags": list(dict.fromkeys(COMMON_TAGS + d["tags"])),
        "recommendedSkills": COMMON_SKILLS,
        "usageRoles": ["Hook", "正文B-roll", "转场"],
        "qualityLevel": "good", "preferred": False,
        "duplicateGroup": "dup-%02d" % (i + 1),
        "cropSafety": "good", "verticalCropSuitability": "good", "notes": "黄金测试合成素材",
        "timelineSegments": segs, "recommendedCuts": cuts, "avoidCuts": [],
        "semanticMatches": list(dict.fromkeys(COMMON_SEM + d["sem"])),
        "storyPotential": [{"topic": s, "contentType": "企业宣传混剪"} for s in list(dict.fromkeys(COMMON_SEM + d["sem"]))[:3]],
        "audit": {"sceneChangePoints": [], "indexDurationSeconds": dur, "durationDiffSeconds": 0.0},
    })

index = {
    "version": 1,
    "generatedAt": "2026-09-06T00:00:00.000Z",
    "assetsRoot": r"D:\知衡智企\desktop\runtime-src\assets\golden-test",
    "sourceIndex": "golden-test-synthetic",
    "count": len(assets),
    "assets": assets,
}
with open(INDEX_PATH, "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=2)
print("INDEX WRITTEN", len(assets), "assets ->", INDEX_PATH)
