# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 6 — TTS 配音替换 + 底部字幕轨新增
在 step4 填充后的草稿上：
  1) 移除母版旧 text_to_audio 配音（materials + segments），保留 BGM/音效
  2) 按 voice_plan 新增配音 audio materials + 配音轨（普通 audio 型，path=新 mp3）
  3) 新增底部字幕轨（subtitle 型 text materials，样式取 bundled 默认字幕样式）
规则：
  - 只动音频/字幕层，不碰文字模板/花字/动画/transform/素材
  - 原草稿只读，输出新草稿目录（step4 输出目录内直接改 draft_content.json）
用法:
    python step6_voice.py <草稿目录> <voice_plan.json> <默认字幕样式.json>
"""
import sys, json, copy, os, uuid
from pathlib import Path


def new_id():
    return str(uuid.uuid4()).upper()


def load_json(p):
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(p, data):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


def remove_voice(content):
    """移除全部 text_to_audio 配音 materials + 对应 segments（保留 sound/BGM）。"""
    removed_mat_ids = {
        a['id'] for a in content['materials'].get('audios', [])
        if a.get('type') == 'text_to_audio'
    }
    if removed_mat_ids:
        content['materials']['audios'] = [
            a for a in content['materials']['audios']
            if a.get('type') != 'text_to_audio'
        ]
    # 从所有 audio track 移除引用了被删配音的 segments
    for tr in content['tracks']:
        if tr.get('type') != 'audio':
            continue
        segs = tr.get('segments', [])
        tr['segments'] = [
            s for s in segs if s.get('material_id') not in removed_mat_ids
        ]
    return len(removed_mat_ids)


def add_voice(content, voice_plan):
    """新增配音 materials + 一条配音音频轨。"""
    audios = content['materials'].get('audios', [])
    voice_segs = []
    for seg in voice_plan.get('segments', []):
        mid = new_id()
        dur_us = int(seg['durationSec'] * 1e6)
        audios.append({
            'id': mid,
            'type': 'audio',
            'name': seg.get('text', '')[:40] or '配音',
            'duration': dur_us,
            'path': seg['audioPath'],
            'material_name': os.path.basename(seg['audioPath']),
            'similiar_music_info': {},
        })
        voice_segs.append({
            'id': new_id(),
            'source_timerange': {'duration': dur_us},
            'target_timerange': {
                'start': int(seg.get('startSec', 0) * 1e6),
                'duration': dur_us
            },
            'render_timerange': {},
            'material_id': mid,
            'extra_material_refs': [],
            'enable_lut': False,
            'enable_adjust': False,
            'enable_hsl': False,
            'is_default_name': True,
        })
    content['materials']['audios'] = audios
    if voice_segs:
        # 放在第一条 audio track 之前（若无可用的则新建）
        tracks = content['tracks']
        audio_idx = next((i for i, t in enumerate(tracks) if t.get('type') == 'audio'), None)
        new_track = {
            'id': new_id(),
            'type': 'audio',
            'segments': voice_segs,
            'is_default_name': True,
        }
        if audio_idx is not None:
            tracks.insert(audio_idx, new_track)
        else:
            tracks.append(new_track)
    return len(voice_segs)


def add_subtitle_track(content, voice_plan, style_template):
    """新增底部字幕轨（subtitle 型 text materials，clip.transform y=-0.47）。"""
    texts = content['materials'].get('texts', [])
    segs = []
    for sub in voice_plan.get('subtitle', []):
        text = sub.get('text', '').strip()
        if not text:
            continue
        start_us = int(sub['startMs'] * 1000)
        dur_us = max(int(sub['endMs'] * 1000) - start_us, 500000)
        mid = new_id()
        # 基于样式模板构造字幕 material（样式模板为 bundled subtitle 样式）
        mat = {
            'id': mid,
            'type': 'subtitle',
            'duration': dur_us,
            'base_content': style_template.get('base_content', ''),
            'content': {'text': text},
            'render_index': 0,
            'font_size': 10.0,
            'color': {'alpha': 1.0, 'solid': {'color': [1.0, 1.0, 1.0]}},
        }
        if 'flags' in style_template:
            mat['flags'] = copy.deepcopy(style_template['flags'])
        texts.append(mat)
        segs.append({
            'id': new_id(),
            'target_timerange': {'start': start_us, 'duration': dur_us},
            'render_timerange': {},
            'clip': {
                'scale': {'x': 1.0, 'y': 1.0},
                'transform': {'x': 0.0, 'y': -0.47},
                'flip': {},
            },
            'uniform_scale': {},
            'material_id': mid,
            'extra_material_refs': [],
            'render_index': 15000 + len(segs),
            'enable_lut': False,
            'enable_adjust': False,
            'enable_hsl': False,
            'track_render_index': 0,
            'responsive_layout': 0,
            'enable_adjust_mask': False,
            'source': {'audio': {}},
            'is_default_name': True,
        })
    content['materials']['texts'] = texts
    if segs:
        tracks = content['tracks']
        # 放在最后一条 text track 之后（避免盖住花字层）
        last_text = max(
            (i for i, t in enumerate(tracks) if t.get('type') == 'text'),
            default=-1
        )
        new_track = {
            'id': new_id(),
            'type': 'text',
            'segments': segs,
            'is_default_name': True,
        }
        if last_text >= 0:
            tracks.insert(last_text + 1, new_track)
        else:
            tracks.append(new_track)
    return len(segs)


def run_voice(draft_dir, voice_plan_path, style_template_path):
    draft_content = Path(draft_dir) / 'draft_content.json'
    content = load_json(draft_content)
    voice_plan = load_json(voice_plan_path)
    style_template = load_json(style_template_path)

    removed = remove_voice(content)
    added_voice = add_voice(content, voice_plan)
    added_subs = add_subtitle_track(content, voice_plan, style_template)

    save_json(draft_content, content)
    return {
        'removedOldVoice': removed,
        'addedVoiceSegments': added_voice,
        'addedSubtitleSegments': added_subs,
        'draftPath': str(draft_dir),
    }


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('用法: python step6_voice.py <草稿目录> <voice_plan.json> <默认字幕样式.json>')
        sys.exit(1)
    r = run_voice(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"Step 6 完成: 移除旧配音 {r['removedOldVoice']}, 新增配音段 {r['addedVoiceSegments']}, 新增字幕段 {r['addedSubtitleSegments']}")
    print(f"草稿: {r['draftPath']}")
