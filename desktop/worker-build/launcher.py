import os
import sys

# 桌面自包含 Worker 启动器：
# - 兼容 TS 侧 worker-client 的调用方式（原为 python -m zhiheng_jianying_worker）
# - 忽略 argv，统一走 stdin Job JSON → stdout Result JSON 协议
# - __main__ 顶层已按 ZHIHENG_PJD_ROOT 注入 bundled PJD 目录到 sys.path
# - ZHIHENG_WORKER_SELFTEST=1 时执行自检并退出
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from zhiheng_jianying_worker.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
