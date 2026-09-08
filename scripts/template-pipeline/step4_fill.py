# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 4 — 按模板资产填充（文字替换 + 视频素材替换）
复制母版 → 按资产 replacementPlan 替换文字(等字数) + 视频路径 → 明文写回新草稿。

用法:
    python step4_fill.py <母版草稿目录> <明文draft_content.json> <资产JSON> <输出草稿名>

规则（已验证）:
    - 文字: 全部等字数替换(EXACT_CHAR_COUNT)，styles/words 字数相同不动
    - 视频: 仅改 path/duration/width/height/type/material_name，保留 segment/transform/动画
    - 音频/贴纸/特效: 零改动
    - 原母版只读
"""
import sys, os, shutil, copy, time, json
from pathlib import Path
import __main__ as _main

DRAFT_ROOT = Path(os.environ.get('ZHIHENG_DRAFT_ROOT', r'C:\Users\Administrator\AppData\Local\JianyingPro\User Data\Projects\com.lveditor.draft'))


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


def find_segment(content, seg_id):
    for track in content['tracks']:
        if track.get('type') != 'text':
            continue
        for i, seg in enumerate(track.get('segments', [])):
            if seg.get('id') == seg_id:
                return track, i, seg
    return None, None, None


def replace_text(content, seg_id, new_text):
    track, seg_idx, seg = find_segment(content, seg_id)
    if seg is None:
        return False, 'segment not found'
    mat_id = seg.get('material_id')
    is_template = any(tt['id'] == mat_id for tt in content['materials'].get('text_templates', []))
    if is_template:
        for tt in content['materials']['text_templates']:
            if tt['id'] == mat_id:
                for tir in tt.get('text_info_resources', []):
                    for t in content['materials']['texts']:
                        if t['id'] == tir.get('text_material_id'):
                            old = get_text(t)
                            c = t.get('content')
                            if isinstance(c, dict):
                                c['text'] = new_text
                            elif isinstance(c, str):
                                try:
                                    parsed = json.loads(c)
                                    if isinstance(parsed, dict):
                                        parsed['text'] = new_text
                                        t['content'] = json.dumps(parsed, ensure_ascii=False)
                                    else:
                                        t['content'] = new_text
                                except (json.JSONDecodeError, ValueError):
                                    t['content'] = new_text
                            else:
                                t['content'] = new_text
                            return True, f'TT {old} -> {new_text}'
                return False, 'template inner text not found'
        return False, 'template material not found'
    else:
        for t in content['materials']['texts']:
            if t['id'] == mat_id:
                old = get_text(t)
                c = t.get('content')
                if isinstance(c, dict):
                    c['text'] = new_text
                elif isinstance(c, str):
                    try:
                        parsed = json.loads(c)
                        if isinstance(parsed, dict):
                            parsed['text'] = new_text
                            t['content'] = json.dumps(parsed, ensure_ascii=False)
                        else:
                            t['content'] = new_text
                    except (json.JSONDecodeError, ValueError):
                        t['content'] = new_text
                else:
                    t['content'] = new_text
                if 'translate_original_text' in t:
                    t['translate_original_text'] = new_text
                return True, f'PLAIN {old} -> {new_text}'
        return False, 'text material not found'


def replace_video(content, mat_id, new_path, new_duration_sec, width, height, file_name):
    for v in content['materials'].get('videos', []):
        if v['id'] == mat_id:
            v['path'] = new_path
            v['duration'] = int(new_duration_sec * 1e6)
            v['width'] = width
            v['height'] = height
            v['type'] = 'video'
            v['material_name'] = file_name
            return True
    return False


def fill_template(source_draft_dir, plain_content_path, asset_path, draft_name):
    with open(plain_content_path, 'r', encoding='utf-8') as f:
        original = json.load(f)
    with open(asset_path, 'r', encoding='utf-8') as f:
        asset = json.load(f)

    content = copy.deepcopy(original)
    plan = asset.get('replacementPlan', {})

    # 文字替换
    text_results = []
    for seg_id, new_text in plan.get('text', {}).items():
        ok, msg = replace_text(content, seg_id, new_text)
        text_results.append({'segmentId': seg_id, 'ok': ok, 'msg': msg})

    # 视频替换
    video_results = []
    for mat_id, info in plan.get('media', {}).items():
        ok = replace_video(content, mat_id,
                           info['assetPath'], info['assetDurationSec'],
                           info.get('width', 1920), info.get('height', 1080),
                           info.get('fileName', os.path.basename(info['assetPath'])))
        video_results.append({'materialId': mat_id, 'ok': ok})

    # 复制草稿目录并明文写回
    draft_path = DRAFT_ROOT / draft_name
    if draft_path.exists():
        shutil.rmtree(draft_path)
    shutil.copytree(source_draft_dir, draft_path)
    with open(draft_path / 'draft_content.json', 'w', encoding='utf-8') as f:
        json.dump(content, f, ensure_ascii=False)

    return {
        'draftName': draft_name,
        'draftPath': str(draft_path),
        'textOK': sum(1 for r in text_results if r['ok']),
        'textTotal': len(text_results),
        'videoOK': sum(1 for r in video_results if r['ok']),
        'videoTotal': len(video_results),
    }


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print('用法: python step4_fill.py <母版草稿目录> <明文draft_content.json> <资产JSON> <输出草稿名>')
        sys.exit(1)
    result = fill_template(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(f"Step 4 完成: 文字 {result['textOK']}/{result['textTotal']}, 视频 {result['videoOK']}/{result['videoTotal']}")
    print(f"草稿: {result['draftPath']}")
