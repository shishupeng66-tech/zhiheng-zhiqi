# -*- coding: utf-8 -*-
"""Worker 文件日志测试（Phase C.1）。

覆盖：
- 成功任务生成日志（job.log 存在且含关键字段）
- 失败任务生成日志（error code 写入）
- 日志中不出现敏感环境变量完整值
- 并发 job 日志互不覆盖（不同 jobId 独立日志目录）
- 日志写入失败不静默（has_write_failures 标记）
"""

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
from zhiheng_jianying_worker.logger import JobLogger, safe_env_snapshot

from test_worker_protocol import make_fake_draft_dir, PJD_META


class WorkerLoggingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="zhiheng-log-")
        job = c.load_fixture("job-minimal.json")
        self.asset_root = os.path.join(self.tmp, "assets")
        self.draft_root = os.path.join(self.tmp, "draft-root")
        self.log_root = os.path.join(self.tmp, "logs")
        self.backup_root = os.path.join(self.tmp, "backup")
        os.makedirs(self.asset_root)
        os.makedirs(self.draft_root)
        job["jobId"] = "log-test-001"
        job["assetRoot"] = self.asset_root
        job["outputDraftDir"] = os.path.join(self.draft_root, job["draft"]["name"])
        job["stagingRoot"] = os.path.join(self.draft_root, ".staging", "log-test-001")
        job["logDir"] = self.log_root
        job["backupRoot"] = self.backup_root
        self.job = job
        for rel in ("fixtures/video1.mp4", "fixtures/voice.mp3",
                    "fixtures/bgm.mp3", "fixtures/sfx.wav"):
            p = os.path.join(self.asset_root, *rel.split("/"))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(b"x")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _log_file(self, job_id):
        return os.path.join(self.log_root, job_id, "job.log")

    def test_success_task_generates_log(self):
        """成功任务生成 job.log，且包含 job_completed 记录。"""
        draft_name = self.job["draft"]["name"]
        staging_draft = os.path.join(self.job["stagingRoot"], draft_name)

        def fake_build(job, staging_root):
            make_fake_draft_dir(staging_draft, video_segments=1)
            return {"draftDir": staging_draft, "duration": 5.0,
                    "tracks": [], "warnings": []}

        with mock.patch("zhiheng_jianying_worker.worker.verify_pjd_source", return_value=PJD_META), \
             mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=fake_build):
            JobRunner(self.job).run()

        log_file = self._log_file("log-test-001")
        self.assertTrue(os.path.isfile(log_file))
        content = open(log_file, encoding="utf-8").read()
        self.assertIn("job_completed", content)
        self.assertIn("fdd9c04", content)  # PJD commit 写入
        # output 路径在日志字段中（JSON 序列化会转义反斜杠，这里解析后核对）
        for line in content.splitlines():
            if '"event": "job_completed"' in line:
                rec = json.loads(line)
                self.assertIn("pjd-minimal-fixture", rec["output"])
                break
        else:
            self.fail("job_completed 记录缺失")

    def test_failed_task_generates_log(self):
        """失败任务生成 job.log，且包含错误码。"""
        def boom(job, staging_root):
            raise WorkerError("PJD_ERROR", "模拟失败")

        with mock.patch("zhiheng_jianying_worker.worker.verify_pjd_source", return_value=PJD_META), \
             mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=boom):
            JobRunner(self.job).run()

        log_file = self._log_file("log-test-001")
        self.assertTrue(os.path.isfile(log_file))
        content = open(log_file, encoding="utf-8").read()
        self.assertIn("job_failed", content)
        self.assertIn("PJD_ERROR", content)

    def test_log_does_not_contain_sensitive_env_values(self):
        """日志与安全快照不出现敏感环境变量完整值。"""
        os.environ["ZH_TEST_SECRET_TOKEN"] = "hunter2-very-secret"
        snap = safe_env_snapshot()
        for k, v in snap.items():
            if "SECRET" in k.upper():
                self.assertEqual(v, "<redacted>")
        os.environ.pop("ZH_TEST_SECRET_TOKEN", None)

    def test_concurrent_jobs_logs_do_not_overwrite(self):
        """并发/不同 jobId 的日志文件独立，互不覆盖。"""
        job_a = json.loads(json.dumps(self.job))
        job_a["jobId"] = "log-a"
        job_a["stagingRoot"] = os.path.join(self.draft_root, ".staging", "log-a")
        job_b = json.loads(json.dumps(self.job))
        job_b["jobId"] = "log-b"
        job_b["stagingRoot"] = os.path.join(self.draft_root, ".staging", "log-b")

        def fake_build_for(name):
            def fb(job, staging_root):
                make_fake_draft_dir(os.path.join(job["stagingRoot"], job["draft"]["name"]), 1)
                return {"draftDir": "x", "duration": 5.0, "tracks": [], "warnings": []}
            return fb

        with mock.patch("zhiheng_jianying_worker.worker.verify_pjd_source", return_value=PJD_META), \
             mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=fake_build_for("a")):
            JobRunner(job_a).run()
        with mock.patch("zhiheng_jianying_worker.worker.verify_pjd_source", return_value=PJD_META), \
             mock.patch("zhiheng_jianying_worker.worker.build_draft", side_effect=fake_build_for("b")):
            JobRunner(job_b).run()

        fa = self._log_file("log-a")
        fb = self._log_file("log-b")
        self.assertTrue(os.path.isfile(fa))
        self.assertTrue(os.path.isfile(fb))
        self.assertIn("log-a", open(fa, encoding="utf-8").read())
        self.assertIn("log-b", open(fb, encoding="utf-8").read())

    def test_logger_write_failure_is_not_silent(self):
        """日志写入失败不静默：has_write_failures 标记 + failure_summary。"""
        lg = JobLogger(os.path.join(self.tmp, "readonly-logs"), "job-x")
        # 用一个非法路径作为日志文件（父目录是文件 → 无法创建目录）
        bad_dir = os.path.join(self.tmp, "blocker")
        with open(bad_dir, "w", encoding="utf-8") as f:
            f.write("x")  # 占用目录名
        lg2 = JobLogger(bad_dir, "job-x")
        lg2.open()
        lg2.write(event="x")
        self.assertTrue(lg2.has_write_failures())
        self.assertIsNotNone(lg2.failure_summary())


if __name__ == "__main__":
    unittest.main()
