# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 5 — 结构 diff 验证
对比母版明文与填充后草稿，确认只变化了文字内容与视频引用，其余结构零改动。

用法:
    python step5_verify.py <母版明文draft_content.json> <填充后draft_content.json>
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


def verify(orig, new):
    issues = []

    # 轨道结构
    if len(orig.get('tracks', [])) != len(new.get('tracks', [])):
        issues.append('track 数量变化')
    for o_t, n_t in zip(orig.get('tracks', []), new.get('tracks', [])):
        if o_t.get('type') != n_t.get('type'):
            issues.append(f"track type 变化 {o_t.get('type')}->{n_t.get('type')}")
        o_segs, n_segs = o_t.get('segments', []), n_t.get('segments', [])
        if len(o_segs) != len(n_segs):
            issues.append(f"track {o_t.get('type')} segment 数量变化")
        for o_s, n_s in zip(o_segs, n_segs):
            if o_s.get('id') != n_s.get('id'):
                issues.append('segment id 变化')
            if o_s.get('material_id') != n_s.get('material_id'):
                issues.append('segment material_id 变化')
            if o_s.get('target_timerange') != n_s.get('target_timerange'):
                issues.append('timerange 变化')
            if o_s.get('transform') != n_s.get('transform'):
                issues.append('transform 变化')

    # 文字模板结构
    o_tt = {t['id']: t for t in orig['materials'].get('text_templates', [])}
    n_tt = {t['id']: t for t in new['materials'].get('text_templates', [])}
    for tid in o_tt:
        if o_tt[tid].get('resource_id') != n_tt.get(tid, {}).get('resource_id'):
            issues.append(f"text_template {tid} resource_id 变化")

    # 音频/贴纸/特效完全一致
    for mkey in ['audios', 'stickers', 'effects', 'filters', 'transitions']:
        if orig['materials'].get(mkey) != new['materials'].get(mkey):
            issues.append(f"{mkey} 内容变化")

    # 文字内容变化统计（允许）
    o_texts = {t['id']: get_text(t) for t in orig['materials'].get('texts', [])}
    n_texts = {t['id']: get_text(t) for t in new['materials'].get('texts', [])}
    text_changed = sum(1 for tid in o_texts if o_texts.get(tid) != n_texts.get(tid))

    # 视频引用变化统计（允许）
    o_vids = {v['id']: v.get('path') for v in orig['materials'].get('videos', [])}
    n_vids = {v['id']: v.get('path') for v in new['materials'].get('videos', [])}
    video_changed = sum(1 for vid in o_vids if o_vids.get(vid) != n_vids.get(vid))

    return {
        'pass': len(issues) == 0,
        'issues': issues,
        'textChanged': text_changed,
        'videoChanged': video_changed,
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('用法: python step5_verify.py <母版明文> <填充后>')
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        orig = json.load(f)
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        new = json.load(f)
    r = verify(orig, new)
    print(f"结构 diff: {'PASS' if r['pass'] else 'FAIL'}")
    print(f"  文字内容变化: {r['textChanged']} 处（允许）")
    print(f"  视频引用变化: {r['videoChanged']} 处（允许）")
    if r['issues']:
        print("  问题:")
        for i in r['issues']:
            print(f"    - {i}")
    sys.exit(0 if r['pass'] else 2)
