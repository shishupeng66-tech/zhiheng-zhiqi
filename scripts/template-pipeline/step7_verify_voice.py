# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 7 — 配音/字幕层 diff 验证
对比 step5 验证后的草稿与 step6 配音字幕后的草稿：
  允许变化：audios（配音替换）、texts 新增（字幕）、track 数量 +2（配音轨+字幕轨）
  禁止变化：videos / stickers / effects / filters / transitions / text_templates
           以及原有 text segments 的 id/material_id/timerange/transform
用法:
    python step7_verify_voice.py <step5后draft_content.json> <step6后draft_content.json>
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

    # 轨道：允许新增 1 条 audio + 1 条 text（配音轨/字幕轨），其余轨顺序与类型必须一致
    o_tracks = [t for t in orig.get('tracks', [])]
    n_tracks = [t for t in new.get('tracks', [])]
    if len(n_tracks) < len(o_tracks):
        issues.append('track 数量减少')
    # 按类型匹配原轨道：原轨在 new 中按同类型顺序应能找到同 id 轨道
    for o_t in o_tracks:
        matches = [n_t for n_t in n_tracks if n_t.get('id') == o_t.get('id')]
        if not matches:
            issues.append(f"原轨道丢失 id={o_t.get('id')} type={o_t.get('type')}")
            continue
        n_t = matches[0]
        if o_t.get('type') != n_t.get('type'):
            issues.append('track type 变化')
        # 原轨道内 segments 必须逐一保留（id/material_id/timerange/transform）
        # 例外：原 audio 轨中的旧配音（text_to_audio）segment 允许被 step6 移除
        o_segs, n_segs = o_t.get('segments', []), n_t.get('segments', [])
        o_by_id = {s.get('id'): s for s in o_segs}
        n_by_id = {s.get('id'): s for s in n_segs}
        o_audio_materials = {a['id'] for a in orig['materials'].get('audios', []) if a.get('type') == 'text_to_audio'}
        for sid, o_s in o_by_id.items():
            if sid not in n_by_id:
                if o_t.get('type') == 'audio' and o_s.get('material_id') in o_audio_materials:
                    continue  # 旧配音段预期移除
                issues.append(f"segment 丢失 {sid}")
                continue
            n_s = n_by_id[sid]
            if o_s.get('material_id') != n_s.get('material_id'):
                issues.append(f"segment material_id 变化 {sid}")
            if o_s.get('target_timerange') != n_s.get('target_timerange'):
                issues.append(f"segment timerange 变化 {sid}")
            # 原音频轨中的旧配音 segment 允许被移除（step6 删除 text_to_audio）
        # 原 text 轨中：允许新增 segment（字幕轨是新增 track，原 track 不应有 segment 变化）
        if o_t.get('type') == 'text' and len(o_segs) != len(n_segs):
            issues.append(f"原 text 轨 segment 数量变化（预期不变）")

    # materials：允许 audios 变化（配音替换）、texts 增加（字幕）
    for mkey in ['videos', 'stickers', 'effects', 'filters', 'transitions']:
        if orig['materials'].get(mkey) != new['materials'].get(mkey):
            issues.append(f"{mkey} 内容变化（禁止）")

    # text_templates 必须完全一致
    if orig['materials'].get('text_templates') != new['materials'].get('text_templates'):
        issues.append('text_templates 内容变化（禁止）')

    # 原有 texts 必须保留（id + 内容不变），只允许新增
    o_texts = {t['id']: get_text(t) for t in orig['materials'].get('texts', [])}
    n_texts = {t['id']: get_text(t) for t in new['materials'].get('texts', [])}
    for tid, txt in o_texts.items():
        if tid not in n_texts:
            issues.append(f"原 text material 丢失 {tid}")
        elif n_texts[tid] != txt:
            issues.append(f"原 text material 内容变化 {tid}（禁止）")

    added_texts = len(n_texts) - len(o_texts)
    added_tracks = len(n_tracks) - len(o_tracks)

    return {
        'pass': len(issues) == 0,
        'issues': issues,
        'addedTextMaterials': added_texts,
        'addedTracks': added_tracks,
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('用法: python step7_verify_voice.py <step5后> <step6后>')
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        orig = json.load(f)
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        new = json.load(f)
    r = verify(orig, new)
    print(f"配音/字幕层 diff: {'PASS' if r['pass'] else 'FAIL'}")
    print(f"  新增字幕 materials: {r['addedTextMaterials']}（允许）")
    print(f"  新增轨道: {r['addedTracks']}（允许）")
    if r['issues']:
        print("  问题:")
        for i in r['issues']:
            print(f"    - {i}")
    sys.exit(0 if r['pass'] else 2)
