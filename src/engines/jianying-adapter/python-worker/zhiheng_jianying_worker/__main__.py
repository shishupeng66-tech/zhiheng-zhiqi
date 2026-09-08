# -*- coding: utf-8 -*-
"""python -m zhiheng_jianying_worker 入口（含桌面 Runtime 适配）。

高版本 fork 接入：PJD 通过 PYTHONPATH(ZHIHENG_PJD_ROOT) 加载。
若本机 site-packages 存在旧版 pyJianYingDraft 的 editable 安装
（__editable___pyjianyingdraft finder），会在 PYTHONPATH 之前拦截 import，
导致加载旧版 0.3.0（与剪映 11.3 不兼容）。此处统一移除该类 finder，
确保加载 ZHIHENG_PJD_ROOT 指向的 fork。

桌面 Runtime 适配（仅打包/启动层，不改变剪辑语义）：
- 打包为自包含 EXE 后，PyInstaller 冻结的 sys.path 不包含外部 PJD 目录；
  因此 EXE 启动时按环境变量 ZHIHENG_PJD_ROOT 把 bundled PJD 目录注入 sys.path。
- ZHIHENG_WORKER_SELFTEST=1 时进入自检模式：验证 PJD 来源（指纹/commit）、
  输出单行 JSON 后退出，供桌面 Runtime Self Test 调用（不跑完整 Job）。
"""

import os
import sys


def _inject_pjd_root() -> None:
    """把 ZHIHENG_PJD_ROOT 指向的 bundled PJD 目录注入 sys.path（幂等）。"""
    root = os.environ.get("ZHIHENG_PJD_ROOT", "").strip()
    if root and os.path.isdir(root):
        norm = os.path.normcase(os.path.realpath(root))
        for p in list(sys.path):
            try:
                if os.path.normcase(os.path.realpath(p)) == norm:
                    return
            except Exception:  # noqa: BLE001
                continue
        sys.path.insert(0, root)


_inject_pjd_root()

# 移除旧版 editable finder，确保加载 ZHIHENG_PJD_ROOT 的 fork
sys.meta_path = [
    f for f in sys.meta_path
    if "__editable___pyjianyingdraft" not in (type(f).__module__ or "")
]


def _run_selftest() -> int:
    """桌面 Runtime Self Test：校验 PJD 来源（桌面指纹或开发 git 模式）。"""
    import json

    from .pjd_source import verify_pjd_source_desktop, verify_pjd_source
    from .errors import WorkerError

    result = {
        "selftest": "zhiheng-editing-worker",
        "ok": False,
        "mode": os.environ.get("ZHIHENG_WORKER_MODE", "dev"),
        "pjd": None,
        "error": None,
    }
    try:
        if os.environ.get("ZHIHENG_WORKER_MODE", "").strip() == "desktop":
            result["pjd"] = verify_pjd_source_desktop()
        else:
            result["pjd"] = verify_pjd_source()
        result["ok"] = True
    except WorkerError as we:
        result["error"] = {"code": we.code, "message": we.message}
    except Exception as exc:  # noqa: BLE001
        result["error"] = {"code": "SELFTEST_ERROR", "message": str(exc)}
    sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()
    return 0 if result["ok"] else 1


def main() -> int:
    if os.environ.get("ZHIHENG_WORKER_SELFTEST", "").strip() == "1":
        return _run_selftest()
    from .worker import run_job_from_stdin

    run_job_from_stdin()
    return 0


if __name__ == "__main__":
    sys.exit(main())
