# -*- coding: utf-8 -*-
"""路径安全测试 —— 防止逃逸与越界写入。"""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhiheng_jianying_worker import path_safety as ps
from zhiheng_jianying_worker.errors import WorkerError


class PathSafetyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="zhiheng-path-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_is_within(self):
        root = os.path.join(self.tmp, "draft-root")
        child = os.path.join(root, "draft-a")
        self.assertTrue(ps.is_within(root, child))
        self.assertTrue(ps.is_within(root, root))
        self.assertFalse(ps.is_within(root, self.tmp))

    def test_assert_relative_safe_rejects_parent(self):
        with self.assertRaises(WorkerError) as ctx:
            ps.assert_relative_safe("../evil.mp4")
        self.assertEqual(ctx.exception.code, "PATH_OUTSIDE_ALLOWED_ROOT")

    def test_assert_relative_safe_rejects_absolute(self):
        with self.assertRaises(WorkerError):
            ps.assert_relative_safe("C:/evil.mp4")

    def test_assert_relative_safe_rejects_dot(self):
        with self.assertRaises(WorkerError):
            ps.assert_relative_safe("./evil.mp4")

    def test_assert_relative_safe_accepts_normal(self):
        self.assertEqual(ps.assert_relative_safe("a/b/video.mp4"), "a/b/video.mp4")

    def test_resolve_asset_path_escape(self):
        asset_root = os.path.join(self.tmp, "assets")
        os.makedirs(asset_root)
        with self.assertRaises(WorkerError) as ctx:
            ps.resolve_asset_path(asset_root, "../outside.mp4")
        self.assertEqual(ctx.exception.code, "PATH_OUTSIDE_ALLOWED_ROOT")

    def test_resolve_asset_path_not_found(self):
        asset_root = os.path.join(self.tmp, "assets")
        os.makedirs(asset_root)
        with self.assertRaises(WorkerError) as ctx:
            ps.resolve_asset_path(asset_root, "video/missing.mp4")
        self.assertEqual(ctx.exception.code, "ASSET_NOT_FOUND")

    def test_resolve_asset_path_ok(self):
        asset_root = os.path.join(self.tmp, "assets")
        os.makedirs(os.path.join(asset_root, "video"))
        target = os.path.join(asset_root, "video", "clip.mp4")
        with open(target, "wb") as f:
            f.write(b"x")
        resolved = ps.resolve_asset_path(asset_root, "video/clip.mp4")
        self.assertEqual(resolved, target)

    def test_resolve_output_escape(self):
        draft_root = os.path.join(self.tmp, "draft-root")
        os.makedirs(draft_root)
        with self.assertRaises(WorkerError):
            ps.resolve_output_path(draft_root, self.tmp)


if __name__ == "__main__":
    unittest.main()
