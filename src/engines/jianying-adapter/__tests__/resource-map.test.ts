/**
 * JianYing Adapter —— ResourceMap 测试。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveResource, collectTimelineStyleIds } from '../resource-map';
import { RESOURCE_MAP_V0, RESOURCE_MAP_REF, validateResourceMap } from '../resource-map-data';
import { ErrorCode } from '../errors';

describe('ResourceMap V0', () => {
  test('ResourceMap fixture 加载正常', () => {
    assert.equal(RESOURCE_MAP_V0.ref, RESOURCE_MAP_REF);
    assert.ok(RESOURCE_MAP_V0.entries.length >= 8, '至少含已验证花字/转场/SFX/BGM/字幕样式');
  });

  test('生产 ResourceMap 通过正式 schema 校验', () => {
    const check = validateResourceMap(RESOURCE_MAP_V0);
    assert.equal(check.ok, true, JSON.stringify(check.issues));
  });

  test('已验证花字可解析', () => {
    const r = resolveResource('huazi.blue_outline');
    assert.ok(!('code' in r));
    // 生产 ResourceMap 已同步为高版本 fork（aoguai/pyJianYingDraft）实测花字 resourceId
    if (!('code' in r)) assert.equal(r.entry.resourceId, '7160598356237012261');
  });

  test('叠化转场可解析', () => {
    const r = resolveResource('transition.dissolve');
    assert.ok(!('code' in r));
    if (!('code' in r)) assert.equal(r.entry.resourceId, '6724845717472416269');
  });

  test('字幕样式（code_defined，无 resourceId）可解析且不视为缺失', () => {
    const r = resolveResource('subtitle.default');
    assert.ok(!('code' in r));
    if (!('code' in r)) {
      assert.equal(r.skipped, false);
      assert.equal(r.entry.copyrightStatus, 'code_defined');
    }
  });

  test('不存在的 styleId 返回 RESOURCE_MISSING', () => {
    const r = resolveResource('huazi.not_exists');
    assert.ok('code' in r);
    if ('code' in r) assert.equal(r.code, ErrorCode.RESOURCE_MISSING);
  });
});

describe('validateResourceMap（Phase C.1 正式校验）', () => {
  test('重复 styleId 被检出', () => {
    const dup = {
      ...RESOURCE_MAP_V0,
      entries: [...RESOURCE_MAP_V0.entries, { ...RESOURCE_MAP_V0.entries[0] }]
    };
    const check = validateResourceMap(dup);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /重复 styleId/.test(i.message)));
  });

  test('非 code_defined 缺少非空 resourceId 被检出', () => {
    const bad = {
      ...RESOURCE_MAP_V0,
      entries: RESOURCE_MAP_V0.entries.map((e) =>
        e.styleId === 'transition.dissolve' ? { ...e, resourceId: '' } : e
      )
    };
    const check = validateResourceMap(bad);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /缺少非空 resourceId/.test(i.message)));
  });

  test('code_defined 携带剪映 resourceId（伪造普通资源）被检出', () => {
    const bad = {
      ...RESOURCE_MAP_V0,
      entries: RESOURCE_MAP_V0.entries.map((e) =>
        e.styleId === 'subtitle.default' ? { ...e, resourceId: '999' } : e
      )
    };
    const check = validateResourceMap(bad);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /不得携带剪映 resourceId/.test(i.message)));
  });

  test('fallback 指向不存在条目被检出', () => {
    const bad = {
      ...RESOURCE_MAP_V0,
      entries: RESOURCE_MAP_V0.entries.map((e) =>
        e.styleId === 'huazi.blue_outline' ? { ...e, fallbackStyleId: 'huazi.not_exists' } : e
      )
    };
    const check = validateResourceMap(bad);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /fallback 指向不存在/.test(i.message)));
  });

  test('fallback 自引用被检出', () => {
    const bad = {
      ...RESOURCE_MAP_V0,
      entries: RESOURCE_MAP_V0.entries.map((e) =>
        e.styleId === 'transition.dissolve' ? { ...e, fallbackStyleId: 'transition.dissolve' } : e
      )
    };
    const check = validateResourceMap(bad);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /fallback 自引用/.test(i.message)));
  });

  test('缺少授权状态字段被检出', () => {
    const bad = {
      ...RESOURCE_MAP_V0,
      entries: RESOURCE_MAP_V0.entries.map((e) => {
        if (e.styleId === 'sfx.typewriter') {
          const { vipRequired, ...rest } = e;
          return rest as typeof e;
        }
        return e;
      })
    };
    const check = validateResourceMap(bad);
    assert.equal(check.ok, false);
    assert.ok(check.issues.some((i) => /缺少授权状态字段/.test(i.message)));
  });
});

describe('collectTimelineStyleIds', () => {
  test('收集字幕/标题/关键词中的 styleId', () => {
    const ids = collectTimelineStyleIds({
      subtitleTrack: [{ styleId: 'subtitle.default' }, { styleId: 'subtitle.default' }],
      titleTrack: [{ styleId: 'title.other' }],
      keywordTrack: [{ styleId: 'huazi.blue_outline' }, { styleId: 'huazi.gold_outline' }]
    });
    assert.deepEqual(
      ids.sort(),
      ['huazi.blue_outline', 'huazi.gold_outline', 'subtitle.default', 'title.other'].sort()
    );
  });
});
