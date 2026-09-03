# -*- coding: utf-8 -*-
"""Worker 文件日志 —— 每 job 独立日志目录（Phase C.1）。

规则：
- 每个 job 在 <logDir>/<jobId>/ 下写入 job.log
- 记录：jobId、开始/结束时间、耗时、退出码、PJD 实际版本、staging/输出路径、
  validation 结果、warnings / error code
- 日志不得记录密钥或完整敏感环境变量（敏感键值用 <redacted> 替换）
- 日志写入失败按明确策略处理：返回错误标记并写入 stderr，绝不无声失败
- stdout 仍只输出单个 Result JSON（本模块只写文件，不碰 stdout）
"""

import json
import os
import time


# 敏感环境变量键匹配（子串即视为敏感，值一律 redact）
_SENSITIVE_KEYS = (
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "API_KEY",
    "APIKEY",
    "ACCESS_KEY",
    "PRIVATE_KEY",
    "KEY=",
    "AUTH",
    "CREDENTIAL",
    "COOKIE",
)


def _is_sensitive(key):
    k = (key or "").upper()
    return any(s in k for s in _SENSITIVE_KEYS)


def safe_env_snapshot():
    """返回环境变量快照，敏感项值替换为 <redacted>，且不包含完整值。"""
    out = {}
    for k, v in os.environ.items():
        if _is_sensitive(k):
            out[k] = "<redacted>"
        else:
            out[k] = v
    return out


class JobLogger:
    """单个 Job 的日志写入器。"""

    def __init__(self, log_dir, job_id):
        self.log_dir = log_dir
        self.job_id = job_id
        self.job_log_dir = os.path.join(log_dir, job_id) if log_dir else None
        self.log_file = None
        self.write_failures = []

    def open(self):
        """创建日志目录并打开日志文件。失败记录到 stderr，不静默。"""
        if not self.job_log_dir:
            return
        try:
            os.makedirs(self.job_log_dir, exist_ok=True)
            self.log_file = os.path.join(self.job_log_dir, "job.log")
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write("=== zhiheng_jianying_worker job log ===\n")
                f.write("created_at=%s\n" % time.strftime("%Y-%m-%dT%H:%M:%S"))
        except OSError as exc:
            # 日志失败不能无声：写入 stderr + 记录失败标记
            self.write_failures.append("open_log_failed: %s" % exc)
            import sys

            sys.stderr.write("[JobLogger] 打开日志失败（不阻断任务，但会写入 Result warning）: %s\n" % exc)

    def write(self, **fields):
        """追加一行结构化日志。失败写入 stderr 并记录标记。"""
        if not self.log_file:
            return
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(fields, ensure_ascii=False) + "\n")
        except OSError as exc:
            self.write_failures.append("write_log_failed: %s" % exc)
            import sys

            sys.stderr.write("[JobLogger] 写入日志失败: %s\n" % exc)

    def has_write_failures(self):
        return bool(self.write_failures)

    def failure_summary(self):
        return "; ".join(self.write_failures) if self.write_failures else None
