/**
 * JianYing Adapter —— Contract 测试（含共享 Fixtures 交叉验证）。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJob,
  parseResult,
  loadFixture,
  SHARED_FIXTURE_FILES,
  CONTRACT_VERSION,
  SUPPORTED_TIMELINE_SCHEMA_VERSION
} from '../contract';
import { ERROR_CODE_LIST, ErrorCode } from '../errors';

describe('Contract fixtures 交叉验证', () => {
  test('共享 fixtures 文件齐全', () => {
    for (const name of SHARED_FIXTURE_FILES) {
      const data = loadFixture<unknown>(name);
      assert.ok(data, `fixture ${name} 应存在`);
    }
  });

  test('error-codes.json 与 TS 错误码列表一致（防 schema 漂移）', () => {
    const fixture = loadFixture<{ errorCodes: string[] }>('error-codes.json');
    assert.deepEqual([...fixture.errorCodes].sort(), [...ERROR_CODE_LIST].sort());
  });
});

describe('parseJob', () => {
  test('job-minimal fixture 可解析', () => {
    const job = loadFixture('job-minimal.json');
    const r = parseJob(job);
    assert.ok('job' in r, '应解析成功');
    if ('job' in r) {
      assert.equal(r.job.contractVersion, CONTRACT_VERSION);
      assert.equal(r.job.timelineSchemaVersion, SUPPORTED_TIMELINE_SCHEMA_VERSION);
      assert.equal(r.job.timeline.schemaVersion, 2);
    }
  });

  test('job-dissolve / job-keyword fixture 可解析', () => {
    for (const name of ['job-dissolve.json', 'job-keyword.json']) {
      const job = loadFixture(name);
      const r = parseJob(job);
      assert.ok('job' in r, `${name} 应解析成功`);
    }
  });

  test('非法 Job（缺字段）返回 JOB_INVALID', () => {
    const r = parseJob({ contractVersion: '0.1.0', jobId: 'x' });
    assert.ok('error' in r);
    if ('error' in r) assert.equal(r.error.code, ErrorCode.JOB_INVALID);
  });

  test('不支持 contractVersion 返回 UNSUPPORTED_CONTRACT_VERSION', () => {
    const job = loadFixture<{ contractVersion?: string }>('job-minimal.json');
    job.contractVersion = '9.9.9';
    const r = parseJob(job);
    assert.ok('error' in r);
    if ('error' in r) assert.equal(r.error.code, ErrorCode.UNSUPPORTED_CONTRACT_VERSION);
  });

  test('不支持 timelineSchemaVersion 返回 UNSUPPORTED_TIMELINE_VERSION', () => {
    const job = loadFixture<{ timelineSchemaVersion?: number }>('job-minimal.json');
    job.timelineSchemaVersion = 1;
    const r = parseJob(job);
    assert.ok('error' in r);
    if ('error' in r) assert.equal(r.error.code, ErrorCode.UNSUPPORTED_TIMELINE_VERSION);
  });
});

describe('parseResult', () => {
  test('result-ok fixture 可解析', () => {
    const r = parseResult(loadFixture('result-ok.json'));
    assert.ok('result' in r);
    if ('result' in r) {
      assert.equal(r.result.ok, true);
      assert.equal(r.result.duration, 5.0);
    }
  });

  test('result-error fixture 可解析', () => {
    const r = parseResult(loadFixture('result-error.json'));
    assert.ok('result' in r);
    if ('result' in r) {
      assert.equal(r.result.ok, false);
      assert.equal(r.result.error?.code, ErrorCode.TARGET_ALREADY_EXISTS);
    }
  });

  test('非法 Result（缺 ok）返回 WORKER_PROTOCOL_ERROR', () => {
    const r = parseResult({ contractVersion: '0.1.0', jobId: 'x' });
    assert.ok('error' in r);
    if ('error' in r) assert.equal(r.error.code, ErrorCode.WORKER_PROTOCOL_ERROR);
  });
});
