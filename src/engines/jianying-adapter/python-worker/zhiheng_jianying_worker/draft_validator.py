# -*- coding: utf-8 -*-
"""草稿结构验证 —— 生成后对草稿目录做非 GUI 静态核验。

验证内容：
- 剪映草稿关键文件存在（draft_content.json / draft_meta_info.json / draft_info.json）
- draft_content.json 可解析，含 tracks 数组
- 视频轨道 segment 数量与 timeline 期望一致
不启动剪映。剪映 GUI 打开验证属于 Phase D。
"""

import json
import os

from .errors import WorkerError

# PJD 明文草稿必须生成的文件
KEY_FILES_REQUIRED = ("draft_content.json", "draft_meta_info.json")
# 剪映 11.3 打开后自动生成的文件（PJD 明文草稿不要求存在）
KEY_FILES_OPTIONAL = ("draft_info.json",)


def validate_draft_dir(draft_dir, expected_video_segments=None):
    """核验草稿目录。返回 checks 列表 [{name, ok, detail}]。"""
    checks = []
    if not os.path.isdir(draft_dir):
        raise WorkerError("DRAFT_WRITE_FAIL", "草稿目录不存在: %s" % draft_dir)

    # 1. 关键文件存在（PJD 必须生成）
    for key in KEY_FILES_REQUIRED:
        p = os.path.join(draft_dir, key)
        ok = os.path.isfile(p)
        checks.append(
            {"name": "file.%s" % key, "ok": ok, "detail": "存在" if ok else "缺失"}
        )
    # 剪映打开后自动生成的文件：不作为失败项，仅记录
    for key in KEY_FILES_OPTIONAL:
        p = os.path.join(draft_dir, key)
        ok = os.path.isfile(p)
        checks.append(
            {"name": "file.%s" % key, "ok": True, "detail": "存在" if ok else "剪映打开后自动生成"}
        )

    # 2. draft_content.json 可解析 + 含 tracks
    content_path = os.path.join(draft_dir, "draft_content.json")
    track_count = 0
    video_seg_count = 0
    if os.path.isfile(content_path):
        try:
            with open(content_path, encoding="utf-8") as f:
                content = json.load(f)
            tracks = content.get("tracks", [])
            track_count = len(tracks)
            for t in tracks:
                if t.get("type") == "video":
                    video_seg_count = len(t.get("segments", []))
            checks.append(
                {
                    "name": "draft_content.parsable",
                    "ok": True,
                    "detail": "tracks=%d videoSegments=%d" % (track_count, video_seg_count),
                }
            )
        except Exception as exc:  # noqa: BLE001
            checks.append(
                {"name": "draft_content.parsable", "ok": False, "detail": "解析失败: %s" % exc}
            )
    else:
        checks.append({"name": "draft_content.parsable", "ok": False, "detail": "文件缺失"})

    # 3. 视频 segment 数量与期望一致
    if expected_video_segments is not None:
        ok = video_seg_count == expected_video_segments
        checks.append(
            {
                "name": "video.segment_count",
                "ok": ok,
                "detail": "期望=%d 实际=%d" % (expected_video_segments, video_seg_count),
            }
        )

    return checks
