/**
 * 知衡助手 Agent - Phase 2A 真实验收测试
 *
 * 用法：npx tsx scripts/verify-tool-calling.ts
 *
 * 使用系统当前配置的默认 LLM 进行真实 Tool Calling 测试。
 * 记录：provider / model / 是否支持 Tool Calling / 真实结果
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { getResolvedLlmConfig, chatWithTools, isToolUnsupportedError } from '../src/lib/ai';
import { toolRegistry } from '../src/lib/agent/tool-registry';
import { AgentOrchestrator } from '../src/lib/agent/orchestrator';
import type { AgentContext } from '../src/lib/agent/types';
import type { ToolExecutionContext } from '../src/lib/agent/tool-registry';

// 触发 Tool 注册
import '../src/lib/agent/tools';

async function main() {
  console.log('========================================');
  console.log('  知衡助手 Agent - Tool Calling 真实验收');
  console.log('========================================\n');

  // 1. 获取当前默认 LLM 配置
  console.log('【1】当前默认 LLM 配置');
  const cfg = await getResolvedLlmConfig();
  if (!cfg) {
    console.log('❌ 未配置默认 LLM');
    console.log('\n结论：supportsToolCalling = false（无配置）');
    return;
  }
  console.log(`  Provider: ${cfg.provider}`);
  console.log(`  Model:    ${cfg.model}`);
  console.log(`  Base URL: ${cfg.baseUrl}`);
  console.log(`  API Key:  ${cfg.apiKey ? '***已配置***' : '❌未配置'}`);
  console.log();

  if (!cfg.apiKey || !cfg.model) {
    console.log('❌ LLM 配置不完整（缺少 API Key 或 Model）');
    console.log('\n结论：supportsToolCalling = false（配置不完整）');
    return;
  }

  // 2. 检查已注册的 Tool
  console.log('【2】已注册的 Tool');
  const tools = toolRegistry.list();
  for (const t of tools) {
    console.log(`  - ${t.name} (${t.riskLevel}) - ${t.displayName}`);
  }
  console.log(`  共 ${tools.length} 个 Tool\n`);

  // 3. 直接测试 Tool Calling（不经过 Agent）
  console.log('【3】直接 Tool Calling 测试（chatWithTools）');
  const testMessages = [
    { role: 'system' as const, content: '你是一个助手。用户问你有哪些视频剪辑风格时，调用 list_video_skills 工具。' },
    { role: 'user' as const, content: '我们现在有哪些视频剪辑风格？' }
  ];

  let supportsToolCalling = false;
  let toolCallingError = '';

  try {
    const result = await chatWithTools(testMessages, {
      tools: toolRegistry.toChatTools(),
      tool_choice: 'auto'
    });

    console.log(`  finish_reason: ${result.finishReason}`);
    console.log(`  tool_calls 数量: ${result.toolCalls.length}`);

    if (result.toolCalls.length > 0) {
      supportsToolCalling = true;
      console.log('  ✅ LLM 主动发起了 Tool Call！');
      for (const tc of result.toolCalls) {
        console.log(`    - ${tc.function.name}`);
        console.log(`      arguments: ${tc.function.arguments.slice(0, 100)}`);
      }
    } else {
      console.log('  ⚠️  LLM 未发起 Tool Call（可能直接回答了问题）');
      console.log(`  回复内容: ${result.text.slice(0, 200)}...`);
    }
  } catch (e) {
    toolCallingError = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ 请求失败`);
    console.log(`  错误: ${toolCallingError.slice(0, 300)}`);

    if (isToolUnsupportedError(e)) {
      console.log('  → 判定：模型不支持 Tool Calling');
    } else {
      console.log('  → 判定：其他错误（非 Tool Calling 兼容性问题）');
    }
  }
  console.log();

  // 4. 如果支持，进行完整 Agent 测试
  if (supportsToolCalling) {
    console.log('【4】完整 Agent 测试（3 个用例）');

    const agentCtx: AgentContext = {
      route: '/dashboard/overview',
      user: {
        id: 'test-user-001',
        name: '系统管理员',
        role: 'super_admin'
      },
      workspace: null,
      entity: null
    };

    const toolCtx: ToolExecutionContext = {
      userId: 'test-user-001',
      userName: '系统管理员',
      userRole: 'super_admin',
      workspaceId: null,
      workspaceRole: null
    };

    const testCases = [
      {
        name: '测试 1：列出视频剪辑风格',
        message: '我们现在有哪些视频剪辑风格？',
        expectedTool: 'list_video_skills'
      },
      {
        name: '测试 2：老板IP风格规则',
        message: '老板IP观点型视频有什么规则？',
        expectedTool: 'get_video_skill'
      },
      {
        name: '测试 3：企业内容边界',
        message: '企业内容有哪些东西不能乱说？',
        expectedTool: 'get_company_context_summary'
      }
    ];

    for (const tc of testCases) {
      console.log(`\n  ── ${tc.name} ──`);
      console.log(`  用户: ${tc.message}`);

      const agent = new AgentOrchestrator(agentCtx, toolCtx);
      const messages = [{ role: 'user' as const, content: tc.message }];

      let assistantText = '';
      const calledTools: string[] = [];
      let success = false;

      try {
        for await (const event of agent.run(messages)) {
          switch (event.type) {
            case 'assistant_delta':
              assistantText += event.content ?? '';
              break;
            case 'tool_started':
              calledTools.push(event.tool ?? '');
              console.log(`  🛠️  Tool 开始: ${event.toolDisplayName}`);
              break;
            case 'tool_completed':
              console.log(`  ✅ Tool 完成: ${event.toolDisplayName}`);
              break;
            case 'error':
              console.log(`  ❌ 错误: ${event.error}`);
              break;
            case 'done':
              success = true;
              break;
          }
        }

        console.log(`  💬 回复 (前150字): ${assistantText.slice(0, 150)}...`);
        console.log(`  🔧 调用的 Tool: ${calledTools.join(', ') || '无'}`);

        if (calledTools.includes(tc.expectedTool)) {
          console.log(`  ✅ 期望的 Tool「${tc.expectedTool}」被调用`);
        } else if (calledTools.length > 0) {
          console.log(`  ⚠️  调用了其他 Tool，但不是期望的 ${tc.expectedTool}`);
        } else {
          console.log(`  ⚠️  未调用任何 Tool（模型可能直接回答了）`);
        }
      } catch (e) {
        console.log(`  ❌ 测试失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 5. 总结
  console.log('\n========================================');
  console.log('  验收总结');
  console.log('========================================');
  console.log(`  Provider:              ${cfg.provider}`);
  console.log(`  Model:                 ${cfg.model}`);
  console.log(`  supportsToolCalling:   ${supportsToolCalling}`);
  if (toolCallingError) {
    console.log(`  错误信息:              ${toolCallingError.slice(0, 100)}`);
  }
  console.log('========================================');
}

main().catch(console.error);
