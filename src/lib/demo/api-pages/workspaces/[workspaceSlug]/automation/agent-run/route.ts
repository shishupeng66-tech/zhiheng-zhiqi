import { NextResponse, type NextRequest } from 'next/server';
import { decideRoute, runTemplateRoute } from '@/lib/workspaces/template-route';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { createAutomationVideoTask } from '@/lib/workspaces/automation-editing';
import { getDb } from '@/lib/db';
import { automationVideoTasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireWorkspacePermission } from '@/lib/workspaces/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ workspaceSlug: string }> };

/**
 * 自动剪辑 Agent 上游主链真实执行入口。
 *
 * 正式路线只有一条：人工剪映草稿 → 蒸馏企业模板 → 按企业模板复用。
 * 没有匹配模板时，入口必须阻断并提示先选择/蒸馏模板，不能回退到自由剪辑链路。
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { workspaceSlug } = await params;
  const result = await requireWorkspacePermission(workspaceSlug, 'video:generate');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'unauthenticated' ? 401 : 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!userMessage) {
    return NextResponse.json(
      { error: 'validation', message: '缺少视频需求或脚本（message）' },
      { status: 400 }
    );
  }

  const context = result.context as unknown as {
    user?: { id?: string; name?: string; role?: string };
    workspaceRole?: string;
  };

  try {
    // ===== 模板提取意图：分析剪映草稿 → 提取到企业知识库模板文件夹 =====
    const parseIntent =
      /(分析|提取|解析|导入|识别).{0,12}(剪映)?\s*草稿|草稿.{0,12}(分析|提取|解析|导入|识别)/.test(
        userMessage
      );
    if (parseIntent) {
      const { runTemplateParse } = await import('@/lib/workspaces/template-parse');
      const { findDraftDir } = await import('@/lib/workspaces/draft-locator');
      const parse = await findDraftDir(userMessage, workspaceSlug);
      if (!parse.ok) {
        return NextResponse.json(
          { ok: false, intent: 'template_parse', error: parse.error },
          { status: 400 }
        );
      }
      if (parse.ok && parse.draftDir) {
        const tpl = await runTemplateParse({
          workspaceSlug,
          draftDir: parse.draftDir,
          templateName: parse.draftName
        });
        if (tpl.ok && tpl.templateId) {
          // 提取完成即注册为可用模板：模板以 testing 状态入库（解析后仍需人工验收）
          return NextResponse.json(
            {
              ok: true,
              intent: 'template_parse',
              templateId: tpl.templateId,
              templateName: tpl.templateName,
              assetPath: tpl.assetPath,
              sourceDir: tpl.sourceDir,
              textSlotCount: tpl.textSlotCount,
              mediaSlotCount: tpl.mediaSlotCount,
              message: `已把剪映草稿「${tpl.templateName}」解析为模板资产：${tpl.textSlotCount ?? 0} 个文字槽、${tpl.mediaSlotCount ?? 0} 个素材槽，已写入企业知识库模板文件夹。`,
              task: {
                id: `parse-${tpl.templateId}`,
                title: `解析模板：${tpl.templateName}`,
                status: 'approved'
              }
            },
            { status: 201 }
          );
        }
        return NextResponse.json(
          { ok: false, intent: 'template_parse', error: tpl.error ?? '模板解析失败' },
          { status: 500 }
        );
      }
    }

    // ===== 路线早分支（SOP：业务上下文后立即决定企业模板）=====
    const decision = await decideRoute(workspaceSlug, userMessage);
    if (decision.route === 'template' && decision.templateId) {
      const tpl = await runTemplateRoute({
        workspaceSlug,
        templateId: decision.templateId,
        businessContext: userMessage
      });
      // 前端任务卡依赖「已完成任务记录」轮询终态：模板路线同步完成，写一条 completed 记录
      let task = null;
      if (tpl.ok) {
        const workspace = getWorkspaceBySlug(workspaceSlug);
        if (workspace && context.user?.id) {
          try {
            const created = createAutomationVideoTask(workspace.id, context.user.id, {
              prompt: userMessage,
              scriptLanguage: '自动检测',
              keywords: [],
              scriptText: '',
              materialSource: '企业素材库',
              materialAssetIds: [],
              stitchMode: '按顺序拼接',
              transitionMode: '无转场',
              videoRatio: '竖屏 9:16',
              clipDuration: '3 秒',
              matchByScript: true,
              voiceMode: '自动配音',
              voiceService: 'enterprise-voice',
              voiceName: 'auto',
              voiceVolume: '100%',
              voiceSpeed: '1.3x',
              musicSource: 'AI 自动匹配音乐',
              musicVolume: 0,
              subtitleEnabled: true,
              subtitleFont: '企业默认字体',
              subtitlePosition: '底部（推荐）',
              subtitleStyle: '简洁商务字幕',
              subtitleSize: '30',
              subtitleColor: '白色',
              subtitleBackground: true,
              packagingOptions: [
                `agentStage:ready_for_jianying`,
                `draftPath:${tpl.draftPath}`,
                `templateId:${tpl.templateId}`,
                `narrationSource:${tpl.narrationSource ?? 'unknown'}`
              ]
            });
            getDb()
              .update(automationVideoTasks)
              .set({
                status: 'approved',
                resultSummary: `模板路线完成：${tpl.textFillCount}/${tpl.textFillTotal} 文字槽、${tpl.mediaPlanCount} 素材槽、配音字幕已写入。草稿：${tpl.draftName}`,
                updatedAt: new Date()
              })
              .where(eq(automationVideoTasks.id, created.id))
              .run();
            task = { id: created.id, title: tpl.draftName, status: 'approved' };
          } catch {
            task = null; // 写任务记录失败不阻断草稿产出
          }
        }
      }
      return NextResponse.json(
        {
          route: 'template',
          templateId: decision.templateId,
          decisionReason: decision.reason,
          ok: tpl.ok,
          task,
          stage: tpl.ok ? 'ready_for_jianying' : 'failed',
          draftName: tpl.draftName,
          draftPath: tpl.draftPath,
          textFillCount: tpl.textFillCount,
          textFillTotal: tpl.textFillTotal,
          constraintFailures: tpl.constraintFailures,
          mediaPlanCount: tpl.mediaPlanCount,
          structureVerified: tpl.structureVerified,
          verifyReport: tpl.verifyReport,
          voice: tpl.voice,
          narrationSource: tpl.narrationSource,
          error: tpl.error
        },
        { status: tpl.ok ? 201 : 500 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        route: decision.route,
        error: 'template_required',
        decisionReason: decision.reason,
        message:
          '当前自动剪辑只支持企业模板路线：请先指定已有企业模板，或把人工剪辑完成的剪映草稿蒸馏为企业模板后再生成。'
      },
      { status: 422 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'agent_run_failed',
        message: error instanceof Error ? error.message : '自动剪辑 Agent 上游执行失败'
      },
      { status: 500 }
    );
  }
}
