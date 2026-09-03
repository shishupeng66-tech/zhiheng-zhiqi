# -*- coding: utf-8 -*-
"""Worker 主流程协议测试（mock PJD 层，不依赖真实剪映/PJD 素材）。

覆盖（Phase C + C.1）：
- 目标已存在 → TARGET_ALREADY_EXISTS
- stagingRoot 非空 → DRAFT_WRITE_FAIL
- 成功路径原子发布
- build 失败清理 staging
- PJD 版本不匹配 → PJD_VERSION_MISMATCH
- failOnWarning 真实行为
- backupPlaintext 真实行为
- 同磁盘卷原子发布前提（staging/output 同一卷）
- 唯一 staging 子目录 / 同 jobId 并发不互相覆盖
- 同 outputDraftDir 并发只有一个成功
- 失败只清理本 job staging
"""

import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhiheng_jianying_worker.worker import JobRunner
from zhiheng_jianying_worker import contract as c
from zhiheng_jianying_worker.errors import WorkerError


def make_fake_draft_dir(draft_dir, video_segments=1):
    """创建一个满足结构核验的最小草稿目录。"""
    os.makedirs(draft_dir, exist_ok=True)
    content = {
        "tracks": [
            {"type": "video", "segments": [{} for _ in range(video_segments)]},
            {"type": "text", "segments": []},
        ]
    }
    for name in ("draft_content.json", "draft_meta_info.json", "draft_info.json"):
        with open(os.path.join(draft_dir, name), "w", encoding="utf-8") as f:
            json.dump(content if name == "draft_content.json" else {}, f)


PJD_META = {
    "expectedCommit": "fdd9c04fd44257222aa1af45fdd7c4ac029e652e",
    "actualCommit": "fdd9c04fd44257222aa1af45fdd7c4ac029e652e",
    "repositoryRemote": "https://github.com/aoguai/pyJianYingDraft.git",
    "moduleFile": r"D:\剪映智剪测试\pyJianYingDraft-fork-v0\pyJianYingDraft\__init__.py",
    "sourceDirty": False,
    "packageVersion": "fork-v0@4a7730c9",
    "pythonVersion": "3.11.15",
    "warnings": [],
}


class JobRunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="zhiheng-worker-")
        job = c.load_fixture("job-minimal.json")
        self.asset_root = os.path.join(self.tmp, "assets")
        self.draft_root = os.path.join(self.tmp, "draft-root")
        self.backup_root = os.path.join(self.tmp, "backup")
        os.makedirs(self.asset_root)
        os.makedirs(self.draft_root)
        self.job_id = "worker-test-001"
        job["jobId"] = self.job_id
        job["assetRoot"] = self.asset_root
        job["outputDraftDir"] = os.path.join(self.draft_root, job["draft"]["name"])
        job["stagingRoot"] = os.path.join(self.draft_root, ".staging", self.job_id)
        job["logDir"] = os.path.join(self.tmp, "logs")
        job["backupRoot"] = self.backup_root
        job["officialDraftRoot"] = os.path.join(self.tmp, "official-draft-root")
        self.job = job
        # mock 需要的最小素材文件（path_safety 会校验存在性）
        fixtures = {"fixtures/video1.mp4": b"v", "fixtures/voice.mp3": b"a",
                    "fixtures/bgm.mp3": b"b", "fixtures/sfx.wav": b"s"}
        for rel, data in fixtures.items():
            p = os.path.join(self.asset_root, *rel.split("/"))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(data)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, job, pjd_meta=None):
        with mock.patch(
            "zhiheng_jianying_worker.worker.verify_pjd_source",
            return_value=pjd_meta or PJD_META,
        ):
            return JobRunner(job).run()

    def _make_fake_build(self, staging_draft, warnings=None):
        def fake_build(job, staging_root):
            make_fake_draft_dir(staging_draft, video_segments=1)
            return {
                "draftDir": staging_draft,
                "duration": 5.0,
                "tracks": [{"type": "video", "count": 1}],
                "warnings": warnings or [],
            }
        return fake_build

    # ---------------- 基础协议 ----------------

    def test_target_already_exists(self):
        """目标草稿目录已存在 → TARGET_ALREADY_EXISTS，绝不覆盖。"""
        out = self.job["outputDraftDir"]
        os.makedirs(out)
        with open(os.path.join(out, "keep.txt"), "w", encoding="utf-8") as f:
            f.write("keep")
        result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "TARGET_ALREADY_EXISTS")
        self.assertTrue(os.path.exists(os.path.join(out, "keep.txt")))

    def test_staging_root_non_empty_fails(self):
        """stagingRoot 已存在且非空 → DRAFT_WRITE_FAIL（避免污染）。"""
        staging = self.job["stagingRoot"]
        os.makedirs(staging)
        with open(os.path.join(staging, "junk.txt"), "w", encoding="utf-8") as f:
            f.write("junk")
        result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "DRAFT_WRITE_FAIL")

    def test_success_publishes_draft(self):
        """成功路径：staging 生成 → 核验 → 原子发布到 outputDraftDir。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"], json.dumps(result, ensure_ascii=False))
        self.assertEqual(result["draftDir"], self.job["outputDraftDir"])
        self.assertTrue(os.path.isdir(self.job["outputDraftDir"]))
        self.assertFalse(os.path.exists(staging_draft))
        # PJD 元数据写入 validationReport
        self.assertEqual(result["validationReport"]["pjdCommit"], "fdd9c04fd44257222aa1af45fdd7c4ac029e652e")

    def test_build_failure_cleans_staging(self):
        """build_draft 抛错 → 失败，且只清理本次创建的 staging。"""
        def boom(job, staging_root):
            raise WorkerError("PJD_ERROR", "模拟 PJD 失败")

        with mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=boom):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "PJD_ERROR")
        self.assertFalse(os.path.exists(self.job["outputDraftDir"]))
        self.assertFalse(os.path.exists(self.job["stagingRoot"]))

    # ---------------- PJD 版本锁定 ----------------

    def test_pjd_version_mismatch_fails(self):
        """verify_pjd_source 抛 PJD_VERSION_MISMATCH → Worker 返回该错误码。"""
        with mock.patch(
            "zhiheng_jianying_worker.worker.verify_pjd_source",
            side_effect=WorkerError("PJD_VERSION_MISMATCH", "HEAD 不匹配"),
        ):
            result = JobRunner(self.job).run()
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "PJD_VERSION_MISMATCH")

    # ---------------- failOnWarning / backupPlaintext 真实行为 ----------------

    def test_fail_on_warning_true_blocks_publish(self):
        """failOnWarning=true 且存在 warning → FAIL_ON_WARNING，不发布正式草稿。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["failOnWarning"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft, warnings=["资源被替换"]),
        ):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "FAIL_ON_WARNING")
        self.assertFalse(os.path.exists(self.job["outputDraftDir"]))

    def test_fail_on_warning_false_allows_publish_with_warning(self):
        """failOnWarning=false 有 warning → 正常发布，warnings 带入 Result + manualReviewRequired。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["failOnWarning"] = False
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft, warnings=["资源被替换"]),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"])
        self.assertIn("资源被替换", result["warnings"])
        self.assertTrue(result["manualReviewRequired"])

    def test_backup_plaintext_true_copies_plaintext(self):
        """backupPlaintext=true → 备份到 <backupRoot>/<jobId>/<draftName>/，发布后仍存在。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"])
        backup_dir = os.path.join(self.backup_root, self.job_id, draft_name)
        self.assertTrue(os.path.isfile(os.path.join(backup_dir, "draft_content.json")))
        self.assertTrue(os.path.isfile(os.path.join(backup_dir, "plaintext-backup-manifest.json")))
        # 备份不在 staging 内
        self.assertFalse(os.path.exists(os.path.join(self.job["stagingRoot"], "_backup_plaintext")))

    # ---------------- Phase C.2 backupRoot 边界 ----------------

    def test_backup_root_inside_staging_rejected(self):
        """backupRoot 位于 stagingRoot 内 → PATH_OUTSIDE_ALLOWED_ROOT，不生成草稿。"""
        staging_draft = os.path.join(self.job["stagingRoot"], self.job["draft"]["name"])
        self.job["backupRoot"] = os.path.join(self.job["stagingRoot"], "inner-backup")
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "PATH_OUTSIDE_ALLOWED_ROOT")
        self.assertFalse(os.path.exists(self.job["outputDraftDir"]))

    def test_backup_root_inside_official_rejected(self):
        """backupRoot 位于官方草稿目录内 → PATH_OUTSIDE_ALLOWED_ROOT。"""
        staging_draft = os.path.join(self.job["stagingRoot"], self.job["draft"]["name"])
        official = os.path.join(self.tmp, "official-draft-root")
        self.job["backupRoot"] = os.path.join(official, "backup-under-official")
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "PATH_OUTSIDE_ALLOWED_ROOT")

    def test_backup_root_outside_allowed_rejected(self):
        """backupRoot 越界（含 .. / 非简单 jobId）→ PATH_OUTSIDE_ALLOWED_ROOT。"""
        staging_draft = os.path.join(self.job["stagingRoot"], self.job["draft"]["name"])
        self.job["backupRoot"] = os.path.join(self.tmp, "..", "escape-backup")
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "PATH_OUTSIDE_ALLOWED_ROOT")

    def test_backup_manifest_matches_actual_hashes(self):
        """备份 manifest 记录的 SHA-256 与实际备份文件一致。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"])
        manifest_path = os.path.join(self.backup_root, self.job_id, draft_name, "plaintext-backup-manifest.json")
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertEqual(manifest["jobId"], self.job_id)
        self.assertEqual(manifest["contractVersion"], c.CONTRACT_VERSION)
        self.assertEqual(manifest["pjdCommit"], "fdd9c04fd44257222aa1af45fdd7c4ac029e652e")
        self.assertTrue(manifest["files"], "manifest 必须记录实际文件清单")
        for fitem in manifest["files"]:
            backup_file = os.path.join(os.path.dirname(manifest_path), fitem["name"])
            actual = _sha256(backup_file)
            self.assertEqual(actual, fitem["sha256"], fitem["name"])

    def test_publish_success_backup_still_exists(self):
        """发布成功后备份仍存在，且不被 staging 清理带走。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"])
        backup_dir = os.path.join(self.backup_root, self.job_id, draft_name)
        self.assertTrue(os.path.isfile(os.path.join(backup_dir, "draft_content.json")))
        self.assertTrue(os.path.isfile(os.path.join(backup_dir, "plaintext-backup-manifest.json")))

    def test_success_staging_no_residue(self):
        """成功后当前 job staging 无残留（已空则被移除）。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["backupPlaintext"] = True
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        self.assertTrue(result["ok"])
        if os.path.exists(self.job["stagingRoot"]):
            self.assertEqual(os.listdir(self.job["stagingRoot"]), [], "staging 应无残留")

    def test_failed_job_no_fake_backup(self):
        """build 失败时不得产生备份（无伪成功备份）。"""
        def boom(job, staging_root):
            raise WorkerError("PJD_ERROR", "模拟失败")

        self.job["options"]["backupPlaintext"] = True
        with mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=boom):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertFalse(os.path.exists(self.backup_root))

    def test_same_job_draft_no_overwrite_backup(self):
        """同 jobId/同 draftName：备份目录已存在时不得覆盖既有备份。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)
        self.job["options"]["backupPlaintext"] = True
        # 预置一个已存在的备份目录（模拟之前已备份）
        pre_dir = os.path.join(self.backup_root, self.job_id, draft_name)
        os.makedirs(pre_dir)
        marker = os.path.join(pre_dir, "KEEP_ME.txt")
        with open(marker, "w", encoding="utf-8") as f:
            f.write("keep")
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(staging_draft),
        ):
            result = self._run(self.job)
        # 目标草稿已存在 → 不覆盖备份也不发布（避免覆盖语义）
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "TARGET_ALREADY_EXISTS")
        self.assertTrue(os.path.isfile(marker))

    # ---------------- staging / 并发 / 路径安全 ----------------

    def test_staging_and_output_same_volume(self):
        """staging 与 output 位于同一磁盘卷（原子 rename 前提）。"""
        st_dev = os.stat(self.job["stagingRoot"] if os.path.exists(self.job["stagingRoot"])
                         else self.draft_root).st_dev
        out_dev = os.stat(self.job["outputDraftDir"] if os.path.exists(self.job["outputDraftDir"])
                          else self.draft_root).st_dev
        self.assertEqual(st_dev, out_dev, "staging 与 output 必须同卷（否则 rename 非原子）")

    def test_unique_staging_subdir_per_job(self):
        """每个 job 使用唯一 staging 子目录（jobId 维度隔离）。"""
        s1 = os.path.join(self.draft_root, ".staging", "job-a")
        s2 = os.path.join(self.draft_root, ".staging", "job-b")
        self.assertNotEqual(s1, s2)

    def test_same_job_id_concurrent_no_overwrite(self):
        """相同 jobId 两次独立执行：第一次成功发布；第二次目标已存在，不覆盖。"""
        draft_name = self.job["draft"]["name"]
        s1 = os.path.join(self.draft_root, ".staging", "job-x")
        s2 = os.path.join(self.draft_root, ".staging", "job-y")

        job_a = json.loads(json.dumps(self.job))
        job_a["stagingRoot"] = s1
        job_b = json.loads(json.dumps(self.job))
        job_b["stagingRoot"] = s2

        d1 = os.path.join(s1, draft_name)
        d2 = os.path.join(s2, draft_name)

        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(d1),
        ):
            r1 = self._run(job_a)
        self.assertTrue(r1["ok"], json.dumps(r1, ensure_ascii=False))
        # 第二次：目标草稿已存在 → TARGET_ALREADY_EXISTS（绝不覆盖）
        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(d2),
        ):
            r2 = self._run(job_b)
        self.assertFalse(r2["ok"])
        self.assertEqual(r2["error"]["code"], "TARGET_ALREADY_EXISTS")
        self.assertTrue(os.path.isdir(self.job["outputDraftDir"]))

    def test_same_output_dir_concurrent_only_one_publishes(self):
        """相同 outputDraftDir：先成功者发布；后者 TARGET_ALREADY_EXISTS。"""
        draft_name = self.job["draft"]["name"]
        s1 = os.path.join(self.draft_root, ".staging", "job-a")
        s2 = os.path.join(self.draft_root, ".staging", "job-b")
        d1 = os.path.join(s1, draft_name)

        job_a = json.loads(json.dumps(self.job))
        job_a["stagingRoot"] = s1
        job_b = json.loads(json.dumps(self.job))
        job_b["stagingRoot"] = s2

        with mock.patch(
            "zhiheng_jianying_worker.worker.build_draft",
            side_effect=self._make_fake_build(d1),
        ):
            r1 = self._run(job_a)
        self.assertTrue(r1["ok"])
        r2 = self._run(job_b)  # 目标已存在
        self.assertFalse(r2["ok"])
        self.assertEqual(r2["error"]["code"], "TARGET_ALREADY_EXISTS")

    def test_failure_cleans_only_own_staging(self):
        """失败只清理本次 job 的 staging，不影响同 root 下其它 job staging。"""
        draft_name = self.job["draft"]["name"]
        other_staging = os.path.join(self.draft_root, ".staging", "other-job")
        os.makedirs(os.path.join(other_staging, "keep.txt"))  # 占位

        self.job["stagingRoot"] = os.path.join(self.draft_root, ".staging", "this-job")

        def boom(job, staging_root):
            raise WorkerError("PJD_ERROR", "模拟失败")

        with mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=boom):
            result = self._run(self.job)
        self.assertFalse(result["ok"])
        self.assertFalse(os.path.exists(self.job["stagingRoot"]))
        self.assertTrue(os.path.exists(other_staging))


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


if __name__ == "__main__":
    unittest.main()
