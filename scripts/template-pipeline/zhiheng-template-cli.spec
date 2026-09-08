# -*- mode: python ; coding: utf-8 -*-
"""知衡智企 模板管线 CLI（PyInstaller 打包）——含 PJD 依赖（pymediainfo/comtypes）"""
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['step1_decrypt', 'step2_reverse', 'step3_build_asset', 'step4_fill', 'step5_verify', 'step6_voice', 'step7_verify_voice', 'uiautomation']

tmp_ret = collect_all('pymediainfo')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('comtypes')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('uiautomation')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

a = Analysis(
    ['zhiheng-template-cli.py'],
    pathex=[
        'D:/知衡智企/scripts/template-pipeline',
        'D:/剪映智剪测试/pyJianYingDraft-fork-v0',
    ],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['numpy', 'PIL', 'imageio', 'uiautomation'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='zhiheng-template-cli',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
