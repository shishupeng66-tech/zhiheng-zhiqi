# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 2 — 母版结构逆向
从解密后的草稿提取: 轨道结构 / 文字槽位 / 视频槽位 / 素材路径。

用法:
    python step2_reverse.py <明文draft_content.json> <输出JSON>
"""
import sys, json

def get_text(t):
    c = t.get('content', '')
    if isinstance(c, dict):
        return c.get('text', '')
    if isinstance(c, str):
        try:
            p = json.loads(c)
            return p.get('text', '') if isinstance(p, dict) else str(p)
        except (json.JSONDecodeError, ValueError):
            return c
    return str(c) if c else ''

def reverse_master(content):
    mats = content.get('materials', {})
    text_templates = {tt['id']: tt for tt in mats.get('text_templates', [])}

    result = {
        'canvas': content.get('canvas_config', {}),
        'durationSec': content.get('duration', 0) / 1e6,
        'tracks': [],
        'textSlots': [],
        'mediaSlots': [],
        'audioCount': len(mats.get('audios', [])),
        'stickerCount': len(mats.get('stickers', [])),
        'effectCount': len(mats.get('effects', [])),
    }

    for ti, t in enumerate(content.get('tracks', [])):
        segs = t.get('segments', [])
        result['tracks'].append({'index': ti, 'type': t.get('type'), 'segmentCount': len(segs)})

    # 文字槽
    for ti, t in enumerate(content.get('tracks', [])):
        if t.get('type') != 'text':
            continue
        for s in t.get('segments', []):
            mat_id = s.get('material_id')
            tt = text_templates.get(mat_id)
            tr = s.get('target_timerange', {})
            text = None
            res_id = None
            if tt:
                res_id = tt.get('resource_id')
                for tir in tt.get('text_info_resources', []):
                    for tm in mats.get('texts', []):
                        if tm['id'] == tir.get('text_material_id'):
                            text = get_text(tm)
                            break
                    if text is not None:
                        break
            else:
                for tm in mats.get('texts', []):
                    if tm['id'] == mat_id:
                        text = get_text(tm)
                        break
            result['textSlots'].append({
                'segmentId': s.get('id'),
                'materialId': mat_id,
                'trackIndex': ti,
                'resourceType': 'TEXT_TEMPLATE' if tt else 'PLAIN',
                'resourceId': res_id,
                'text': text or '',
                'charCount': sum(1 for c in (text or '') if c.strip()),
                'startSec': tr.get('start', 0) / 1e6,
                'durationSec': tr.get('duration', 0) / 1e6,
            })

    # 视频槽
    videos = {v['id']: v for v in mats.get('videos', [])}
    for ti, t in enumerate(content.get('tracks', [])):
        if t.get('type') != 'video':
            continue
        for s in t.get('segments', []):
            mat_id = s.get('material_id')
            v = videos.get(mat_id, {})
            tr = s.get('target_timerange', {})
            result['mediaSlots'].append({
                'segmentId': s.get('id'),
                'materialId': mat_id,
                'trackIndex': ti,
                'type': v.get('type'),
                'originalPath': v.get('path', ''),
                'durationSec': (v.get('duration') or 0) / 1e6,
                'startSec': tr.get('start', 0) / 1e6,
                'segmentDurationSec': tr.get('duration', 0) / 1e6,
            })

    return result


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("用法: python step2_reverse.py <明文draft_content.json> <输出JSON>")
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        content = json.load(f)
    result = reverse_master(content)
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Step 2 完成: {len(result['textSlots'])} 文字槽, {len(result['mediaSlots'])} 视频槽")
