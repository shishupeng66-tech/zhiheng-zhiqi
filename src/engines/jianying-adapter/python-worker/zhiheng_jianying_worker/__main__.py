# -*- coding: utf-8 -*-
"""python -m zhiheng_jianying_worker 入口。

高版本 fork 接入：PJD 通过 PYTHONPATH(ZHIHENG_PJD_ROOT) 加载。
若本机 site-packages 存在旧版 pyJianYingDraft 的 editable 安装
（__editable___pyjianyingdraft finder），会在 PYTHONPATH 之前拦截 import，
导致加载旧版 0.3.0（与剪映 11.3 不兼容）。此处统一移除该类 finder，
确保加载 ZHIHENG_PJD_ROOT 指向的 fork。
"""

import sys

# 移除旧版 editable finder，确保加载 ZHIHENG_PJD_ROOT 的 fork
sys.meta_path = [
    f for f in sys.meta_path
    if "__editable___pyjianyingdraft" not in (type(f).__module__ or "")
]

from .worker import run_job_from_stdin


def main():
    run_job_from_stdin()
    return 0


if __name__ == "__main__":
    sys.exit(main())
