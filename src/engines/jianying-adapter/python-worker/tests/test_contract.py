# -*- coding: utf-8 -*-
"""Contract 交叉验证测试 —— 与 TS 侧共享 fixtures。"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhiheng_jianying_worker import contract as c
from zhiheng_jianying_worker.errors import WorkerError, ERROR_CODES


class ContractTest(unittest.TestCase):
    def test_error_codes_fixture_cross_check(self):
        """error-codes.json 与本地错误码一致（与 TS 侧同源）。"""
        codes = c.cross_check_error_codes_fixture()
        self.assertEqual(set(codes), set(ERROR_CODES))

    def test_job_minimal_fixture_valid(self):
        """job-minimal fixture 通过契约校验。"""
        job = c.load_fixture("job-minimal.json")
        job_id = c.validate_job(job)
        self.assertEqual(job_id, "fixture-job-minimal")

    def test_job_dissolve_and_keyword_fixtures_valid(self):
        for name in ("job-dissolve.json", "job-keyword.json"):
            job = c.load_fixture(name)
            c.validate_job(job)

    def test_unsupported_contract_version(self):
        job = c.load_fixture("job-minimal.json")
        job["contractVersion"] = "9.9.9"
        with self.assertRaises(WorkerError) as ctx:
            c.validate_job(job)
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_CONTRACT_VERSION")

    def test_unsupported_timeline_version(self):
        job = c.load_fixture("job-minimal.json")
        job["timelineSchemaVersion"] = 1
        with self.assertRaises(WorkerError) as ctx:
            c.validate_job(job)
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_TIMELINE_VERSION")

    def test_missing_field(self):
        job = c.load_fixture("job-minimal.json")
        del job["stagingRoot"]
        with self.assertRaises(WorkerError) as ctx:
            c.validate_job(job)
        self.assertEqual(ctx.exception.code, "JOB_INVALID")

    def test_result_ok_fixture_valid(self):
        result = c.load_fixture("result-ok.json")
        c.validate_result(result)

    def test_result_error_fixture_valid(self):
        result = c.load_fixture("result-error.json")
        c.validate_result(result)

    def test_invalid_result_missing_ok(self):
        with self.assertRaises(WorkerError) as ctx:
            c.validate_result({"contractVersion": "0.1.0", "jobId": "x"})
        self.assertEqual(ctx.exception.code, "WORKER_PROTOCOL_ERROR")


if __name__ == "__main__":
    unittest.main()
