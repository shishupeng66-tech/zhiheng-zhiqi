# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 3 — 生成模板资产（Template Asset）
把 Step 2 逆向结果 + 人工确认的替换方案，固化为模板资产 JSON。

模板资产 = 这套模板自己的"说明书"：
  - textSlots: 每个文字槽（原文/字数/角色/资源类型/约束）
  - mediaSlots: 每个视频槽（时间段/语义/素材映射）
  - constraints: 替换策略

用法:
    python step3_build_asset.py <逆向JSON> <输出资产JSON>
"""
import sys, json

def build_asset(reverse_result, template_id, template_name, text_plan=None, media_plan=None,
                constraint_mode='EXACT_CHAR_COUNT'):
    """text_plan: {segmentId: newText}（本轮人工/LLM确认的替换方案）
       media_plan: {materialId: {assetPath, assetDurationSec, semanticRole}}"""
    asset = {
        'templateId': template_id,
        'templateName': template_name,
        'templateInfo': {
            'canvas': reverse_result.get('canvas'),
            'durationSec': reverse_result.get('durationSec'),
            'tracks': reverse_result.get('tracks'),
        },
        'constraintMode': constraint_mode,
        'textSlots': reverse_result.get('textSlots', []),
        'mediaSlots': reverse_result.get('mediaSlots', []),
        'replacementPlan': {
            'text': text_plan or {},
            'media': media_plan or {},
        },
        'status': 'testing',
        'verificationStatus': 'PENDING_USER_REVIEW',
    }
    return asset


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("用法: python step3_build_asset.py <逆向JSON> <templateId> <输出资产JSON> [--name 模板名]")
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        rev = json.load(f)
    name = '未命名模板'
    if '--name' in sys.argv:
        name = sys.argv[sys.argv.index('--name') + 1]
    asset = build_asset(rev, sys.argv[2], name)
    with open(sys.argv[3], 'w', encoding='utf-8') as f:
        json.dump(asset, f, ensure_ascii=False, indent=2)
    print(f"Step 3 完成: {len(asset['textSlots'])} 文字槽, {len(asset['mediaSlots'])} 视频槽 -> {sys.argv[3]}")
