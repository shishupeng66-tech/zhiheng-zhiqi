/**
 * Unified Timeline V1/V2 schema、migration、capability 测试。
 *
 * 覆盖（Phase C 验收要求）：
 * - V1 原样例仍能通过
 * - V1 → V2 migration 稳定且可重复
 * - V2 hard_cut 基础时间线能够正确校验
 * - V2 dissolve 交给不支持它的 renderer 时明确失败（UNSUPPORTED_CAPABILITY）
 * - V2 keywordTrack 不得被旧 renderer 静默丢弃
 * - 非法 schemaVersion 明确失败
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedTimelineV1Schema, type UnifiedTimelineV1 } from '../types';
import {
  UnifiedTimelineSchema,
  UnifiedTimelineV2Schema,
  type UnifiedTimelineV2
} from '../v2-types';
import { migrateTimelineV1ToV2 } from '../migration';
import { TimelineValidator } from '../validator';
import { ZhihengRenderer } from '../renderer';
import { ValidationErrorCode } from '../../renderer-interface';
import { loadFixture } from '../../jianying-adapter/contract';

const OUTPUT_PROFILE = {
  width: 1080,
  height: 1920,
  targetFps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  pixelFormat: 'yuv420p',
  colorTarget: 'bt709_sdr'
} as const;

/** 构造一个合法的 V1 Timeline（最小样例） */
function makeV1(): UnifiedTimelineV1 {
  return {
    schemaVersion: 1,
    timelineId: 'tl-v1-test',
    taskId: 'task-v1-test',
    outputProfile: { ...OUTPUT_PROFILE },
    videoTrack: [
      {
        assetRef: { type: 'library_asset', assetId: 'a.mp4' },
        sourceStart: 0,
        duration: 5,
        transition: 'hard_cut'
      }
    ],
    voiceTrack: [],
    subtitleTrack: [],
    titleTrack: []
  };
}

describe('UnifiedTimeline V1 原样例', () => {
  test('V1 schema 解析通过', () => {
    const parsed = UnifiedTimelineV1Schema.safeParse(makeV1());
    assert.equal(parsed.success, true);
  });

  test('V1 validator 校验通过', () => {
    const v = new TimelineValidator();
    const result = v.validate(makeV1());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
});

describe('V1 → V2 migration', () => {
  test('迁移稳定且可重复（两次结果一致）', () => {
    const v1 = makeV1();
    const a = migrateTimelineV1ToV2(v1);
    const b = migrateTimelineV1ToV2(v1);
    assert.deepEqual(a, b);
  });

  test('迁移默认值符合 V1 真实执行行为', () => {
    const v2 = migrateTimelineV1ToV2(makeV1());
    assert.equal(v2.schemaVersion, 2);
    assert.equal(v2.videoTrack[0].sourceAudioMuted, true); // compose 只取视频流 → 原声等同静音
    assert.equal(v2.videoTrack[0].transition, 'hard_cut');
    assert.deepEqual(v2.keywordTrack, []);
  });

  test('迁移结果可被 V2 schema 解析', () => {
    const v2 = migrateTimelineV1ToV2(makeV1());
    const parsed = UnifiedTimelineV2Schema.safeParse(v2);
    assert.equal(parsed.success, true);
  });
});

describe('UnifiedTimeline V2', () => {
  test('V2 hard_cut 基础时间线能够正确校验（job-minimal fixture）', () => {
    const job = loadFixture<{ timeline: unknown }>('job-minimal.json');
    const parsed = UnifiedTimelineV2Schema.safeParse(job.timeline);
    assert.equal(parsed.success, true);
    const v = new TimelineValidator();
    const result = v.validate(job.timeline);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  test('V2 dissolve 时间线能够通过 schema 校验', () => {
    const job = loadFixture<{ timeline: unknown }>('job-dissolve.json');
    const parsed = UnifiedTimelineV2Schema.safeParse(job.timeline);
    assert.equal(parsed.success, true);
  });

  test('V2 dissolve 交给不支持它的 renderer 时明确失败', () => {
    const job = loadFixture<{ timeline: unknown }>('job-dissolve.json');
    const renderer = new ZhihengRenderer();
    const result = renderer.validate(job.timeline);
    assert.equal(result.valid, false);
    const unsupported = result.errors.filter(
      (e) => e.code === ValidationErrorCode.UNSUPPORTED_CAPABILITY
    );
    assert.ok(unsupported.length > 0, '应返回 UNSUPPORTED_CAPABILITY');
    assert.match(unsupported[0].message, /dissolve/);
  });

  test('V2 keywordTrack 不得被旧 renderer 静默丢弃', () => {
    const job = loadFixture<{ timeline: unknown }>('job-keyword.json');
    const renderer = new ZhihengRenderer();
    const result = renderer.validate(job.timeline);
    assert.equal(result.valid, false);
    const unsupported = result.errors.filter(
      (e) => e.code === ValidationErrorCode.UNSUPPORTED_CAPABILITY
    );
    assert.ok(
      unsupported.some((e) => /keywordTrack/.test(e.message)),
      '应报 keywordTrack 不支持'
    );
  });

  test('V2 仅用旧能力时（hard_cut + 静音）可由旧 renderer 通过校验', () => {
    const job = loadFixture<{ timeline: unknown }>('job-minimal.json');
    const renderer = new ZhihengRenderer();
    const result = renderer.validate(job.timeline);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
});

describe('非法 schemaVersion', () => {
  test('UnifiedTimelineSchema 明确失败', () => {
    const bad = {
      schemaVersion: 99,
      timelineId: 'x',
      taskId: 'y',
      outputProfile: { ...OUTPUT_PROFILE },
      videoTrack: []
    };
    const parsed = UnifiedTimelineSchema.safeParse(bad);
    assert.equal(parsed.success, false);
  });
});
