/**
 * 知衡助手 Agent - Tool Calling 集成测试脚本
 *
 * 用法：npx tsx scripts/test-agent-tools.ts
 *
 * 注意：需要先配置好默认 LLM 模型（支持 Tool Calling）
 * 此脚本直接调用 Agent Orchestrator，验证完整 Tool Calling 流程
 */

import { toolRegistry } from '../src/lib/agent/tool-registry';
import { AgentOrchestrator } from '../src/lib/agent/orchestrator';
import type { AgentContext } from '../src/lib/agent/types';
import type { ToolExecutionContext } from '../src/lib/agent/tool-registry';

// 触发 Tool 注册
import '../src/lib/agent/tools';

async function main() {
  console.log('=== 知衡助手 Agent Tool Calling 测试 ===\n');

  // 1. 检查 Tool Registry
  console.log('1. 已注册的 Tool:');
  const tools = toolRegistry.list();
  for (const t of tools) {
    console.log(`   - ${t.name} (${t.riskLevel}) - ${t.displayName}`);
  }
  console.log(`   共 ${tools.length} 个 Tool\n`);

  // 2. 检查 Chat Tools 格式
  console.log('2. Chat Tools JSON Schema:');
  const chatTools = toolRegistry.toChatTools();
  for (const ct of chatTools) {
    console.log(`   - ${ct.function.name}`);
    console.log(`     描述: ${ct.function.description?.slice(0, 60)}...`);
    console.log(`     参数: ${JSON.stringify(ct.function.parameters).slice(0, 80)}...`);
  }
  console.log();

  // 3. 模拟 Agent Context
  const agentCtx: AgentContext = {
    route: '/dashboard/overview',
    user: {
      id: 'test-user-001',
      name: '测试用户',
      role: 'super_admin'
    },
    workspace: null,
    entity: null
  };

  const toolCtx: ToolExecutionContext = {
    userId: 'test-user-001',
    userName: '测试用户',
    userRole: 'super_admin',
    workspaceId: null,
    workspaceRole: null
  };

  // 4. 测试用例
  const testCases = [
    {
      name: '测试1: 列出视频剪辑风格',
      message: '我们现在有哪些视频剪辑风格？'
    },
    {
      name: '测试2: 获取老板IP风格详情',
      message: '老板IP风格有什么规则？'
    },
    {
      name: '测试3: 企业内容边界',
      message: '企业内容有哪些不能乱说的东西？'
    }
  ];

  for (const tc of testCases) {
    console.log(`\n=== ${tc.name} ===`);
    console.log(`用户: ${tc.message}\n`);

    const agent = new AgentOrchestrator(agentCtx, toolCtx);
    const messages = [{ role: 'user' as const, content: tc.message }];

    let assistantText = '';
    let toolCalls: string[] = [];

    try {
      for await (const event of agent.run(messages)) {
        switch (event.type) {
          case 'assistant_delta':
            process.stdout.write(event.content ?? '');
            assistantText += event.content ?? '';
            break;
          case 'tool_started':
            console.log(`\n[Tool 开始] ${event.toolDisplayName}`);
            toolCalls.push(event.tool ?? '');
            break;
          case 'tool_completed':
            console.log(`[Tool 完成] ${event.toolDisplayName}`);
            break;
          case 'error':
            console.log(`\n[错误] ${event.error}`);
            console.log(`错误代码: ${event.errorCode}`);
            break;
          case 'done':
            console.log('\n[完成]');
            break;
          case 'confirmation_required':
            console.log(`\n[需要确认] ${event.confirmation?.title}`);
            break;
        }
      }

      console.log(`\n--- 结果 ---`);
      console.log(`调用 Tool 数量: ${toolCalls.length}`);
      console.log(`调用的 Tool: ${toolCalls.join(', ') || '无'}`);
      console.log(`回复长度: ${assistantText.length} 字`);

      if (toolCalls.length > 0) {
        console.log('✅ Tool Calling 工作正常！');
      } else {
        console.log('⚠️  未调用 Tool（可能模型不需要，或问题不匹配）');
      }
    } catch (e) {
      console.error(`测试失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
