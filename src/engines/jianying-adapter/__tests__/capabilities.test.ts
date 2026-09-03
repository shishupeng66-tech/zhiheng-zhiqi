/**
 * JianYing Adapter —— Capability 校验测试。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTimelineCapabilities,
  JIANYING_ADAPTER_CAPABILITIES,
  type AdapterCapabilities
} from '../capabilities';
import { loadFixture } from '../contract';
import { ErrorCode } from '../errors';
import type { UnifiedTimelineV2 } from '../../zhiheng-renderer/v2-types';

describe('validateTimelineCapabilities（JianYing Adapter 能力）', () => {
  test('V2 dissolve 时间线由 jianying adapter 支持', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-dissolve.json');
    const errors = validateTimelineCapabilities(job.timeline, JIANYING_ADAPTER_CAPABILITIES);
    assert.deepEqual(errors, []);
  });

  test('V2 keywordTrack 由 jianying adapter 支持', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-keyword.json');
    const errors = validateTimelineCapabilities(job.timeline, JIANYING_ADAPTER_CAPABILITIES);
    assert.deepEqual(errors, []);
  });

  test('受限能力（无 dissolve）时明确报 UNSUPPORTED_CAPABILITY', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-dissolve.json');
    const limited: AdapterCapabilities = {
      ...JIANYING_ADAPTER_CAPABILITIES,
      transitions: ['hard_cut']
    };
    const errors = validateTimelineCapabilities(job.timeline, limited);
    assert.ok(errors.some((e) => e.code === ErrorCode.UNSUPPORTED_CAPABILITY));
    assert.match(errors[0].message, /dissolve/);
  });

  test('受限能力（不支持 keywordTrack）时明确报 UNSUPPORTED_CAPABILITY', () => {
    const job = loadFixture<{ timeline: UnifiedTimelineV2 }>('job-keyword.json');
    const limited: AdapterCapabilities = { ...JIANYING_ADAPTER_CAPABILITIES, keywordTrack: false };
    const errors = validateTimelineCapabilities(job.timeline, limited);
    assert.ok(errors.some((e) => /keywordTrack/.test(e.message)));
  });
});
