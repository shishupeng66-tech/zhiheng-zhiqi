# -*- coding: utf-8 -*-
"""
知衡智企 · 模板管线统一 CLI（Template Pipeline CLI）
====================================================
把 step1_decrypt / step4_fill / step5_verify / step6_voice / step7_verify_voice
合并为单一入口，供：
  - 开发机：python zhiheng-template-cli.py <type> <args...>
  - 桌面客户机：zhiheng-template-cli.exe（stdin JSON Job → stdout JSON Result）

协议（EXE 模式）：
  输入: {"type": "decrypt|fill|verify|voice|verify_voice|selftest", "args": [...]}
  输出: {"ok": true|false, "output": "...", "error": "..."}
"""
import json
import os
import sys

# 路径环境：桌面 runtime 注入；开发机回退默认值
PJD_ROOT = os.environ.get('ZHIHENG_PJD_ROOT', r'D:\剪映智剪测试\pyJianYingDraft-fork-v0')
if PJD_ROOT not in sys.path:
    sys.path.insert(0, PJD_ROOT)

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def run_decrypt(args):
    from step1_decrypt import decrypt_master
    source_dir, out_dir = args[0], args[1]
    decrypt_master(source_dir, out_dir)
    return {'ok': True, 'output': f'decrypt 完成: {source_dir} -> {out_dir}'}


def run_fill(args):
    from step4_fill import fill_template
    source_draft_dir, plain_content_path, asset_path, draft_name = args[0], args[1], args[2], args[3]
    result = fill_template(source_draft_dir, plain_content_path, asset_path, draft_name)
    if isinstance(result, dict):
        # 成功标准：草稿已生成（fill_template 返回 dict 无 ok 字段，避免误判 FAIL）
        ok = bool(result.get('draftPath'))
        return {'ok': ok, 'output': json.dumps(result, ensure_ascii=False),
                'error': None if ok else result.get('error', 'fill 失败')}
    return {'ok': bool(result), 'output': str(result)}


def run_verify(args):
    from step5_verify import verify
    with open(args[0], encoding='utf-8') as f:
        orig = json.load(f)
    with open(args[1], encoding='utf-8') as f:
        new = json.load(f)
    r = verify(orig, new)
    lines = [f"结构 diff: {'PASS' if r['pass'] else 'FAIL'}",
             f"  文字内容变化: {r['textChanged']} 处（允许）",
             f"  视频引用变化: {r['videoChanged']} 处（允许）"]
    for i in r['issues']:
        lines.append(f"    - {i}")
    return {'ok': r['pass'], 'output': '\n'.join(lines), 'error': None if r['pass'] else '; '.join(r['issues'])}


def run_voice(args):
    from step6_voice import run_voice
    draft_dir, voice_plan_path, style_template_path = args[0], args[1], args[2]
    run_voice(draft_dir, voice_plan_path, style_template_path)
    return {'ok': True, 'output': f'配音/字幕完成: {draft_dir}'}


def run_verify_voice(args):
    from step7_verify_voice import verify
    with open(args[0], encoding='utf-8') as f:
        orig = json.load(f)
    with open(args[1], encoding='utf-8') as f:
        new = json.load(f)
    r = verify(orig, new)
    lines = [f"配音/字幕层 diff: {'PASS' if r['pass'] else 'FAIL'}",
             f"  新增字幕 materials: {r['addedTextMaterials']}（允许）",
             f"  新增轨道: {r['addedTracks']}（允许）"]
    for i in r['issues']:
        lines.append(f"    - {i}")
    return {'ok': r['pass'], 'output': '\n'.join(lines), 'error': None if r['pass'] else '; '.join(r['issues'])}


def run_parse(args):
    """args: draftDir, templateId, outAssetDir, [templateName]"""
    import shutil
    import tempfile
    from step1_decrypt import decrypt_master
    from step2_reverse import reverse_master
    from step3_build_asset import build_asset

    draft_dir, template_id, out_asset_dir = args[0], args[1], args[2]
    template_name = args[3] if len(args) > 3 else '未命名模板'

    tmp = tempfile.mkdtemp(prefix='zhiheng-parse-')
    try:
        decrypt_master(draft_dir, tmp)
        plain = os.path.join(tmp, 'draft_content-decrypted.json')
        if not os.path.exists(plain):
            return {'ok': False, 'output': '', 'error': f'解密失败：未生成明文 {plain}'}
        with open(plain, encoding='utf-8') as f:
            content = json.load(f)
        rev = reverse_master(content)
        asset = build_asset(rev, template_id, template_name)
        # 输出目录：<outAssetDir>/template-asset.json；明文草稿放 <outAssetDir>/source/
        os.makedirs(out_asset_dir, exist_ok=True)
        with open(os.path.join(out_asset_dir, 'template-asset.json'), 'w', encoding='utf-8') as f:
            json.dump(asset, f, ensure_ascii=False, indent=2)
        source_dir = os.path.join(out_asset_dir, 'source')
        os.makedirs(source_dir, exist_ok=True)
        shutil.copy2(plain, os.path.join(source_dir, 'draft_content-decrypted.json'))
        for fname in ('draft_meta_info.json', 'draft_content.json'):
            src = os.path.join(draft_dir, fname)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(source_dir, fname))
        return {'ok': True,
                'output': f'parse 完成: {len(asset["textSlots"])} 文字槽, {len(asset["mediaSlots"])} 视频槽 -> {out_asset_dir}'}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_selftest(_args):
    issues = []
    try:
        from pyJianYingDraft import draft_codec  # noqa
    except Exception as e:
        issues.append(f'pyJianYingDraft 导入失败: {e}')
    for mod in ('step1_decrypt', 'step2_reverse', 'step3_build_asset', 'step4_fill', 'step5_verify', 'step6_voice', 'step7_verify_voice'):
        try:
            __import__(mod)
        except Exception as e:
            issues.append(f'{mod} 导入失败: {e}')
    ok = not issues
    return {'ok': ok, 'output': 'SELFTEST PASS' if ok else 'SELFTEST FAIL: ' + '; '.join(issues),
            'error': None if ok else '; '.join(issues)}


HANDLERS = {
    'decrypt': run_decrypt,
    'parse': run_parse,
    'fill': run_fill,
    'verify': run_verify,
    'voice': run_voice,
    'verify_voice': run_verify_voice,
    'selftest': run_selftest,
}


def dispatch(job_type, args):
    handler = HANDLERS.get(job_type)
    if not handler:
        return {'ok': False, 'output': '', 'error': f'未知任务类型: {job_type}'}
    try:
        return handler(args)
    except Exception as e:
        return {'ok': False, 'output': '', 'error': f'{job_type} 执行失败: {e}'}


def main():
    # 强制 UTF-8 输出，避免控制台 GBK 乱码影响 Node 判定
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding='utf-8')
        except Exception:
            pass

    # 优先 argv 模式：cli.py <type> <args...>（开发机 python 与桌面 EXE 均可用）
    if len(sys.argv) >= 2:
        job_type = sys.argv[1]
        args = sys.argv[2:]
        result = dispatch(job_type, args)
        if result.get('output'):
            print(result['output'])
        if not result.get('ok'):
            print(result.get('error') or 'FAIL', file=sys.stderr)
            return 2
        return 0

    # 无参数且 stdin 非交互 → EXE / 管道协议（stdin JSON Job → stdout JSON Result）
    try:
        if not sys.stdin.isatty():
            raw = sys.stdin.read().strip()
            if raw:
                try:
                    job = json.loads(raw)
                except json.JSONDecodeError as e:
                    print(json.dumps({'ok': False, 'output': '', 'error': f'Job JSON 解析失败: {e}'}, ensure_ascii=False))
                    return 1
                result = dispatch(job.get('type', ''), job.get('args', []))
                print(json.dumps(result, ensure_ascii=False))
                return 0 if result.get('ok') else 2
    except Exception:
        pass

    print('用法: zhiheng-template-cli <type> <args...>\n类型: decrypt|parse|fill|verify|voice|verify_voice|selftest')
    return 1


if __name__ == '__main__':
    sys.exit(main())
