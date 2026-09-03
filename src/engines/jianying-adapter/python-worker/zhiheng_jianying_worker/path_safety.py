# -*- coding: utf-8 -*-
"""路径安全 —— 防止路径逃逸与越界写入。

规则（Phase C 已确认）：
- 素材必须位于允许的 assetRoot 下
- 输出必须位于配置的 draftRoot / 测试 root 下
- 拒绝 ..、绝对路径逃逸、符号链接/目录联接逃逸
"""

import os
from pathlib import Path

from .errors import WorkerError


def _norm(path_str):
    return str(Path(path_str).resolve())


def is_within(root, target):
    """判断 target 是否在 root 之下（或等于 root）。Windows 大小写不敏感。"""
    root_n = _norm(root).lower()
    target_n = _norm(target).lower()
    if target_n == root_n:
        return True
    return target_n.startswith(root_n + os.sep)


def assert_relative_safe(relative_path, label="assetId"):
    """校验相对路径不含 ..、不绝对、不含盘符。返回规范化（用 / 分隔）后的路径。"""
    if not isinstance(relative_path, str) or not relative_path:
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 为空" % label)
    p = relative_path.replace("\\", "/")
    if p.startswith("/") or (len(p) > 1 and p[1] == ":"):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 为绝对路径: %s" % (label, relative_path))
    parts = [x for x in p.split("/")]
    if ".." in parts or "." in parts:
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 含 .. 或 .: %s" % (label, relative_path))
    return p


def resolve_asset_path(asset_root, asset_id, label="素材"):
    """解析素材路径：assetRoot + relativePath，做逃逸与符号链接校验。

    asset_id 约定：相对 assetRoot 的路径，用 / 分隔。
    """
    rel = assert_relative_safe(asset_id, label)
    candidate = os.path.join(_norm(asset_root), *rel.split("/"))
    if not is_within(asset_root, candidate):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 超出 assetRoot: %s" % (label, asset_id))
    # 符号链接/目录联接逃逸：解析后再次校验
    real = _norm(candidate)
    if not is_within(asset_root, real):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 符号链接逃逸: %s" % (label, asset_id))
    if not os.path.exists(real):
        raise WorkerError("ASSET_NOT_FOUND", "%s 不存在: %s" % (label, asset_id))
    if not os.path.isfile(real):
        raise WorkerError("ASSET_NOT_FOUND", "%s 不是文件: %s" % (label, asset_id))
    return real


def resolve_output_path(draft_root, target_dir, label="输出目录"):
    """校验输出目录位于 draftRoot 下并返回。"""
    if not is_within(draft_root, target_dir):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 超出 draftRoot: %s" % (label, target_dir))
    real = _norm(target_dir)
    if not is_within(draft_root, real):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "%s 符号链接逃逸: %s" % (label, target_dir))
    return real


def resolve_backup_path(backup_root, job_id, draft_name, staging_root, official_draft_root=None):
    """校验并返回备份目录 <backupRoot>/<jobId>/<draftName>（Phase C.2）。

    规则：
      - backupRoot 不得位于 stagingRoot 内（staging 是临时目录，备份必须独立持久）
      - backupRoot 不得位于剪映官方草稿目录（officialDraftRoot）内
      - jobId / draftName 必须为简单标识符（不含 /、\\、..、.）
      - 路径解析后（realpath）仍须在 backupRoot 内（防符号链接逃逸）
    返回规范化后的绝对备份目录路径。校验失败抛 PATH_OUTSIDE_ALLOWED_ROOT。
    """
    if not backup_root or not isinstance(backup_root, str):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "backupRoot 缺失或非法")
    # 拒绝原始路径含 ..（防越界；resolve 会掩盖逃逸意图）
    norm_sep = backup_root.replace("\\", "/")
    if ".." in [p for p in norm_sep.split("/")]:
        raise WorkerError(
            "PATH_OUTSIDE_ALLOWED_ROOT",
            "backupRoot 含 .. 段（拒绝越界）: %s" % backup_root,
        )
    if not job_id or not isinstance(job_id, str):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "jobId 缺失或非法")
    if not draft_name or not isinstance(draft_name, str):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "draftName 缺失或非法")
    for label, value in (("jobId", job_id), ("draftName", draft_name)):
        if any(ch in value for ch in ("/", "\\", "..", ".")) or not value.strip():
            raise WorkerError(
                "PATH_OUTSIDE_ALLOWED_ROOT",
                "%s 不是简单标识符: %r" % (label, value),
            )

    br = _norm(backup_root)
    # backupRoot 不得在 stagingRoot 内
    if is_within(staging_root, br):
        raise WorkerError(
            "PATH_OUTSIDE_ALLOWED_ROOT",
            "backupRoot 位于 stagingRoot 内（备份必须独立于 staging）: %s" % br,
        )
    # backupRoot 不得在官方草稿目录内
    if official_draft_root:
        if is_within(official_draft_root, br):
            raise WorkerError(
                "PATH_OUTSIDE_ALLOWED_ROOT",
                "backupRoot 位于剪映官方草稿目录内（禁止写入官方草稿区）: %s" % br,
            )

    backup_dir = os.path.join(br, job_id, draft_name)
    real = _norm(backup_dir)
    if not is_within(br, real):
        raise WorkerError("PATH_OUTSIDE_ALLOWED_ROOT", "备份目录符号链接逃逸: %s" % backup_dir)
    return real

