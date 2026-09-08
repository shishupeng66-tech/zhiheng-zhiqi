# -*- coding: utf-8 -*-
"""
Template Pipeline · Step 1 — 母版草稿解密
把加密的剪映母版 draft_content.json / draft_meta_info.json 解密为明文 JSON。

用法:
    python step1_decrypt.py <母版草稿目录> <输出明文目录>

原理（已验证）:
    剪映 DLL 全部带后缀(_d_xxxx)，LoadLibrary 依赖解析失败。
    方案: 硬链接全部 DLL 到 staging 目录（无后缀名），进程内调用 PJD codec 解密。
"""
import sys, os, shutil, json, time

def decrypt_master(source_dir, out_dir, jy_dir=None,
                   staging_parent=None):
    if jy_dir is None:
        jy_dir = os.environ.get('ZHIHENG_JIANYING_DIR', r'D:\JianyingPro\11.4.5.14391')
    if staging_parent is None:
        import tempfile
        staging_parent = tempfile.gettempdir()
    os.makedirs(out_dir, exist_ok=True)

    STAGING = os.path.join(staging_parent, f'jy-dll-staging-{int(time.time())}')
    if os.path.exists(STAGING):
        shutil.rmtree(STAGING, ignore_errors=True)
    os.makedirs(STAGING)

    # 全量链接剪映 DLL 到 staging（保证 videoeditor.dll 依赖链完整）
    # - 含 _d_ 后缀（老版）：去后缀链接
    # - 无 _d_ 后缀（新版，如 11.4.x）：保留原名链接
    linked = 0
    for f in os.listdir(jy_dir):
        if not f.lower().endswith('.dll'):
            continue
        target_name = f.split('_d_')[0] if '_d_' in f else f
        src = os.path.join(jy_dir, f)
        dst = os.path.join(STAGING, target_name)
        if os.path.exists(dst):
            continue
        try:
            os.link(src, dst)
            linked += 1
        except OSError:
            try:
                shutil.copy2(src, dst)
                linked += 1
            except OSError:
                pass
    assert os.path.exists(os.path.join(STAGING, 'videoeditor.dll')), 'videoeditor.dll staging 失败'

    try:
        sys.path.insert(0, os.environ.get('ZHIHENG_PJD_ROOT', r'D:\剪映智剪测试\pyJianYingDraft-fork-v0'))
        os.environ['JY_INSTALL_DIR'] = STAGING
        from pyJianYingDraft.draft_codec import JianyingDraftCryptoCodec
        from pyJianYingDraft.draft_crypto import DraftCryptoConfig
        from pathlib import Path

        # isolated=False: 进程内解密（EXE 环境无法启动子 python 进程）
        codec = JianyingDraftCryptoCodec(DraftCryptoConfig(jy_install_dir=STAGING, isolated=False))

        for fname in ['draft_content.json', 'draft_meta_info.json']:
            src = os.path.join(source_dir, fname)
            if not os.path.exists(src):
                continue
            raw = Path(src).read_bytes()
            try:
                decoded = codec.decode(raw)
                out_path = os.path.join(out_dir, fname.replace('.json', '-decrypted.json'))
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(decoded, f, ensure_ascii=False)
                print(f"[OK] {fname} -> {out_path}")
            except Exception as e:
                # 明文草稿直接复制
                shutil.copy2(src, os.path.join(out_dir, fname.replace('.json', '-decrypted.json')))
                print(f"[PLAIN] {fname} 非加密，已直接复制")
        return True
    finally:
        for attempt in range(3):
            try:
                shutil.rmtree(STAGING)
                break
            except Exception:
                time.sleep(2)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("用法: python step1_decrypt.py <母版草稿目录> <输出明文目录>")
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    decrypt_master(src, dst)
    print("Step 1 完成")
