/**
 * JianYing Adapter —— 生成前静态校验（validator）测试。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateForGeneration, isPathWithin } from '../validator';
import { loadFixture } from '../contract';
import { ErrorCode } from '../errors';
import type { UnifiedTimelineV2 } from '../../zhiheng-renderer/v2-types';

describe('validateForGeneration', () => {
  test('job-minimal timeline 全部校验通过', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-minimal.json');
    const r = validateForGeneration(job.timeline);
    assert.deepEqual(r.errors, []);
  });

  test('job-keyword timeline（含花字 styleId）全部校验通过', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-keyword.json');
    const r = validateForGeneration(job.timeline);
    assert.deepEqual(r.errors, []);
  });

  test('非法 assetId 报 JOB_INVALID', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-minimal.json');
    job.timeline.videoTrack[0].assetRef.assetId = '../../evil';
    const r = validateForGeneration(job.timeline);
    assert.ok(r.errors.some((e) => e.code === ErrorCode.JOB_INVALID));
  });

  test('不存在的 styleId 报 RESOURCE_MISSING', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-keyword.json');
    job.timeline.keywordTrack![0].styleId = 'huazi.not_exists';
    const r = validateForGeneration(job.timeline);
    assert.ok(r.errors.some((e) => e.code === ErrorCode.RESOURCE_MISSING));
  });
});

describe('isPathWithin', () => {
  test('子路径在根下', () => {
    assert.equal(isPathWithin('C:/draft-root', 'C:/draft-root/pjd-minimal-fixture'), true);
  });
  test('等于根', () => {
    assert.equal(isPathWithin('C:/draft-root', 'C:/draft-root'), true);
  });
  test('同级目录不在根下', () => {
    assert.equal(isPathWithin('C:/draft-root', 'C:/other/root/foo'), false);
  });
  test('父级不在根下', () => {
    assert.equal(isPathWithin('C:/draft-root/sub', 'C:/draft-root'), false);
  });
});
