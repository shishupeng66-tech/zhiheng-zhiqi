# -*- coding: utf-8 -*-
"""Worker 主流程 —— 单次 Job 处理（Phase C.1 增强）。

流程：
  读 stdin(UTF-8) → 解析 Job → 契约校验 → 目标存在性检查
  → PJD 来源验证（ZHIHENG_PJD_ROOT + commit 锁定）
  → 创建 staging → PJD 生成草稿 → 草稿结构核验
  → failOnWarning 检查 → backupPlaintext 备份 → 原子发布
  → stdout 输出唯一 Result JSON

协议：
- stdout 只输出单个机器可解析的 Result JSON
- 普通日志写 stderr / <logDir>/<jobId>/job.log，不污染 stdout
- 失败/超时只清理本次创建并记录的 staging 目录，绝不清理既有目录
- 目标草稿目录已存在 → TARGET_ALREADY_EXISTS，绝不覆盖
- backupPlaintext / failOnWarning 为真实行为（非仅 contract 字段）
- Result/validationReport 写入实际加载的 PJD commit/version
"""

import hashlib
import datetime
import json
import os
import shutil
import sys
import time
import traceback

from .contract import CONTRACT_VERSION, validate_job, validate_result
from .errors import WorkerError, WorkerError as _WE  # noqa: F401  # 兼容导入
from .pjd_bridge import build_draft, repair_registration_paths
from .draft_validator import validate_draft_dir
from .pjd_source import verify_pjd_source
from .path_safety import resolve_backup_path
from .logger import JobLogger


class JobRunner:
    """单 Job 执行器。"""

    def __init__(self, job):
        self.job = job
        self.created_dirs = []
        self.logger = JobLogger(job.get("logDir"), job.get("jobId", "unknown"))

    # ---------------- 内部工具 ----------------

    def _mkdir(self, path):
        """创建目录并记录（供失败清理）。已存在时不重复记录。"""
        if not os.path.isdir(path):
            os.makedirs(path, exist_ok=True)
            self.created_dirs.append(path)
        return path

    def _cleanup(self):
        """失败清理：只删除本次创建并记录的目录（最深层优先）。"""
        for d in sorted(self.created_dirs, key=len, reverse=True):
            try:
                if os.path.isdir(d):
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:  # noqa: BLE001
                pass

    # ---------------- 主流程 ----------------

    def run(self):
        """执行 Job，返回 Result dict（不抛出）。"""
        job_id = self.job.get("jobId", "unknown")
        start_ts = time.time()
        staging_root = self.job["stagingRoot"]
        output_draft_dir = self.job["outputDraftDir"]
        draft_name = self.job["draft"]["name"]
        options = self.job.get("options", {})
        backup_plaintext = bool(options.get("backupPlaintext", False))
        fail_on_warning = bool(options.get("failOnWarning", False))

        self.logger.open()

        try:
            # 1. 目标草稿目录已存在 → 不覆盖
            if os.path.exists(output_draft_dir):
                return self._finish(
                    job_id, start_ts, staging_root, output_draft_dir,
                    "TARGET_ALREADY_EXISTS",
                    "目标草稿目录已存在，不覆盖: %s" % output_draft_dir,
                )

            # 2. 创建 staging 根（已存在且非空 → 报错，避免污染）
            if os.path.exists(staging_root):
                if os.listdir(staging_root):
                    return self._finish(
                        job_id, start_ts, staging_root, output_draft_dir,
                        "DRAFT_WRITE_FAIL",
                        "stagingRoot 已存在且非空: %s" % staging_root,
                    )
            else:
                self._mkdir(staging_root)

            # 3. PJD 来源验证（Phase C.2：完整 commit + 源码干净度 + module.__file__）
            try:
                pjd_meta = verify_pjd_source()
            except WorkerError as we:
                return self._finish(
                    job_id, start_ts, staging_root, output_draft_dir,
                    we.code, we.message,
                )

            # 4. backupRoot 校验（Phase C.2：独立于 staging / 官方草稿目录）
            backup_dir = None
            if backup_plaintext:
                try:
                    backup_dir = resolve_backup_path(
                        self.job["backupRoot"], job_id, draft_name,
                        staging_root, self.job.get("officialDraftRoot"),
                    )
                except WorkerError as we:
                    return self._finish(
                        job_id, start_ts, staging_root, output_draft_dir,
                        we.code, we.message,
                    )
                # 同 jobId / 同 draftName 已有备份 → 不覆盖既有备份
                if os.path.isdir(backup_dir) and os.listdir(backup_dir):
                    return self._finish(
                        job_id, start_ts, staging_root, output_draft_dir,
                        "TARGET_ALREADY_EXISTS",
                        "备份目录已存在（同 jobId/同 draftName 不覆盖既有备份）: %s" % backup_dir,
                    )

            # 5. PJD 生成草稿（写入 staging_root/draftName）
            built = build_draft(self.job, staging_root)
            draft_dir = built["draftDir"]

            # 6. 草稿结构核验
            expected_video = len(self.job["timeline"].get("videoTrack", []))
            checks = validate_draft_dir(draft_dir, expected_video_segments=expected_video)
            checks_passed = all(c["ok"] for c in checks)
            if not checks_passed:
                return self._finish(
                    job_id, start_ts, staging_root, output_draft_dir,
                    "DRAFT_WRITE_FAIL",
                    "草稿结构核验失败: %s" % json.dumps([c for c in checks if not c["ok"]], ensure_ascii=False),
                )

            warnings = list(built["warnings"])
            warnings.extend(pjd_meta.get("warnings", []))  # 未跟踪同名模块等警告

            # 7. failOnWarning：发布前检查，有 warning 即失败（不产生正式草稿）
            if fail_on_warning and warnings:
                self._cleanup()
                return self._finish(
                    job_id, start_ts, staging_root, output_draft_dir,
                    "FAIL_ON_WARNING",
                    "failOnWarning=true 且存在 %d 个 warning: %s"
                    % (len(warnings), "; ".join(warnings)),
                )

            # 8. backupPlaintext：发布前备份明文（实际生成文件清单为准），生成 manifest
            backup_manifest_path = None
            if backup_plaintext:
                backup_manifest_path = self._backup_plaintext(
                    draft_dir, backup_dir, pjd_meta,
                )

            # 9. 原子发布：staging_root/draftName → outputDraftDir
            os.rename(draft_dir, output_draft_dir)
            if os.path.exists(os.path.join(staging_root, "subtitle_tmp.srt")):
                os.remove(os.path.join(staging_root, "subtitle_tmp.srt"))

            # 9.1 高版本 fork 注册路径校正（staging → output），否则剪映按注册路径找不到草稿
            repair_warnings, _repair_ok = repair_registration_paths(
                draft_name, staging_root, output_draft_dir,
            )
            warnings.extend(repair_warnings)  # 校正失败已计入 warnings → manualReviewRequired

            # 10. 成功发布后清理本次 staging（仅当为空；备份已在 backupRoot，不随 staging 清理）
            staging_clean = True
            try:
                if os.path.isdir(staging_root) and not os.listdir(staging_root):
                    os.rmdir(staging_root)
            except OSError as exc:  # noqa: BLE001
                staging_clean = False
                warnings.append("staging 清理失败（不影响发布）: %s" % exc)
            # 11. 成功 Result
            manual_review = bool(warnings) or (fail_on_warning and warnings)
            result = {
                "contractVersion": CONTRACT_VERSION,
                "jobId": job_id,
                "ok": True,
                "draftDir": output_draft_dir,
                "duration": built["duration"],
                "tracks": built["tracks"],
                "warnings": warnings,
                "manualReviewRequired": manual_review,
                "validationReport": {
                    "fileCount": self._count_files(output_draft_dir),
                    "hasDraftContent": self._has(output_draft_dir, "draft_content.json"),
                    "hasDraftMetaInfo": self._has(output_draft_dir, "draft_meta_info.json"),
                    "hasDraftInfo": self._has(output_draft_dir, "draft_info.json"),
                    "duration": built["duration"],
                    "passed": True,
                    "checks": checks,
                    "pjdCommit": pjd_meta.get("actualCommit"),
                    "pjdVersion": pjd_meta.get("packageVersion"),
                    "pjdSource": {
                        "expectedCommit": pjd_meta.get("expectedCommit"),
                        "actualCommit": pjd_meta.get("actualCommit"),
                        "repositoryRemote": pjd_meta.get("repositoryRemote"),
                        "moduleFile": pjd_meta.get("moduleFile"),
                        "sourceDirty": bool(pjd_meta.get("sourceDirty")),
                        "packageVersion": pjd_meta.get("packageVersion"),
                        "pythonVersion": pjd_meta.get("pythonVersion"),
                    },
                    "logFile": self.logger.log_file,
                    "backupManifest": backup_manifest_path,
                },
            }
            # 日志写失败必须暴露，不能无声
            if self.logger.has_write_failures():
                result["warnings"] = result["warnings"] + [
                    "Worker 日志写入失败: %s" % self.logger.failure_summary()
                ]
                result["manualReviewRequired"] = True
            self.logger.write(
                event="job_completed", ok=True, duration_s=round(time.time() - start_ts, 3),
                exit_code=0, pjd_commit=pjd_meta.get("actualCommit"),
                staging=staging_root, output=output_draft_dir,
                backup_dir=backup_dir, backup_manifest=backup_manifest_path,
                staging_clean=staging_clean, warnings=warnings,
                log_write_failed=self.logger.has_write_failures(),
            )
            validate_result(result)
            return result

        except WorkerError as we:
            self._cleanup()
            return self._finish(job_id, start_ts, staging_root, output_draft_dir, we.code, we.message)
        except Exception as exc:  # noqa: BLE001
            self._cleanup()
            traceback.print_exc(file=sys.stderr)
            return self._finish(job_id, start_ts, staging_root, output_draft_dir, "PJD_ERROR", "Worker 内部错误: %s" % exc)

    def _backup_plaintext(self, draft_dir, backup_dir, pjd_meta):
        """复制草稿目录内**实际存在**的明文文件到备份目录，并生成 plaintext-backup-manifest.json。

        不再写死"明文五件套"：以实际生成文件清单为准（当前 PJD 生成
        draft_content.json / draft_meta_info.json；未来新增文件由 manifest 如实记录）。

        返回 manifest 文件路径。
        """
        self._mkdir(backup_dir)
        copied = []
        # 只复制草稿根下的明文 JSON / 文本类文件（不含子目录运行时产物）
        for name in sorted(os.listdir(draft_dir)):
            src = os.path.join(draft_dir, name)
            if not os.path.isfile(src):
                continue
            if not name.endswith((".json", ".srt", ".txt")):
                continue
            dst = os.path.join(backup_dir, name)
            try:
                shutil.copy2(src, dst)
                copied.append({
                    "name": name,
                    "size": os.path.getsize(dst),
                    "sha256": _sha256_file(dst),
                })
            except OSError as exc:
                self.logger.write(event="backup_plaintext_copy_failed", file=name, error=str(exc))

        manifest = {
            "schema": "plaintext-backup-manifest.v1",
            "jobId": self.job.get("jobId"),
            "draftName": self.job["draft"]["name"],
            "createdAt": datetime.datetime.now().astimezone().isoformat(),
            "contractVersion": CONTRACT_VERSION,
            "timelineSchemaVersion": self.job.get("timelineSchemaVersion"),
            "pjdCommit": pjd_meta.get("actualCommit"),
            "pjdVersion": pjd_meta.get("packageVersion"),
            "files": copied,
        }
        manifest_path = os.path.join(backup_dir, "plaintext-backup-manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        return manifest_path

    @staticmethod
    def _count_files(draft_dir):
        n = 0
        for root, _dirs, files in os.walk(draft_dir):
            n += len(files)
        return n

    @staticmethod
    def _has(draft_dir, name):
        return os.path.isfile(os.path.join(draft_dir, name))

    def _finish(self, job_id, start_ts, staging_root, output_draft_dir, code, message):
        """统一失败出口：写日志 + 构造失败 Result。"""
        self.logger.write(
            event="job_failed", ok=False, duration_s=round(time.time() - start_ts, 3),
            error_code=code, error_message=message,
            staging=staging_root, output=output_draft_dir,
            log_write_failed=self.logger.has_write_failures(),
        )
        result = {
            "contractVersion": CONTRACT_VERSION,
            "jobId": job_id,
            "ok": False,
            "warnings": [],
            "manualReviewRequired": False,
            "validationReport": {
                "fileCount": 0,
                "hasDraftContent": False,
                "hasDraftMetaInfo": False,
                "hasDraftInfo": False,
                "duration": 0,
                "passed": False,
                "checks": [],
                "logFile": self.logger.log_file,
            },
            "error": {"code": code, "message": message},
        }
        if self.logger.has_write_failures():
            result["warnings"] = ["Worker 日志写入失败: %s" % self.logger.failure_summary()]
            result["manualReviewRequired"] = True
        validate_result(result)
        return result


def run_job_from_stdin():
    """从 stdin 读取 Job 并执行，stdout 输出唯一 Result JSON。"""
    raw = sys.stdin.read()
    try:
        job = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        _emit(_protocol_fail("unknown", "JOB_INVALID", "stdin 非合法 JSON: %s" % exc))
        return

    try:
        job_id = validate_job(job)
    except WorkerError as we:
        _emit(_protocol_fail("unknown", we.code, we.message))
        return

    runner = JobRunner(job)
    _emit(runner.run())


def _protocol_fail(job_id, code, message):
    """协议级失败：输出完整 Result 结构（含 contractVersion/jobId）。"""
    return {
        "contractVersion": CONTRACT_VERSION,
        "jobId": job_id,
        "ok": False,
        "warnings": [],
        "manualReviewRequired": False,
        "validationReport": {
            "fileCount": 0,
            "hasDraftContent": False,
            "hasDraftMetaInfo": False,
            "hasDraftInfo": False,
            "duration": 0,
            "passed": False,
            "checks": [],
        },
        "error": {"code": code, "message": message},
    }


def _emit(result):
    """stdout 输出唯一 Result JSON（UTF-8）。"""
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _sha256_file(path):
    """计算文件 SHA-256（分块读取，适配大文件）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
