/**
 * 从 zod schema 生成 JSON Schema。
 *
 * source of truth：src/engines/zhiheng-renderer/types.ts 中的 zod schema
 * 派生产物：docs/schemas/unified-timeline-v1.schema.json
 *
 * 运行方式：npx tsx scripts/generate-timeline-schema.ts
 *
 * 注意：不要手动编辑生成的 JSON Schema 文件。
 * 如果类型变更，修改 types.ts 后重新运行此脚本。
 */

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { UnifiedTimelineV1Schema } from '../src/engines/zhiheng-renderer/types';

function main(): void {
  // zod 4 的 toJSONSchema API（注意大写 JSON）
  const zodWithJsonSchema = z as unknown as {
    toJSONSchema?: (schema: unknown, options?: unknown) => unknown;
  };

  if (typeof zodWithJsonSchema.toJSONSchema !== 'function') {
    throw new Error(
      '当前 zod 版本不支持 z.toJSONSchema()。请升级到 zod 4.x，或手动生成 JSON Schema。',
    );
  }

  const jsonSchema = zodWithJsonSchema.toJSONSchema(UnifiedTimelineV1Schema, {
    $schema: 'http://json-schema.org/draft-07/schema#',
    target: 'jsonSchema7',
  });

  // 补充元数据
  const schemaObject = jsonSchema as Record<string, unknown>;
  const enriched = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://zhiheng-zhiqi.local/schemas/unified-timeline-v1.schema.json',
    title: 'Unified Timeline V1',
    description:
      '知衡智企自动剪辑统一时间线 V1。Agent/LLM 与执行层之间的结构化契约。source of truth: src/engines/zhiheng-renderer/types.ts',
    version: 1,
    ...schemaObject,
  };

  const outputDir = path.resolve(process.cwd(), 'docs', 'schemas');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'unified-timeline-v1.schema.json');
  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2) + '\n', 'utf8');

  console.log(`JSON Schema 已生成: ${outputPath}`);
  console.log(`source of truth: src/engines/zhiheng-renderer/types.ts`);
}

main();
