# -*- coding: utf-8 -*-
"""PJD 来源验证 —— 真正锁定 pyJianYingDraft（Phase C.2 加强）。

规则（Phase C.2）：
- 环境变量统一为 ZHIHENG_PJD_ROOT（不再使用 ZHIJING_PJD_ROOT）。
- PJD 通过本地 Git 仓库加载时：
    1. remote 规范化后必须精确等于 GuanYixuan/pyJianYingDraft（非宽松 substring）
    2. git rev-parse HEAD 必须等于完整 40 位锁定 commit（全量比较，不允许前缀/其他 commit）
    3. git status --porcelain --untracked-files=no 必须为空（已跟踪源码被修改/删除/新增到索引 → PJD_SOURCE_DIRTY）
    4. 实际导入的 pyJianYingDraft 模块 __file__ 必须位于 ZHIHENG_PJD_ROOT 内
       （防止从其他 site-packages / PYTHONPATH 加载另一份 PJD）
- 未跟踪的同名模块/目录（pyJianYingDraft.py / pyJianYingDraft/）会警告（不影响已跟踪源码完整性判断）；
  普通无关未跟踪文档仅记 warning，不影响通过。
- 版本不匹配 → PJD_VERSION_MISMATCH；源码被修改 → PJD_SOURCE_DIRTY。
- 错误码与返回字段均不泄露敏感环境变量。

不修改 D:\\剪映智剪测试\\pyJianYingDraft 仓库（只读校验）。
"""

import os
import re
import subprocess
import sys
from urllib.parse import urlparse

from .contract import (
    PJD_EXPECTED_COMMIT,
    PJD_PACKAGE_VERSION,
    PJD_REPOSITORY,
    PJD_ROOT_ENV,
)
from .errors import WorkerError


def _run_git(root, args):
    """在 PJD 仓库内执行 git 只读命令，返回 stdout（strip 后）。"""
    try:
        out = subprocess.check_output(
            ["git", "-C", root] + args,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "无法在 ZHIHENG_PJD_ROOT 执行 git 校验: %s" % exc,
        )
    return out.strip()


def _normalize_remote(remote):
    """把常见 https/ssh remote URL 规范化为 'owner/repo'（不含 .git / 协议 / 用户）。

    示例：
      https://github.com/GuanYixuan/pyJianYingDraft.git      -> GuanYixuan/pyJianYingDraft
      git@github.com:GuanYixuan/pyJianYingDraft.git          -> GuanYixuan/pyJianYingDraft
      ssh://git@github.com/GuanYixuan/pyJianYingDraft.git    -> GuanYixuan/pyJianYingDraft
      规范化失败返回 None。
    """
    if not remote:
        return None
    r = remote.strip()
    # 1) scp-like: user@host:path
    m = re.match(r"^(?:[^@/]+@)?[^/:]+:(.+)$", r)
    if m and not r.startswith(("http://", "https://", "ssh://", "git://", "file://")):
        path = m.group(1)
    else:
        # 2) URL 形态
        try:
            if "://" not in r:
                r = "ssh://" + r
            parsed = urlparse(r)
            path = parsed.path
        except Exception:  # noqa: BLE001
            return None
    path = path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    path = path.strip("/")
    if path.count("/") != 1:
        return None
    owner, repo = path.split("/")
    if not owner or not repo:
        return None
    return "%s/%s" % (owner, repo)


def _remote_matches(remote):
    """remote 规范化后必须精确等于锁定仓库 'GuanYixuan/pyJianYingDraft'。"""
    norm = _normalize_remote(remote)
    return norm == PJD_REPOSITORY


def _check_source_dirty(root):
    """检查已跟踪源码是否被修改/删除/新增到索引。

    返回 (dirty: bool, dirty_lines: [str])。
    git status --porcelain --untracked-files=no 只输出已跟踪文件的改动，
    普通未跟踪文档不会出现在此。
    """
    try:
        out = _run_git(root, ["status", "--porcelain", "--untracked-files=no"])
    except WorkerError:
        # 无法获取状态：保守视为 dirty，避免执行未确认源码
        return True, ["git status 无法执行"]
    lines = [ln for ln in out.splitlines() if ln.strip()]
    return bool(lines), lines


def _check_untracked_module_conflict(root):
    """检查未跟踪的同名模块/目录（可能影响包导入优先级）。

    返回 (conflict: bool, detail: str)。
    普通无关未跟踪文档不视为冲突。
    """
    try:
        out = _run_git(root, ["status", "--porcelain", "--untracked-files=all"])
    except WorkerError:
        return False, ""
    targets = ("pyJianYingDraft/", "pyJianYingDraft.py", "pyJianYingDraft")
    hits = []
    for ln in out.splitlines():
        line = ln.strip()
        # 未跟踪行形如 '?? path'
        if not line.startswith("?? "):
            continue
        rel = line[3:].strip().lstrip('"').rstrip('"')
        for t in targets:
            if rel == t or rel.startswith(t):
                hits.append(rel)
                break
    if hits:
        return True, "存在未跟踪同名模块/目录（可能影响包导入）: %s" % ", ".join(hits)
    return False, ""


def _check_module_file(root):
    """校验实际导入的 pyJianYingDraft 模块 __file__ 位于 ZHIHENG_PJD_ROOT 内。

    返回 module_file（绝对路径）；import 失败或文件在根外 → 抛 PJD_VERSION_MISMATCH。
    """
    # 兜底：移除旧版 editable finder，确保加载 ZHIHENG_PJD_ROOT 的 fork
    # （正式入口 __main__.py 与 pjd_bridge._import_pjd 已处理；此处再防 pytest/直接调用）
    sys.meta_path = [
        f for f in sys.meta_path
        if "__editable___pyjianyingdraft" not in (type(f).__module__ or "")
    ]
    try:
        import pyJianYingDraft as _draft
        module_file = getattr(_draft, "__file__", None)
    except Exception as exc:  # noqa: BLE001
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "无法导入 pyJianYingDraft（可能未从 ZHIHENG_PJD_ROOT 加载）: %s" % exc,
        )
    if not module_file:
        raise WorkerError("PJD_VERSION_MISMATCH", "pyJianYingDraft 无 __file__（非文件模块）")
    mf = os.path.realpath(os.path.abspath(module_file))
    root_real = os.path.realpath(os.path.abspath(root))
    if not (mf == root_real or mf.startswith(root_real + os.sep)):
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "pyJianYingDraft 模块 %s 位于 ZHIHENG_PJD_ROOT(%s) 之外（可能从其他 site-packages/PYTHONPATH 加载另一份 PJD）"
            % (mf, root_real),
        )
    return mf


def verify_pjd_source():
    """校验实际加载的 PJD 来源（Phase C.2 加强）。

    返回:
      {
        "expectedCommit": str,
        "actualCommit": str,
        "repositoryRemote": str,
        "moduleFile": str,
        "sourceDirty": bool,
        "packageVersion": str,
        "pythonVersion": str,
        "warnings": [str],
      }
    校验失败抛 WorkerError（PJD_VERSION_MISMATCH / PJD_SOURCE_DIRTY）。
    """
    root = os.environ.get(PJD_ROOT_ENV, "").strip()
    if not root:
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "环境变量 %s 未设置（必须指向 pyJianYingDraft Git 仓库根）" % PJD_ROOT_ENV,
        )
    git_dir = os.path.join(root, ".git")
    if not os.path.isdir(git_dir):
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "ZHIHENG_PJD_ROOT 不是 Git 仓库: %s" % root,
        )

    # 1. remote 精确匹配（规范化后 == GuanYixuan/pyJianYingDraft）
    remote = _run_git(root, ["remote", "get-url", "origin"])
    if not _remote_matches(remote):
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "PJD origin remote 与锁定仓库不一致: %r（规范化后须精确等于 %s）" % (remote, PJD_REPOSITORY),
        )

    # 2. HEAD 完整 40 位全量比较
    head = _run_git(root, ["rev-parse", "HEAD"])
    if head != PJD_EXPECTED_COMMIT:
        raise WorkerError(
            "PJD_VERSION_MISMATCH",
            "PJD HEAD=%s 与锁定完整 commit=%s 不匹配（必须全量相等，不允许前缀或其它 commit）"
            % (head, PJD_EXPECTED_COMMIT),
        )

    # 3. 已跟踪源码干净度
    dirty, dirty_lines = _check_source_dirty(root)
    if dirty:
        raise WorkerError(
            "PJD_SOURCE_DIRTY",
            "PJD 仓库存在已跟踪源码改动（%d 项）: %s"
            % (len(dirty_lines), "; ".join(dirty_lines[:8])),
        )

    # 4. 实际导入模块位置校验
    module_file = _check_module_file(root)

    # 5. 未跟踪同名模块警告（不影响通过）
    warnings = []
    conflict, detail = _check_untracked_module_conflict(root)
    if conflict:
        warnings.append(detail)

    return {
        "expectedCommit": PJD_EXPECTED_COMMIT,
        "actualCommit": head,
        "repositoryRemote": remote,
        "moduleFile": module_file,
        "sourceDirty": dirty,
        "packageVersion": PJD_PACKAGE_VERSION,
        "pythonVersion": "%s.%s.%s" % sys.version_info[:3],
        "warnings": warnings,
    }


def pjd_loaded_meta():
    """返回已加载 PJD 的元数据（供 Result/validationReport 写入）。失败返回 None。"""
    try:
        return verify_pjd_source()
    except WorkerError:
        return None
