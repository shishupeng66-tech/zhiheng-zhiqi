# -*- coding: utf-8 -*-
"""Job / Result Contract —— 与 TS 侧 src/engines/jianying-adapter/contract.ts 保持一致。

共享 Contract Fixtures 位于：
  src/engines/jianying-adapter/__fixtures__/
TS 与 Python 两侧读取同一批 JSON 做交叉验证，防止两套 schema 漂移。
"""

import json
import os
from pathlib import Path

from .errors import ERROR_CODE_SET, WorkerError

CONTRACT_VERSION = "0.1.0"
SUPPORTED_TIMELINE_SCHEMA_VERSION = 2

# PJD 版本锁定元数据（Phase C.1 / C.2 / 高版本 fork 接入）
# 高版本 fork：aoguai/pyJianYingDraft @ main 4a7730c9（基于上游 GuanYixuan c3318066 后 4 个提交）
# - 本地 git 仓库：D:\剪映智剪测试\pyJianYingDraft-fork-v0（zip snapshot，无 upstream git 历史）
# - 本地锁定 commit = fdd9c04f...（git init 生成的本地 commit，上游真实 commit = 4a7730c9）
# - 已验证：fork 生成明文草稿可被剪映 11.3.0.14362 首次正常打开（关键：root_meta_info 注册 + meta 完整）
PJD_REPOSITORY = "aoguai/pyJianYingDraft"
PJD_EXPECTED_COMMIT = "fdd9c04fd44257222aa1af45fdd7c4ac029e652e"  # 本地锁定 commit（全量比较）
PJD_UPSTREAM_COMMIT = "4a7730c9a14e91aa497e723c85b5c433a62a163c"  # 上游真实 commit（参考记录）
PJD_PACKAGE_VERSION = "fork-v0@4a7730c9"
PJD_ROOT_ENV = "ZHIHENG_PJD_ROOT"  # 统一拼写（不再使用 ZHIJING_PJD_ROOT）

# 共享 fixtures 目录：zhiheng_jianying_worker/contract.py -> ../../__fixtures__
FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "__fixtures__"

# 生产 ResourceMap 数据：jianying-adapter/resources/resource-map.v0.json
# （生产代码只读取正式资源文件，不依赖 __fixtures__；与 TS 侧同一文件，真正单源）
PRODUCTION_RESOURCE_MAP_PATH = (
    Path(__file__).resolve().parent.parent.parent / "resources" / "resource-map.v0.json"
)

SHARED_FIXTURE_FILES = (
    "job-minimal.json",
    "job-dissolve.json",
    "job-keyword.json",
    "result-ok.json",
    "result-error.json",
    "error-codes.json",
)


def load_production_resource_map():
    """读取生产 ResourceMap 数据（resources/resource-map.v0.json）。"""
    if not PRODUCTION_RESOURCE_MAP_PATH.exists():
        raise WorkerError(
            "JOB_INVALID",
            "生产 ResourceMap 数据不存在: %s" % PRODUCTION_RESOURCE_MAP_PATH,
        )
    with open(PRODUCTION_RESOURCE_MAP_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_fixture(name):
    """读取共享 fixture JSON（TS/Python 交叉验证用）。"""
    p = FIXTURES_DIR / name
    if not p.exists():
        raise WorkerError("JOB_INVALID", "共享 fixture 不存在: %s" % p)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def validate_job(job):
    """校验 Job 结构（最小但关键字段）。

    完整结构由 TS 侧 zod 校验；Python 侧负责契约级检查：
    - contractVersion / timelineSchemaVersion 匹配
    - 关键字段存在且类型正确
    失败抛 WorkerError。
    """
    if not isinstance(job, dict):
        raise WorkerError("JOB_INVALID", "Job 必须是 JSON 对象")
    if job.get("contractVersion") != CONTRACT_VERSION:
        raise WorkerError(
            "UNSUPPORTED_CONTRACT_VERSION",
            "不支持的 contractVersion: %r（期望 %s）" % (job.get("contractVersion"), CONTRACT_VERSION),
        )
    if job.get("timelineSchemaVersion") != SUPPORTED_TIMELINE_SCHEMA_VERSION:
        raise WorkerError(
            "UNSUPPORTED_TIMELINE_VERSION",
            "不支持的 timelineSchemaVersion: %r（期望 %s）"
            % (job.get("timelineSchemaVersion"), SUPPORTED_TIMELINE_SCHEMA_VERSION),
        )
    job_id = job.get("jobId")
    if not isinstance(job_id, str) or not job_id:
        raise WorkerError("JOB_INVALID", "jobId 缺失或非法")
    for key in ("draft", "timeline", "assetRoot", "outputDraftDir", "stagingRoot", "logDir", "options"):
        if key not in job:
            raise WorkerError("JOB_INVALID", "Job 缺少字段: %s" % key)
    options = job.get("options", {})
    backup_plaintext = bool(options.get("backupPlaintext", False))
    if backup_plaintext:
        # Phase C.2：backupPlaintext=true 时 backupRoot 必填
        if not isinstance(job.get("backupRoot"), str) or not job.get("backupRoot"):
            raise WorkerError("JOB_INVALID", "backupPlaintext=true 时 backupRoot 必填")
    draft = job["draft"]
    for key in ("name", "width", "height", "fps"):
        if key not in draft:
            raise WorkerError("JOB_INVALID", "draft 缺少字段: %s" % key)
    timeline = job["timeline"]
    if not isinstance(timeline, dict) or "videoTrack" not in timeline:
        raise WorkerError("JOB_INVALID", "timeline 缺少 videoTrack")
    return job_id


def validate_result(result):
    """校验 Result 结构（Worker 输出前自检 + 测试用）。失败抛 WorkerError。"""
    if not isinstance(result, dict):
        raise WorkerError("WORKER_PROTOCOL_ERROR", "Result 必须是 JSON 对象")
    if result.get("contractVersion") != CONTRACT_VERSION:
        raise WorkerError("WORKER_PROTOCOL_ERROR", "Result contractVersion 不匹配")
    if "ok" not in result or "jobId" not in result:
        raise WorkerError("WORKER_PROTOCOL_ERROR", "Result 缺少 ok/jobId")
    if result.get("ok"):
        for key in ("draftDir", "duration", "tracks", "validationReport"):
            if key not in result:
                raise WorkerError("WORKER_PROTOCOL_ERROR", "Result 缺少字段: %s" % key)
    else:
        err = result.get("error")
        if not err or err.get("code") not in ERROR_CODE_SET:
            raise WorkerError("WORKER_PROTOCOL_ERROR", "Result error 缺失或非法")
    return result


def cross_check_error_codes_fixture():
    """交叉验证 error-codes.json fixture 与本地错误码集合一致。"""
    fixture = load_fixture("error-codes.json")
    codes = fixture.get("errorCodes")
    if not isinstance(codes, list):
        raise WorkerError("WORKER_PROTOCOL_ERROR", "error-codes.json 格式非法")
    if set(codes) != ERROR_CODE_SET:
        raise WorkerError(
            "WORKER_PROTOCOL_ERROR",
            "error-codes fixture 与本地错误码不一致: fixture=%s local=%s"
            % (sorted(codes), sorted(ERROR_CODE_SET)),
        )
    return codes
