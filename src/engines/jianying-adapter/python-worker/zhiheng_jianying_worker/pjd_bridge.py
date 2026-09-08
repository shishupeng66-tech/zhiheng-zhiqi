# -*- coding: utf-8 -*-
"""PJD 桥接层 —— 把 UnifiedTimelineV2 转成 PJD 剪映草稿。

参考已验证用法：D:\\剪映智剪测试\\scripts\\real_edit_02_create.py
- DraftFolder.create_draft / append_tracks / add_segment / import_srt
- VideoSegment(source, target, source_timerange, volume, clip_settings) + add_transition
- TextSegment + add_effect(花字 resourceId) + add_animation(TextIntro)
- AudioSegment + add_fade
- 素材真实时长用 pyJianYingDraft.local_materials.VideoMaterial

约定：
- timeline 素材 assetId = 相对 assetRoot 的路径（/ 分隔），由 path_safety.resolve_asset_path 解析
- styleId → 剪映 resourceId 由生产 ResourceMap（resources/resource-map.v0.json）解析
- 生成到 staging 草稿根下，由 worker 核验后原子发布
"""

import json
import os
import uuid

from .errors import WorkerError
from .contract import load_production_resource_map
from .path_safety import resolve_asset_path


# ---------------------------------------------------------------------------
# 独立文本覆盖轨（Text Overlay）—— MANUAL_TEMPLATE_REFERENCE
#
# 结构克隆自用户手工真值草稿（ZHIHENG-GOLDEN-EMPHASIS-STACKED-20260904-162931，解密后精确提取）：
# - 一个信息词 = 一个独立文本对象 = 一条独立 text 轨（不同轨之间允许时间重叠）；
# - 新花字：国庆黄红立体字效 effect_id=7546423084874599705（替代 huazi.blue_outline，光晕过重）；
# - 入场动画：向上弹入 7123116334677758501（0.5s）；出场动画：烟雾消散 7678658611601493258（0.5s）；
# - 文本样式：文轩体(7290445778273702455)、字号 26、加粗、金色渐变填充 + effectStyle。
# ---------------------------------------------------------------------------

_OVERLAY_EFFECT = {
    "effect_id": "7546423084874599705",
    "resource_id": "7546423084874599705",
    "name": "国庆黄红立体字效",
    "cache_path": "C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/artistEffect/7546423084874599705/922f89ae7ba42340cb81fe8332875bc3",
}
_OVERLAY_ANIM_IN = {
    "id": "7123116334677758501",
    "name": "向上弹入",
    "category_id": "ruchang",
    "category_name": "入场",
    "cache_path": "C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/effect/7123116334677758501/28d9145ead32c23742082a37e511370e",
}
_OVERLAY_ANIM_OUT = {
    "id": "7678658611601493258",
    "name": "烟雾消散",
    "category_id": "chuchang",
    "category_name": "出场",
    "cache_path": "C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/effect/7678658611601493258/8421b2d31bae4a9474005608cdb05996",
}
_OVERLAY_FONT_ID = "7290445778273702455"
_OVERLAY_FONT_PATH = "C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/effect/25998976/d5ea95d6a862335c917a93b4fc741c89/文轩体.otf"
# 金色渐变填充（克隆自用户手工真值）
_OVERLAY_GRADIENT = {
    "angle": 39,
    "color": [
        [1, 0.92549020051956177, 0.57647061347961426],
        [1, 0.92156863212585449, 0.560784339904785],
        [1, 0.972549021244049, 0.82352942228317261],
    ],
    "alpha": [1, 1, 1],
    "percent": [0.14380531013011932, 0.89601767063140869, 0.47787609696388245],
    "mode": "character",
}


def _inject_text_overlays(draft_dir, timeline):
    """在 PJD 明文草稿中后处理注入独立文本覆盖轨（textOverlayTrack）。

    每个 item = 一条独立 text 轨 + 独立 text material / text_effect material /
    material_animation（in 向上弹入 + out 烟雾消散）。结构克隆自用户手工真值。
    返回 track_summary 增量（[{type:'text_overlay', text, count}]）。
    """
    overlays = timeline.get("textOverlayTrack") or []
    if not overlays:
        return []

    content_path = os.path.join(draft_dir, "draft_content.json")
    with open(content_path, encoding="utf-8") as f:
        content = json.load(f)

    tracks = content.setdefault("tracks", [])
    materials = content.setdefault("materials", {})
    texts = materials.setdefault("texts", [])
    effects = materials.setdefault("effects", [])
    animations = materials.setdefault("material_animations", [])

    def _uuid32():
        return uuid.uuid4().hex

    def _uuid_upper():
        return str(uuid.uuid4()).upper()

    summary = []
    track_render_index = len(tracks)

    # 第一遍：为每个 overlay 生成 text material / effect material / animation material / segment 数据，
    # 并按 laneIndex 归组（同一 lane 内多个非重叠 segment 写入同一条 text 轨 —— 固定轨道池复用）。
    lane_segments = {}  # laneIndex -> [segment_dict, ...]
    for idx, item in enumerate(overlays):
        text = item["text"]
        start_us = int(round(float(item["start"]) * 1e6))
        end_us = int(round(float(item["end"]) * 1e6))
        dur_us = max(100_000, end_us - start_us)
        pos_y = float(item.get("positionY", 0.0))
        pos_x = float(item.get("positionX", 0.0))
        anim_dur = int(item.get("animationDurationUs") or 500_000)
        lane = int(item.get("laneIndex", 0))
        # 花字/文字模板：使用 overlay 携带的 effectResourceId（Resource Director 选择），默认 7546423084874599705
        effect_resource_id = str(item.get("effectResourceId") or _OVERLAY_EFFECT["resource_id"])
        effect_cache_path = _OVERLAY_EFFECT["cache_path"]
        if effect_resource_id != _OVERLAY_EFFECT["resource_id"]:
            # 其他资源（如用户新增文字模板）：剪映缓存路径按资源 id 探测，取不到则保留默认缓存路径（best-effort）
            effect_cache_path = "C:/Users/Administrator/AppData/Local/JianyingPro/User Data/Cache/artistEffect/%s/1" % effect_resource_id

        # 1) 文本 material（金色渐变 + effectStyle，克隆手工结构；effectStyle.id 随资源变化）
        text_material_id = _uuid32()
        style_inner = {
            "fill": {
                "content": {
                    "render_type": "gradient",
                    "gradient": dict(_OVERLAY_GRADIENT),
                }
            },
            "font": {"path": _OVERLAY_FONT_PATH, "id": _OVERLAY_FONT_ID},
            "size": 26,
            "bold": True,
            "effectStyle": {
                "path": effect_cache_path,
                "id": effect_resource_id,
            },
            "range": [0, len(text)],
        }
        content_json = {"text": text, "styles": [style_inner]}
        texts.append(
            {
                "id": text_material_id,
                "type": "text",
                "content": json.dumps(content_json, ensure_ascii=False),
                "words": {},
                "current_words": {},
                "combo_info": {},
                "caption_template_info": {"resource_id": "", "path": ""},
                "line_spacing": 0.02,
                "shadow_point": {"x": 0.0, "y": 0.0},
                "border_color": "#000000",
                "font_path": "D:/JianyingPro/11.3.0.14362/Resources/Font/SystemFont/zh-hans.ttf",
                "alignment": 0,
                "lyrics_template": {"resource_id": "", "path": ""},
            }
        )

        # 2) text_effect material（effect_id/resource_id 随 overlay 资源变化）
        effect_material_id = _uuid_upper()
        effects.append(
            {
                "id": effect_material_id,
                "effect_id": effect_resource_id,
                "resource_id": effect_resource_id,
                "third_resource_id": "0",
                "name": "视觉资源-" + effect_resource_id,
                "type": "text_effect",
                "sub_type": "none",
                "path": effect_cache_path,
                "value": 1.0,
                "category_id": "panel-text-flower_fav",
                "category_name": "收藏",
                "source_platform": 1,
                "request_id": "2026090416592393AE3735DEF5EBA30CB9",
                "color_match_info": {},
                "multi_language_current": "",
                "beauty_face_auto_retouch_info": {},
            }
        )

        # 3) material_animation（in 向上弹入 + out 烟雾消散）
        anim_material_id = _uuid_upper()
        animations.append(
            {
                "id": anim_material_id,
                "type": "sticker_animation",
                "animations": [
                    {
                        "id": _OVERLAY_ANIM_IN["id"],
                        "type": "in",
                        "duration": anim_dur,
                        "path": _OVERLAY_ANIM_IN["cache_path"],
                        "resource_id": _OVERLAY_ANIM_IN["id"],
                        "third_resource_id": _OVERLAY_ANIM_IN["id"],
                        "source_platform": 1,
                        "name": _OVERLAY_ANIM_IN["name"],
                        "category_id": _OVERLAY_ANIM_IN["category_id"],
                        "category_name": _OVERLAY_ANIM_IN["category_name"],
                        "material_type": "sticker",
                        "request_id": "2026090410184740F30E339AC48FB1D8F9",
                    },
                    {
                        "id": _OVERLAY_ANIM_OUT["id"],
                        "type": "out",
                        "duration": anim_dur,
                        "path": _OVERLAY_ANIM_OUT["cache_path"],
                        "resource_id": _OVERLAY_ANIM_OUT["id"],
                        "third_resource_id": "0",
                        "source_platform": 1,
                        "name": _OVERLAY_ANIM_OUT["name"],
                        "category_id": _OVERLAY_ANIM_OUT["category_id"],
                        "category_name": _OVERLAY_ANIM_OUT["category_name"],
                        "material_type": "sticker",
                        "request_id": "2026090410184740F30E339AC48FB1D8F9",
                    },
                ],
            }
        )

        # 4) segment（克隆手工结构；归属 lane，稍后统一写轨）
        segment_id = _uuid32()
        segment = {
            "id": segment_id,
            "target_timerange": {"start": start_us, "duration": dur_us},
            "render_timerange": {},
            "clip": {
                "scale": {"x": 1.0, "y": 1.0},
                "transform": {"x": pos_x, "y": pos_y},
                "flip": {},
            },
            "uniform_scale": {},
            "material_id": text_material_id,
            "extra_material_refs": [anim_material_id, effect_material_id, effect_material_id],
            "render_index": 2,
            "enable_lut": False,
            "enable_adjust": False,
            "enable_hsl": False,
            "track_render_index": track_render_index + lane,
            "responsive_layout": {},
            "enable_adjust_mask": False,
            "source": "segmentsourcenormal",
        }
        lane_segments.setdefault(lane, []).append(segment)
        summary.append({"type": "text_overlay", "text": text, "count": 1})

    # 第二遍：固定轨道池 —— 每条 lane 创建一条 text 轨，写入该 lane 的所有（非重叠）segment。
    for lane in sorted(lane_segments.keys()):
        segs = lane_segments[lane]
        # 同 lane 内按 start 排序（确保时间有序、不重叠）
        segs.sort(key=lambda s: s["target_timerange"]["start"])
        tracks.append(
            {
                "id": _uuid_upper(),
                "type": "text",
                "segments": segs,
                "name": "caption",
                "is_default_name": True,
            }
        )

    with open(content_path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)
    return summary


def _default_user_data_path():
    """计算剪映 User Data 路径（供 fork 私有草稿注册用）。

    高版本 fork 的 DraftFolder 提供 user_data_path 后，save() 会把草稿注册到
    剪映 root_meta_info.json（草稿库索引）。这是旧版 0.3.0 缺失、且剪映 11.3
    首次打开所必需的步骤（已 GUI 验证）。
    """
    la = os.environ.get("LOCALAPPDATA")
    if not la:
        return None
    return os.path.join(la, "JianyingPro", "User Data")


def repair_registration_paths(draft_name, staging_root, output_draft_dir, user_data_path=None):
    """发布后校正草稿注册路径（staging → output）。

    高版本 fork 在 save() 时把 root_meta_info.json 与 draft_meta_info.json 中的
    draft_fold_path / draft_root_path 写成 staging 路径；Worker 原子发布（rename）
    后路径已变化，必须同步校正，否则剪映按注册路径找不到草稿。

    返回 (warnings, ok)。校正失败不视为发布失败（草稿本身完好），但必须记 warning。
    """
    if not user_data_path:
        user_data_path = _default_user_data_path()
    if not user_data_path:
        return [], True  # 无 User Data，跳过（不视为失败）
    warnings = []
    ok = True
    norm = lambda p: os.path.normcase(os.path.normpath(str(p).replace("/", os.sep).replace("\\", os.sep)))
    old_draft_path = norm(os.path.join(staging_root, draft_name))
    old_root = norm(staging_root)
    new_root = os.path.dirname(os.path.abspath(output_draft_dir))

    # 1) 校正 root_meta_info.json（剪映草稿库索引）
    rm_path = os.path.join(user_data_path, "Projects", "com.lveditor.draft", "root_meta_info.json")
    if os.path.exists(rm_path):
        try:
            with open(rm_path, encoding="utf-8") as f:
                payload = json.load(f)
            changed = False
            for e in payload.get("all_draft_store", []):
                fp = e.get("draft_fold_path")
                rp = e.get("draft_root_path")
                if fp and norm(fp) == old_draft_path:
                    e["draft_fold_path"] = output_draft_dir
                    changed = True
                if rp and norm(rp) == old_root:
                    e["draft_root_path"] = new_root
                    changed = True
            if changed:
                tmp = rm_path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False)
                os.replace(tmp, rm_path)
        except Exception as exc:  # noqa: BLE001
            warnings.append("root_meta_info 路径校正失败: %s" % exc)
            ok = False

    # 2) 校正草稿目录内 draft_meta_info.json
    meta_path = os.path.join(output_draft_dir, "draft_meta_info.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            meta["draft_fold_path"] = output_draft_dir
            meta["draft_root_path"] = new_root
            tmp = meta_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
            os.replace(tmp, meta_path)
        except Exception as exc:  # noqa: BLE001
            warnings.append("draft_meta_info 路径校正失败: %s" % exc)
            ok = False

    return warnings, ok

# ============================================================================
# ResourceMap 读取
# ============================================================================


def load_resource_map():
    """读取生产 ResourceMap（resources/resource-map.v0.json），返回 {styleId: entry}。

    生产代码只读取正式资源文件，不依赖 __fixtures__。
    """
    data = load_production_resource_map()
    entries = data.get("entries", [])
    return {e["styleId"]: e for e in entries}


def resolve_resource_id(style_id, resource_map):
    """styleId → 剪映 resourceId。支持预先配置的 fallback（仅一层）。

    必需资源缺失且无 fallback → RESOURCE_MISSING。
    可选资源缺失 → 返回 None（调用方跳过并置 warning）。
    """
    entry = resource_map.get(style_id)
    if not entry:
        raise WorkerError(
            "RESOURCE_MISSING",
            "ResourceMap 中不存在 styleId: %s" % style_id,
        )
    if entry.get("resourceId"):
        return entry["resourceId"], False
    if entry.get("copyrightStatus") == "code_defined":
        return None, False
    # 尝试 fallback
    fb_id = entry.get("fallbackStyleId")
    if fb_id:
        fb = resource_map.get(fb_id)
        if fb and fb.get("resourceId"):
            return fb["resourceId"], True
    if entry.get("required", True):
        raise WorkerError(
            "RESOURCE_MISSING",
            "必需资源 styleId=%s 不可用且无 fallback" % style_id,
        )
    return None, True  # 可选资源缺失 → 跳过


# ============================================================================
# PJD 转换
# ============================================================================


def _import_pjd():
    """导入 pyJianYingDraft（PYTHONPATH 已含 PJD 根）。失败抛 PJD_ERROR。

    高版本 fork 接入：正式入口 __main__.py 已移除旧版 editable finder；
    此处再兜底一次（pytest/直接调用 import 时同样生效），确保加载
    ZHIHENG_PJD_ROOT 指向的 fork，而不是 site-packages 的旧版 0.3.0。
    """
    import sys

    sys.meta_path = [
        f for f in sys.meta_path
        if "__editable___pyjianyingdraft" not in (type(f).__module__ or "")
    ]
    try:
        import pyJianYingDraft as draft  # noqa
        return draft
    except Exception as exc:  # noqa: BLE001
        raise WorkerError("PJD_ERROR", "无法导入 pyJianYingDraft: %s" % exc)


def _real_duration(draft, path):
    from pyJianYingDraft.local_materials import VideoMaterial

    return VideoMaterial(path).duration / 1_000_000.0


def _transition_to_pjd(draft, transition):
    """hard_cut → None（不添加）；dissolve → TransitionType.叠化。"""
    if transition == "hard_cut":
        return None
    if transition == "dissolve":
        from pyJianYingDraft.metadata.transition_meta import TransitionType

        return TransitionType.叠化
    raise WorkerError("UNSUPPORTED_CAPABILITY", "不支持的转场: %s" % transition)


def _animation_to_pjd(draft, animation_id):
    """文字动画标识 → TextIntro 枚举。默认 打字机_I。"""
    from pyJianYingDraft.metadata.text_intro import TextIntro

    mapping = {
        "typewriter_i": TextIntro.打字机_I,
        "fade_in": TextIntro.渐显,
        "bounce_in": TextIntro.弹入,
    }
    if not animation_id:
        return None, None
    if animation_id not in mapping:
        # 未知动画标识：不添加动画（保守），避免枚举不存在导致崩溃
        return None, None
    duration = "0.8s" if animation_id == "typewriter_i" else "0.5s"
    return mapping[animation_id], duration


def _keyword_anchor_transform_y(anchor):
    """keyword anchor（枚举）→ PJD transform_y（-1..1，向上为正）。

    映射（保守，需 Phase D 剪映 GUI 回归确认）：
      top_*    → 0.6（偏上）
      center_* → 0.1（居中略上）
      bottom_* → -0.6（偏下）
      无 anchor → 0.1
    """
    if not anchor:
        return 0.1
    if isinstance(anchor, str):
        if anchor.startswith("top_"):
            return 0.6
        if anchor.startswith("bottom_"):
            return -0.6
        return 0.1
    return 0.1


def build_draft(job, staging_root):
    """在 staging 草稿根下生成剪映草稿。

    返回:
      { "draftDir": str, "duration": float, "tracks": [{type,count}], "warnings": [] }
    """
    draft = _import_pjd()
    resource_map = load_resource_map()

    timeline = job["timeline"]
    asset_root = job["assetRoot"]
    draft_name = job["draft"]["name"]
    width = int(job["draft"]["width"])
    height = int(job["draft"]["height"])
    fps = float(job["draft"]["fps"])

    from pyJianYingDraft.text_segment import TextStyle, TextBorder
    from pyJianYingDraft.metadata.font_meta import FontType
    from pyJianYingDraft.time_util import trange

    # ---------------- 创建草稿 ----------------
    # 高版本 fork：传入 user_data_path 启用私有草稿注册（root_meta_info.json）
    user_data_path = _default_user_data_path()
    folder = draft.DraftFolder(staging_root, user_data_path=user_data_path)
    script = folder.create_draft(draft_name, width, height, fps=fps, allow_replace=False)

    # ---------------- 轨道 ----------------
    tracks = []
    if timeline.get("voiceTrack"):
        tracks.append(draft.TrackSpec(draft.TrackType.audio, "voice"))
    if timeline.get("bgmTrack"):
        tracks.append(draft.TrackSpec(draft.TrackType.audio, "bgm"))
    if timeline.get("sfxTrack"):
        tracks.append(draft.TrackSpec(draft.TrackType.audio, "sfx"))
    tracks.append(draft.TrackSpec(draft.TrackType.video, "main"))
    # caption 轨仅用于 keywordTrack / titleTrack；二者皆空时不建空轨
    # （subtitle 轨由 import_srt 自行创建；textOverlayTrack 走独立文本轨后处理注入）。
    has_caption = bool(timeline.get("keywordTrack") or timeline.get("titleTrack"))
    if has_caption:
        tracks.append(draft.TrackSpec(draft.TrackType.text, "caption"))
    script.append_tracks(tracks)

    warnings = []
    track_summary = []

    # ---------------- 视频轨（原声按 sourceAudioMuted 静音） ----------------
    cursor = 0.0
    for i, seg in enumerate(timeline["videoTrack"]):
        rel = seg["assetRef"]["assetId"]
        full = resolve_asset_path(asset_root, rel, "videoTrack[%d]" % i)
        mlen = _real_duration(draft, full)
        s0 = min(float(seg["sourceStart"]), mlen)
        sd = min(float(seg["duration"]), mlen - s0)
        dur = float(seg["duration"])
        muted = bool(seg.get("sourceAudioMuted", True))
        vseg = draft.VideoSegment(
            full,
            trange("%ss" % round(cursor, 3), "%ss" % round(dur, 3)),
            source_timerange=trange("%ss" % round(s0, 3), "%ss" % round(sd, 3)),
            volume=0.0 if muted else 1.0,
        )
        trans = _transition_to_pjd(draft, seg.get("transition", "hard_cut"))
        if trans is not None:
            vseg.add_transition(trans, duration="0.4s")
        script.add_segment(vseg, "main")
        cursor += dur
    track_summary.append({"type": "video", "count": len(timeline["videoTrack"])})

    # ---------------- 配音 ----------------
    for i, seg in enumerate(timeline.get("voiceTrack", [])):
        rel = seg["assetRef"]["assetId"]
        full = resolve_asset_path(asset_root, rel, "voiceTrack[%d]" % i)
        start = float(seg["start"])
        dur = float(seg["duration"])
        vseg = draft.AudioSegment(full, trange("%ss" % round(start, 3), "%ss" % round(dur, 3)), volume=1.0)
        script.add_segment(vseg, "voice")
    if timeline.get("voiceTrack"):
        track_summary.append({"type": "voice", "count": len(timeline["voiceTrack"])})

    # ---------------- BGM ----------------
    for i, seg in enumerate(timeline.get("bgmTrack", [])):
        rel = seg["assetRef"]["assetId"]
        full = resolve_asset_path(asset_root, rel, "bgmTrack[%d]" % i)
        start = float(seg["start"])
        dur = float(seg["duration"])
        bseg = draft.AudioSegment(full, trange("%ss" % round(start, 3), "%ss" % round(dur, 3)), volume=0.2)
        bseg.add_fade("1.5s", "3s")
        script.add_segment(bseg, "bgm")
    if timeline.get("bgmTrack"):
        track_summary.append({"type": "bgm", "count": len(timeline["bgmTrack"])})

    # ---------------- SFX ----------------
    for i, seg in enumerate(timeline.get("sfxTrack", [])):
        rel = seg["assetRef"]["assetId"]
        full = resolve_asset_path(asset_root, rel, "sfxTrack[%d]" % i)
        start = float(seg["start"])
        dur = float(seg["duration"])
        sseg = draft.AudioSegment(full, trange("%ss" % round(start, 3), "%ss" % round(dur, 3)), volume=0.5)
        script.add_segment(sseg, "sfx")
    if timeline.get("sfxTrack"):
        track_summary.append({"type": "sfx", "count": len(timeline["sfxTrack"])})

    # ---------------- 字幕（短字幕 → srt → import_srt） ----------------
    sub_segs = timeline.get("subtitleTrack", [])
    if sub_segs:
        # srt 为临时输入文件，放 staging 顶层（不在草稿目录内），发布后由 worker 清理
        srt_path = os.path.join(staging_root, "subtitle_tmp.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            for idx, s in enumerate(sub_segs, start=1):
                start = float(s["start"])
                end = start + float(s["duration"])
                text = s["text"].replace("\n", " ").strip()
                f.write(
                    "%d\n%s --> %s\n%s\n\n"
                    % (
                        idx,
                        _format_srt_time(start),
                        _format_srt_time(end),
                        text,
                    )
                )
        sub_ref = draft.TextSegment(
            "字幕样式",
            trange("0s", "1s"),
            font=FontType.SourceHanSansCN_Bold,
            style=TextStyle(size=10.0, bold=True, color=(1.0, 1.0, 1.0)),
            border=TextBorder(color=(0.0, 0.0, 0.0), width=40),
        )
        script.import_srt(
            srt_path,
            track_name="subtitle",
            style_reference=sub_ref,
            clip_settings=draft.ClipSettings(transform_y=-0.8),
        )
        track_summary.append({"type": "subtitle", "count": len(sub_segs)})

    # ---------------- 关键词花字（keywordTrack） ----------------
    # fork 的 TextSegment.add_effect 只接受 TextEffectType 枚举；
    # 因此按 resourceId 映射到 fork 已验证的花字枚举成员（ResourceMap 的 huazi resourceId 已同步为 fork 值）。
    from pyJianYingDraft.metadata.text_effect import TextEffectType

    _text_effects = {str(e.value.resource_id): e for e in TextEffectType}
    kw_segs = timeline.get("keywordTrack", [])
    for i, seg in enumerate(kw_segs):
        start = float(seg["start"])
        dur = float(seg["duration"])
        style_id = seg["styleId"]
        resource_id, used_fallback = resolve_resource_id(style_id, resource_map)
        if resource_id is None:
            warnings.append("keywordTrack[%d] styleId=%s 资源缺失已跳过" % (i, style_id))
            continue
        if used_fallback:
            warnings.append("keywordTrack[%d] styleId=%s 使用 fallback（需人工复核）" % (i, style_id))
        te = _text_effects.get(str(resource_id))
        if te is None:
            warnings.append("keywordTrack[%d] resourceId=%s 不是 fork 已验证花字，跳过（需人工复核）" % (i, resource_id))
            continue
        transform_y = _keyword_anchor_transform_y(seg.get("anchor"))
        hs = draft.TextSegment(
            seg["keyword"],
            trange("%ss" % round(start, 3), "%ss" % round(dur, 3)),
            font=FontType.文轩体,
            style=TextStyle(size=26.0, color=(1.0, 1.0, 1.0), bold=True),
            clip_settings=draft.ClipSettings(transform_y=transform_y),
        )
        hs.add_effect(te)
        anim, anim_dur = _animation_to_pjd(draft, seg.get("animationId"))
        if anim is not None:
            hs.add_animation(anim, duration=anim_dur)
        script.add_segment(hs, "caption")
    if kw_segs:
        track_summary.append({"type": "keyword", "count": len(kw_segs)})

    # ---------------- 标题（titleTrack，纯文本，无花字） ----------------
    for i, seg in enumerate(timeline.get("titleTrack", [])):
        start = float(seg["start"])
        dur = float(seg["duration"])
        ts = draft.TextSegment(
            seg["text"],
            trange("%ss" % round(start, 3), "%ss" % round(dur, 3)),
            font=FontType.SourceHanSansCN_Bold,
            style=TextStyle(size=20.0, color=(1.0, 1.0, 1.0), bold=True),
            border=TextBorder(color=(0.0, 0.0, 0.0), width=20),
        )
        script.add_segment(ts, "caption")
    if timeline.get("titleTrack"):
        track_summary.append({"type": "title", "count": len(timeline["titleTrack"])})

    # ---------------- 保存 ----------------
    script.save()
    # 独立文本覆盖轨（textOverlayTrack）：一个信息词 = 一条独立 text 轨。
    # PJD fork 不支持该结构（花字/动画受枚举约束、同轨 no-overlap），故在明文草稿上后处理注入，
    # 结构克隆自用户手工真值（MANUAL_TEMPLATE_REFERENCE），不改 fork / Worker 轨道主流程。
    overlay_summary = _inject_text_overlays(os.path.join(staging_root, draft_name), timeline)
    track_summary.extend(overlay_summary)
    # 包装贴图（stickerTrack）与包装音效（packagingSfx）—— 结构克隆自用户手工草稿。
    sticker_summary = _inject_stickers(os.path.join(staging_root, draft_name), timeline)
    track_summary.extend(sticker_summary)
    sfx_summary = _inject_packaging_sfx(os.path.join(staging_root, draft_name), timeline)
    track_summary.extend(sfx_summary)
    duration = script.duration / 1_000_000.0
    draft_dir = os.path.join(staging_root, draft_name)
    return {
        "draftDir": draft_dir,
        "duration": duration,
        "tracks": track_summary,
        "warnings": warnings,
    }


def _format_srt_time(seconds):
    """秒 → SRT 时间戳 HH:MM:SS,mmm"""
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return "%02d:%02d:%02d,%03d" % (h, m, s, ms)


def _inject_stickers(draft_dir, timeline):
    """后处理注入包装贴图轨（stickerTrack，来自 Visual Resource Registry）。

    结构克隆自用户手工草稿的 sticker track（track[11]）：sticker material（type=sticker + path）
    + sticker segment（clip scale/rotation/transform）。所有贴图放入一条 sticker 轨。
    返回 track_summary 增量。
    """
    stickers = timeline.get("stickerTrack") or []
    if not stickers:
        return []
    content_path = os.path.join(draft_dir, "draft_content.json")
    with open(content_path, encoding="utf-8") as f:
        content = json.load(f)
    tracks = content.setdefault("tracks", [])
    materials = content.setdefault("materials", {})
    sticker_mats = materials.setdefault("stickers", [])

    def _uuid32():
        return uuid.uuid4().hex

    def _uuid_upper():
        return str(uuid.uuid4()).upper()

    # 去重：按 path 判重
    existing_paths = {m.get("path") for m in sticker_mats}
    segments = []
    for item in stickers:
        path = item.get("path") or ""
        if not path:
            continue
        start_us = int(round(float(item["start"]) * 1e6))
        end_us = int(round(float(item["end"]) * 1e6))
        dur_us = max(100_000, end_us - start_us)
        pos_x = float(item.get("positionX", 0.0))
        pos_y = float(item.get("positionY", 0.0))
        scale = float(item.get("scale", 1.0))
        rotation = float(item.get("rotation", 0.0))
        # material：优先复用已有（按 path），否则新建
        mat = next((m for m in sticker_mats if m.get("path") == path), None)
        if mat is None:
            mat = {
                "id": item.get("materialId") or _uuid_upper(),
                "type": "sticker",
                "path": path,
            }
            sticker_mats.append(mat)
        segments.append(
            {
                "id": _uuid32(),
                "target_timerange": {"start": start_us, "duration": dur_us},
                "render_timerange": {},
                "clip": {
                    "scale": {"x": scale, "y": scale},
                    "rotation": rotation,
                    "transform": {"x": pos_x, "y": pos_y},
                    "flip": {},
                },
                "uniform_scale": {},
                "material_id": mat["id"],
                "extra_material_refs": [],
                "render_index": 4,
                "enable_lut": False,
                "enable_adjust": False,
                "enable_hsl": False,
                "track_render_index": len(tracks),
                "responsive_layout": {},
                "enable_adjust_mask": False,
                "source": "segmentsourcenormal",
            }
        )
    if not segments:
        return []
    tracks.append(
        {
            "id": _uuid_upper(),
            "type": "sticker",
            "segments": segments,
            "name": "sticker",
        }
    )
    with open(content_path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)
    return [{"type": "packaging_sticker", "count": len(segments)}]


def _inject_packaging_sfx(draft_dir, timeline):
    """后处理注入包装音效（packagingSfx，来自 Visual Resource Registry）。

    结构克隆自用户手工草稿的 audio 音效段：audio material（type=sound + path + duration）
    + audio segment（source_timerange + target_timerange）。所有包装音效放入一条 audio 轨。
    返回 track_summary 增量。
    """
    sfx = timeline.get("packagingSfx") or []
    if not sfx:
        return []
    content_path = os.path.join(draft_dir, "draft_content.json")
    with open(content_path, encoding="utf-8") as f:
        content = json.load(f)
    tracks = content.setdefault("tracks", [])
    materials = content.setdefault("materials", {})
    audios = materials.setdefault("audios", [])

    def _uuid32():
        return uuid.uuid4().hex

    def _uuid_upper():
        return str(uuid.uuid4()).upper()

    existing_paths = {a.get("path") for a in audios}
    segments = []
    for item in sfx:
        path = item.get("path") or ""
        if not path:
            continue
        start_us = int(round(float(item["start"]) * 1e6))
        dur_us = int(round(float(item["duration"]) * 1e6))
        if dur_us <= 0:
            continue
        volume = float(item.get("volume", 0.8))
        mat = next((a for a in audios if a.get("path") == path), None)
        if mat is None:
            mat = {
                "id": item.get("materialId") or _uuid_upper(),
                "type": "sound",
                "name": "包装音效",
                "duration": dur_us,
                "path": path,
                "category_name": "热门",
                "app_id": 1775,
                "source_platform": 1,
                "effect_id": item.get("sfxKey", ""),
                "resource_id": item.get("sfxKey", ""),
                "category_id": "10892",
            }
            audios.append(mat)
        segments.append(
            {
                "id": _uuid_upper(),
                "source_timerange": {"duration": dur_us},
                "target_timerange": {"start": start_us, "duration": dur_us},
                "render_timerange": {},
                "material_id": mat["id"],
                "extra_material_refs": [],
                "volume": volume,
                "source": "segmentsourcenormal",
            }
        )
    if not segments:
        return []
    tracks.append(
        {
            "id": _uuid_upper(),
            "type": "audio",
            "segments": segments,
            "name": "packaging_sfx",
        }
    )
    with open(content_path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False)
    return [{"type": "packaging_sfx", "count": len(segments)}]
