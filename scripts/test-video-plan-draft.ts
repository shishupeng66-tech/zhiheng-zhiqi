/**
 * Phase 3B-1 smoke tests:
 * create_video_plan -> automation_video_tasks(draft) -> edit/save draft.
 *
 * This script writes draft rows only. It never starts MoneyPrinterTurbo,
 * Voice Service, TTS, or MP4 rendering.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import '../src/lib/agent/tools';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db';
import { users, workspaces } from '../src/lib/db/schema';
import { toolRegistry, type ToolExecutionContext } from '../src/lib/agent/tool-registry';
import type { CreateVideoPlanOutput } from '../src/lib/agent/tools';
import {
  createDraftTaskFromVideoPlan,
  getAutomationVideoTask,
  getTaskAgentPlan,
  getTaskCurrentConfig,
  mapVideoPlanToDraftInput,
  updateAutomationVideoDraftTask
} from '../src/lib/workspaces/automation-editing';

const cases = [
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
    name: '素材不足主题',
    input: {
      userRequest: '用无人机航拍展示冷链冷库和机器人分拣系统',
      contentType: '工厂实力展示型',
      platform: '抖音',
      videoRatio: '9:16',
      targetDuration: 30
    }
  }
];

async function main() {
  const db = getDb();
  const workspace = db.select().from(workspaces).where(eq(workspaces.slug, 'enterprise-media')).get();
  const user = db.select().from(users).where(eq(users.role, 'super_admin')).get();
  if (!workspace) throw new Error('enterprise-media workspace not found');
  if (!user) throw new Error('super_admin user not found');

  const tool = toolRegistry.get('create_video_plan');
  if (!tool) throw new Error('create_video_plan is not registered');

  const ctx: ToolExecutionContext = {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    workspaceId: workspace.id,
    workspaceRole: 'owner'
  };

  console.log('=== Phase 3B-1 draft task smoke tests ===');
  for (const item of cases) {
    const plan = (await tool.execute(item.input, ctx)) as CreateVideoPlanOutput;
    const draft = createDraftTaskFromVideoPlan(workspace.id, user.id, plan);
    const saved = getAutomationVideoTask(workspace.id, draft.id);
    if (!saved) throw new Error(`draft not found: ${draft.id}`);
    if (saved.status !== 'draft') throw new Error(`draft status is ${saved.status}`);
    if (saved.engineTaskId) throw new Error(`engineTaskId should be empty: ${draft.id}`);

    const savedPlan = getTaskAgentPlan(saved);
    const currentConfig = getTaskCurrentConfig(saved);
    if (!savedPlan) throw new Error(`agent plan missing: ${draft.id}`);
    if (!currentConfig?.materialTimeline?.length) {
      throw new Error(`material timeline missing: ${draft.id}`);
    }

    const edited = mapVideoPlanToDraftInput(plan);
    edited.scriptText = `${edited.scriptText}\n（高级编辑保存测试）`;
    const updated = updateAutomationVideoDraftTask(workspace.id, draft.id, edited);
    if (!updated?.scriptText?.includes('高级编辑保存测试')) {
      throw new Error(`draft update failed: ${draft.id}`);
    }
    if (updated.engineTaskId) throw new Error(`update should not set engineTaskId: ${draft.id}`);

    console.log(
      [
        `[${item.name}]`,
        `taskId=${draft.id}`,
        `status=${updated.status}`,
        `coverage=${plan.coverage.highQualityCoverageRate}%`,
        `warnings=${plan.warnings.length}`,
        `timeline=${plan.timeline.length}`,
        `engineTaskId=${updated.engineTaskId ?? 'null'}`
      ].join(' ')
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
