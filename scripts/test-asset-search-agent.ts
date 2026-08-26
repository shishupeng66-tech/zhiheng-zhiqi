/**
 * 知衡助手 Agent - Phase 2B 素材搜索真实 Agent 测试
 *
 * 用法：npx tsx scripts/test-asset-search-agent.ts
 *
 * 使用系统当前配置的默认 LLM，通过完整 Agent Orchestrator 测试 search_video_assets Tool。
 * 4 个测试用例：
 *   A. 无菌灌装素材搜索
 *   B. 老板IP + 工厂混合素材
 *   C. 品控主题素材
 *   D. 原材料验收（音画一致性测试）
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { AgentOrchestrator } from '../src/lib/agent/orchestrator';
import type { AgentContext } from '../src/lib/agent/types';
import type { ToolExecutionContext } from '../src/lib/agent/tool-registry';
import type { VideoClipResult } from '../src/lib/agent/video-asset-index';

// 触发 Tool 注册
import '../src/lib/agent/tools';

// ============================================================
// 测试用例
// ============================================================

interface TestCase {
  name: string;
  userMessage: string;
  check: (ctx: TestResultContext) => boolean;
}

interface TestResultContext {
  calledTools: string[];
  assistantText: string;
  searchResults: VideoClipResult[];
  searchTotal: number;
}

const testCases: TestCase[] = [
  {
    name: '测试 A：无菌灌装素材搜索',
    userMessage: '帮我找适合讲无菌灌装的素材。',
    check: (ctx) => {
      const called = ctx.calledTools.includes('search_video_assets');
      console.log(`    调用 search_video_assets: ${called ? '是' : '否'}`);
      console.log(`    返回片段数: ${ctx.searchTotal}`);
      return called && ctx.searchTotal > 0;
    }
  },
  {
    name: '测试 B：老板IP + 工厂混合素材',
    userMessage: '找5个适合做老板IP视频的镜头，最好有人物，也穿插工厂生产。',
    check: (ctx) => {
      const called = ctx.calledTools.includes('search_video_assets');
      console.log(`    调用 search_video_assets: ${called ? '是' : '否'}`);
      console.log(`    返回片段数: ${ctx.searchTotal}`);
      // 检查是否有人物相关和工厂相关的混合
      const hasPeople = ctx.searchResults.some(
        (r) => r.content.includes('人物') || r.content.includes('老板') || r.content.includes('口播') || r.content.includes('讲解')
      );
      const hasFactory = ctx.searchResults.some(
        (r) => r.content.includes('生产') || r.content.includes('车间') || r.content.includes('生产线') || r.content.includes('工厂')
      );
      console.log(`    含人物/口播: ${hasPeople ? '是' : '否'}`);
      console.log(`    含工厂/生产: ${hasFactory ? '是' : '否'}`);
      return called && ctx.searchTotal > 0;
    }
  },
  {
    name: '测试 C：品控主题素材',
    userMessage: '我想讲客户为什么应该重视品控，有哪些画面可以配？',
    check: (ctx) => {
      const called = ctx.calledTools.includes('search_video_assets');
      console.log(`    调用 search_video_assets: ${called ? '是' : '否'}`);
      console.log(`    返回片段数: ${ctx.searchTotal}`);
      // 检查是否有品控/质检/研发相关内容
      const hasQC = ctx.searchResults.some(
        (r) =>
          r.content.includes('品控') ||
          r.content.includes('质检') ||
          r.content.includes('检测') ||
          r.content.includes('研发') ||
          r.content.includes('实验')
      );
      console.log(`    含品控/质检/研发: ${hasQC ? '是' : '否'}`);
      if (ctx.searchResults.length > 0) {
        console.log(`    Top 3 内容: ${ctx.searchResults.slice(0, 3).map((r) => r.content).join(' / ')}`);
      }
      return called && ctx.searchTotal > 0;
    }
  },
  {
    name: '测试 D：原材料验收（音画一致性测试）',
    userMessage:
      '只搜索匹配画面。脚本句子："原材料进入工厂以后，第一步不是直接生产，而是先经过验收和检查。" 请找最匹配的视频素材片段。',
    check: (ctx) => {
      const called = ctx.calledTools.includes('search_video_assets');
      console.log(`    调用 search_video_assets: ${called ? '是' : '否'}`);
      console.log(`    返回片段数: ${ctx.searchTotal}`);
      // 音画一致性：检查 top 结果是否与"原材料验收"语义匹配
      const topResults = ctx.searchResults.slice(0, 3);
      const hasMaterialInspection = topResults.some(
        (r) =>
          r.content.includes('原材料') ||
          r.content.includes('验收') ||
          r.content.includes('原料') ||
          r.content.includes('质检') ||
          r.content.includes('检测')
      );
      console.log(`    Top3 含原材料/验收/质检: ${hasMaterialInspection ? '是' : '否'}`);
      if (topResults.length > 0) {
        console.log(`    Top 3 内容:`);
        topResults.forEach((r, i) => {
          console.log(`      ${i + 1}. ${r.content} (score: ${r.matchScore.toFixed(2)})`);
        });
      }
      return called && ctx.searchTotal > 0 && hasMaterialInspection;
    }
  }
];

// ============================================================
// 执行测试
// ============================================================

async function runTestCase(testCase: TestCase): Promise<boolean> {
  console.log(`\n  ├── ${testCase.name}`);
  const msgPreview = testCase.userMessage.slice(0, 50).replace(/\n/g, ' ');
  console.log(`  │   用户: ${msgPreview}${testCase.userMessage.length > 50 ? '...' : ''}`);

  const ctx: AgentContext = {
    route: '/dashboard/overview',
    user: {
      id: 'test-user',
      name: '测试用户',
      role: 'admin'
    },
    workspace: {
      id: 'test-workspace',
      slug: 'test',
      name: '测试工作空间'
    },
    entity: null
  };

  const toolCtx: ToolExecutionContext = {
    userId: 'test-user',
    userName: '测试用户',
    userRole: 'admin',
    workspaceId: 'test-workspace',
    workspaceRole: 'admin'
  };

  const orchestrator = new AgentOrchestrator(ctx, toolCtx);

  const calledTools: string[] = [];
  let assistantText = '';
  let searchResults: VideoClipResult[] = [];
  let searchTotal = 0;

  try {
    const messages = [{ role: 'user' as const, content: testCase.userMessage }];

    for await (const event of orchestrator.run(messages)) {
      switch (event.type) {
        case 'assistant_delta':
          assistantText += event.content ?? '';
          break;
        case 'tool_started':
          calledTools.push(event.tool ?? '');
          console.log(`  │   🔧 Tool 开始: ${event.toolDisplayName}`);
          if (event.tool === 'search_video_assets' && event.toolArguments) {
            try {
              const args = JSON.parse(event.toolArguments);
              console.log(`  │      参数: ${JSON.stringify(args)}`);
            } catch {
              console.log(`  │      参数(raw): ${event.toolArguments.slice(0, 100)}`);
            }
          }
          break;
        case 'tool_completed':
          console.log(`  │   ✅ Tool 完成: ${event.toolDisplayName}`);
          // 收集 search_video_assets 的结果
          if (event.tool === 'search_video_assets' && event.toolResult) {
            const r = event.toolResult as { total: number; results: VideoClipResult[] };
            searchTotal = r.total;
            searchResults = r.results;
            console.log(`  │   📊 找到 ${r.total} 个片段`);
            if (r.results.length > 0) {
              r.results.slice(0, 3).forEach((clip, i) => {
                console.log(
                  `  │      ${i + 1}. ${clip.fileName} [${clip.recommendedStart.toFixed(1)}s-${clip.recommendedEnd.toFixed(1)}s] ${clip.content.slice(0, 25)} (score:${clip.matchScore.toFixed(2)})`
                );
              });
            }
          }
          break;
        case 'error':
          console.log(`  │   ❌ Agent 错误: ${event.error}`);
          break;
      }
    }

    const replyPreview = assistantText.slice(0, 80).replace(/\n/g, ' ');
    console.log(`  │   💬 回复 (前80字): ${replyPreview}...`);
    console.log(`  │   🛠️  调用 Tool: ${[...new Set(calledTools)].join(', ')}`);

    const resultCtx: TestResultContext = {
      calledTools: [...new Set(calledTools)],
      assistantText,
      searchResults,
      searchTotal
    };

    const passed = testCase.check(resultCtx);
    console.log(`  │   ${passed ? '✅ 通过' : '❌ 未通过'}`);
    return passed;
  } catch (error) {
    console.log(`  │   ❌ 异常: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  │   堆栈: ${error instanceof Error ? error.stack?.slice(0, 200) : ''}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('  知衡助手 Agent - 素材搜索真实测试');
  console.log('========================================');

  console.log('\n【1】已注册的 Tool');
  const { toolRegistry } = await import('../src/lib/agent/tool-registry');
  const tools = toolRegistry.list();
  tools.forEach((t) => console.log(`  - ${t.name} (${t.riskLevel}) - ${t.displayName}`));
  console.log(`  共 ${tools.length} 个 Tool`);

  console.log('\n【2】运行测试用例');
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const ok = await runTestCase(testCase);
    if (ok) passed++;
    else failed++;
  }

  console.log('\n========================================');
  console.log('  测试总结');
  console.log('========================================');
  console.log(`  总计: ${testCases.length} 个用例`);
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  结果: ${failed === 0 ? '✅ 全部通过' : '❌ 存在失败'}`);
  console.log('========================================');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
