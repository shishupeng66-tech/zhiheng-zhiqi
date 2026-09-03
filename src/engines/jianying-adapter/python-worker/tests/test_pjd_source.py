# -*- coding: utf-8 -*-
"""PJD 来源验证测试（Phase C.1 / C.2 / 高版本 fork 接入）。

真实 PJD 仓库位于 D:\\剪映智剪测试\\pyJianYingDraft-fork-v0
（高版本 fork aoguai/pyJianYingDraft @ 4a7730c9，本地锁定 commit fdd9c04d9...）。
若该路径不存在，相关"真实校验"用例跳过并提示（不伪造通过）。

Phase C.2 新增覆盖：
- 完整 40 位 commit 匹配（非前缀）
- 前缀相同但完整值不同必须失败
- 已跟踪源码被修改 → PJD_SOURCE_DIRTY
- remote 指向其他同名仓库必须失败
- 实际导入模块位于允许根目录外必须失败
- 未设置环境变量必须失败
- 错误码与字段不泄露敏感环境变量
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhiheng_jianying_worker import pjd_source as ps
from zhiheng_jianying_worker.contract import PJD_ROOT_ENV, PJD_EXPECTED_COMMIT
from zhiheng_jianying_worker.errors import WorkerError

REAL_PJD_ROOT = r"D:\剪映智剪测试\pyJianYingDraft-fork-v0"
FULL_COMMIT = "fdd9c04fd44257222aa1af45fdd7c4ac029e652e"


class PjdSourceTest(unittest.TestCase):
    def setUp(self):
        self._saved = os.environ.get(PJD_ROOT_ENV)
        os.environ.pop(PJD_ROOT_ENV, None)

    def tearDown(self):
        if self._saved is None:
            os.environ.pop(PJD_ROOT_ENV, None)
        else:
            os.environ[PJD_ROOT_ENV] = self._saved

    # ---------------- 基础 ----------------

    def test_env_not_set_raises_mismatch(self):
        with self.assertRaises(WorkerError) as ctx:
            ps.verify_pjd_source()
        self.assertEqual(ctx.exception.code, "PJD_VERSION_MISMATCH")

    def test_non_git_root_raises_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ[PJD_ROOT_ENV] = d
            with self.assertRaises(WorkerError) as ctx:
                ps.verify_pjd_source()
            self.assertEqual(ctx.exception.code, "PJD_VERSION_MISMATCH")

    def test_expected_commit_is_full_40(self):
        """锁定 commit 必须是完整 40 位（Phase C.2 全量比较前提）。"""
        self.assertEqual(len(PJD_EXPECTED_COMMIT), 40)
        self.assertTrue(all(ch in "0123456789abcdef" for ch in PJD_EXPECTED_COMMIT))

    # ---------------- Phase C.2 加强 ----------------

    def _fake_git(self, remote, head, status_porcelain=""):
        """构造一个 mock _run_git，按参数分发返回值。"""
        def side_effect(root, args):
            if args[:2] == ["remote", "get-url"]:
                return remote
            if args[:2] == ["rev-parse", "HEAD"]:
                return head
            if args[0] == "status":
                return status_porcelain
            raise AssertionError("未知 git 调用: %r" % args)
        return side_effect

    @unittest.skipUnless(
        os.path.isdir(os.path.join(REAL_PJD_ROOT, ".git")),
        "真实 PJD 仓库不存在，跳过真实校验用例",
    )
    def test_real_pjd_repo_verifies_full(self):
        """真实仓库：完整 commit 匹配 + 源码干净 + 模块位于 root 内。"""
        os.environ[PJD_ROOT_ENV] = REAL_PJD_ROOT
        meta = ps.verify_pjd_source()
        self.assertEqual(meta["actualCommit"], FULL_COMMIT)
        self.assertFalse(meta["sourceDirty"])
        self.assertTrue(meta["moduleFile"].lower().startswith(
            os.path.realpath(REAL_PJD_ROOT).lower()))
        self.assertEqual(meta["expectedCommit"], FULL_COMMIT)
        self.assertIn("aoguai/pyJianYingDraft", meta["repositoryRemote"])

    def test_prefix_same_but_full_diff_fails(self):
        """前缀相同但完整 commit 不同必须失败。"""
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, ".git"))
            os.environ[PJD_ROOT_ENV] = d
            other_full = "fdd9c04fd44257222aa1af45fdd7c4ac029e652f"  # 仅末位不同
            with mock.patch.object(
                ps, "_run_git",
                side_effect=self._fake_git(
                    "https://github.com/aoguai/pyJianYingDraft.git",
                    other_full,
                ),
            ):
                with self.assertRaises(WorkerError) as ctx:
                    ps.verify_pjd_source()
            self.assertEqual(ctx.exception.code, "PJD_VERSION_MISMATCH")
            self.assertIn("全量相等", ctx.exception.message)

    def test_tracked_source_dirty_fails(self):
        """已跟踪源码被修改 → PJD_SOURCE_DIRTY。"""
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, ".git"))
            os.environ[PJD_ROOT_ENV] = d
            with mock.patch.object(
                ps, "_run_git",
                side_effect=self._fake_git(
                    "https://github.com/aoguai/pyJianYingDraft.git",
                    FULL_COMMIT,
                    status_porcelain=" M pyJianYingDraft/foo.py",
                ),
            ):
                with self.assertRaises(WorkerError) as ctx:
                    ps.verify_pjd_source()
            self.assertEqual(ctx.exception.code, "PJD_SOURCE_DIRTY")

    def test_remote_other_same_name_repo_fails(self):
        """remote 指向其他同名仓库必须失败（精确 owner/repo 匹配）。"""
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, ".git"))
            os.environ[PJD_ROOT_ENV] = d
            with mock.patch.object(
                ps, "_run_git",
                side_effect=self._fake_git(
                    "https://github.com/SomeOtherUser/pyJianYingDraft.git",
                    FULL_COMMIT,
                ),
            ):
                with self.assertRaises(WorkerError) as ctx:
                    ps.verify_pjd_source()
            self.assertEqual(ctx.exception.code, "PJD_VERSION_MISMATCH")
            self.assertIn("精确等于", ctx.exception.message)

    def test_module_file_outside_root_fails(self):
        """实际导入模块位于允许根目录外必须失败。"""
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, ".git"))
            os.environ[PJD_ROOT_ENV] = d  # 临时根，而真实模块在 REAL_PJD_ROOT 下
            with mock.patch.object(
                ps, "_run_git",
                side_effect=self._fake_git(
                    "https://github.com/aoguai/pyJianYingDraft.git",
                    FULL_COMMIT,
                ),
            ):
                try:
                    ps.verify_pjd_source()
                    self.fail("应因模块在根外而失败")
                except WorkerError as exc:
                    self.assertEqual(exc.code, "PJD_VERSION_MISMATCH")
                    self.assertIn("之外", exc.message)

    def test_error_message_no_sensitive_env(self):
        """错误码/错误信息不得泄露敏感环境变量。"""
        os.environ["MY_TEST_API_KEY"] = "super-secret-xyz"
        os.environ[PJD_ROOT_ENV] = ""  # 未设置
        try:
            ps.verify_pjd_source()
            self.fail("应抛错")
        except WorkerError as exc:
            self.assertNotIn("super-secret-xyz", exc.message)
        os.environ.pop("MY_TEST_API_KEY", None)

    def test_untracked_module_conflict_detected(self):
        """未跟踪同名模块会被检测并返回 warning（不影响已跟踪源码完整性判断）。"""
        with mock.patch.object(
            ps, "_run_git",
            return_value="?? pyJianYingDraft/\n?? README_full.md",
        ):
            conflict, detail = ps._check_untracked_module_conflict("dummy-root")
        self.assertTrue(conflict)
        self.assertIn("pyJianYingDraft/", detail)
        # 普通无关未跟踪文档不视为冲突
        with mock.patch.object(
            ps, "_run_git",
            return_value="?? README_full.md\n?? notes.txt",
        ):
            conflict2, _ = ps._check_untracked_module_conflict("dummy-root")
        self.assertFalse(conflict2)


if __name__ == "__main__":
    unittest.main()
