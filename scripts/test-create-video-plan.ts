/**
 * create_video_plan smoke tests.
 *
 * This script calls the registered Agent tool directly. It only generates plans
 * and never renders videos or invokes MoneyPrinterTurbo.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import '../src/lib/agent/tools';
import { toolRegistry, type ToolExecutionContext } from '../src/lib/agent/tool-registry';

type PlanOutput = {
  title: string;
  coverage: {
    totalSegments: number;
    highQualityCoverageRate: number;
    status: string;
  };
  warnings: string[];
  timeline: Array<{
    order: number;
    matchLevel: string;
    matchScore: number;
    asset: {
      relativePath: string | null;
      sourceStart: number | null;
      sourceEnd: number | null;
    };
  }>;
};

const testCases = [
  {
    name: '无菌灌装知识科普',
    input: {
      userRequest: '为什么饮料代工厂一定要重视无菌灌装',
      contentType: '知识科普型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    }
  },
  {
    name: '原材料验收科普',
    input: {
      userRequest: '原材料进入工厂以后为什么不能直接生产',
      contentType: '知识科普型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    }
  },
  {
    name: '老板IP观点',
    input: {
      userRequest: '为什么饮料行业只卷价格走不远',
      contentType: '老板IP观点型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    }
  },
  {
    name: '明显素材不足主题',
    input: {
      userRequest: '用无人机航拍展示冷链冷库和机器人分拣系统',
      contentType: '工厂实力展示型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    }
  }
];

const ctx: ToolExecutionContext = {
  userId: 'benchmark-admin',
  userName: 'Benchmark Admin',
  userRole: 'super_admin',
  workspaceId: null,
  workspaceRole: null
};

async function main() {
  const tool = toolRegistry.get('create_video_plan');
  if (!tool) {
    throw new Error('create_video_plan is not registered');
  }

  console.log('=== create_video_plan smoke tests ===');
  console.log(`Tool: ${tool.name}`);

  for (const testCase of testCases) {
    const output = await tool.execute(testCase.input, ctx) as PlanOutput;
    console.log(`\n[${testCase.name}]`);
    console.log(`title: ${output.title}`);
    console.log(`segments: ${output.coverage.totalSegments}`);
    console.log(`coverage: ${output.coverage.highQualityCoverageRate}% (${output.coverage.status})`);
    console.log(`warnings: ${output.warnings.length}`);
    output.timeline.forEach((item) => {
      console.log(
        `${item.order}. ${item.matchLevel} ${item.matchScore.toFixed(3)} ` +
          `${item.asset.relativePath ?? 'NO_ASSET'} ` +
          `[${item.asset.sourceStart ?? '-'}-${item.asset.sourceEnd ?? '-'}]`
      );
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
