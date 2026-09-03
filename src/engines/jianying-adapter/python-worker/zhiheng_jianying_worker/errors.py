# -*- coding: utf-8 -*-
"""错误码定义 —— 与 TS 侧 src/engines/jianying-adapter/errors.ts 保持一致。

Job/Result 错误码为字符串，TS/Python 两侧必须完全相同，
由共享 Contract Fixtures（__fixtures__/error-codes.json）交叉验证。
"""

ERROR_CODES = (
    "JOB_INVALID",
    "UNSUPPORTED_CONTRACT_VERSION",
    "UNSUPPORTED_TIMELINE_VERSION",
    "UNSUPPORTED_CAPABILITY",
    "ASSET_NOT_FOUND",
    "PATH_OUTSIDE_ALLOWED_ROOT",
    "TARGET_ALREADY_EXISTS",
    "RESOURCE_MISSING",
    "DRAFT_WRITE_FAIL",
    "PJD_ERROR",
    "PJD_VERSION_MISMATCH",
    "PJD_SOURCE_DIRTY",
    "TIMEOUT",
    "WORKER_PROTOCOL_ERROR",
    "FAIL_ON_WARNING",
    "UNKNOWN",
)

ERROR_CODE_SET = set(ERROR_CODES)


def assert_error_code(code):
    """校验错误码合法，非法抛出 ValueError。"""
    if code not in ERROR_CODE_SET:
        raise ValueError("未知错误码: %r" % (code,))


class WorkerError(Exception):
    """Worker 内部错误，携带统一错误码。"""

    def __init__(self, code, message):
        assert_error_code(code)
        super().__init__("[%s] %s" % (code, message))
        self.code = code
        self.message = message
