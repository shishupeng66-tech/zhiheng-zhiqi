'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { V0AiChat, type V0ChatAttachment, type V0ChatMessage } from '@/components/ui/v0-ai-chat';
import { Icons } from '@/components/icons';
import { WorkspaceHeaderActions } from '@/features/workspaces/components/workspace-header-actions';
import { AutoEditTaskCard } from '@/features/workspaces/automation-editing/auto-edit-task-card';
import { ScriptDraftCard } from '@/features/workspaces/automation-editing/script-draft-card';
import {
  MaterialPreviewCard,
  type MaterialPreviewSegment
} from '@/features/workspaces/automation-editing/material-preview-card';
import {
  VIDEO_SCRIPT_STYLES,
  type VideoScriptStyle
} from '@/features/workspaces/automation-editing/script-styles';
import { toast } from 'sonner';

type AutomationEditingOverviewPageProps = {
  workspaceSlug: string;
};

type UploadedAsset = {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
};

type ProductionVoiceOption = {
  id: string;
  label: string;
  description?: string;
};

type VoiceCatalogItem = {
  voiceType: string;
  displayName: string;
  gender?: string | null;
  scene?: string | null;
  enabledForProduction?: boolean;
};

type EnterpriseTemplate = {
  templateId: string;
  /** 模板库目录里的文件夹名（用户改名后即跟随） */
  displayName: string;
  templateName: string;
  status: string;
  canvas: string;
  durationSec: number;
  textSlotCount: number;
  mediaSlotCount: number;
  assetPath: string;
};

const RATIO_LABELS: Record<string, string> = {
  '9:16': '竖屏 9:16',
  '16:9': '横屏 16:9',
  '3:4': '竖屏 3:4',
  '4:3': '横屏 4:3'
};

const defaultTaskPayload = {
  scriptLanguage: '自动检测',
  materialSource: '企业素材库',
  stitchMode: '按文案顺序匹配画面',
  transitionMode: '无转场',
  videoRatio: '竖屏 9:16',
  clipDuration: '3',
  matchByScript: true,
  voiceMode: '自动配音',
  voiceService: 'enterprise-voice',
  voiceName: 'auto',
  voiceVolume: '100%',
  voiceSpeed: '1.0x',
  musicSource: '随机背景音乐',
  musicVolume: 30,
  subtitleEnabled: true,
  subtitleFont: 'STHeitiMedium.ttc',
  subtitlePosition: '底部（推荐）',
  subtitleStyle: '简洁商务字幕',
  subtitleSize: '30',
  subtitleColor: '#F3EDED',
  subtitleBackground: false,
  packagingOptions: ['title', 'description', 'tags', 'cover']
};

function fileToAttachment(file: File): V0ChatAttachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size
  };
}

function pickRandomStyle() {
  return (
    VIDEO_SCRIPT_STYLES[Math.floor(Math.random() * VIDEO_SCRIPT_STYLES.length)] ??
    VIDEO_SCRIPT_STYLES[0]
  );
}

export function AutomationEditingOverviewPage({
  workspaceSlug
}: AutomationEditingOverviewPageProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<V0ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedStyle, setSelectedStyle] = React.useState<VideoScriptStyle | null>(null);
  const [draftScript, setDraftScript] = React.useState('');
  const [confirmedScript, setConfirmedScript] = React.useState('');
  const [productionVoices, setProductionVoices] = React.useState<ProductionVoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState('auto');
  const [selectedRatio, setSelectedRatio] = React.useState('9:16');
  const [selectedResolution, setSelectedResolution] = React.useState('1080p');
  const [enterpriseTemplates, setEnterpriseTemplates] = React.useState<EnterpriseTemplate[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProductionVoices() {
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/voices?enabledOnly=true`, {
          cache: 'no-store'
        });
        const payload = (await response.json().catch(() => ({}))) as {
          voices?: VoiceCatalogItem[];
        };
        if (!response.ok || !Array.isArray(payload.voices) || cancelled) return;
        setProductionVoices(
          payload.voices.map((voice) => ({
            id: voice.voiceType,
            label: voice.displayName,
            description: [voice.gender, voice.scene].filter(Boolean).join(' · ') || undefined
          }))
        );
      } catch {
        if (!cancelled) setProductionVoices([]);
      }
    }

    void loadProductionVoices();

    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  // 加载企业模板库（数据存储「模板库」根目录），供「视频类型」选择使用。
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/templates/enterprise?workspace=${encodeURIComponent(workspaceSlug)}`,
          { cache: 'no-store' }
        );
        const payload = (await response.json().catch(() => null)) as {
          templates?: EnterpriseTemplate[];
        } | null;
        if (cancelled || !payload?.templates) return;
        setEnterpriseTemplates(payload.templates);
      } catch {
        if (!cancelled) setEnterpriseTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  async function uploadAsset(file: File): Promise<UploadedAsset> {
    const formData = new FormData();
    formData.append('asset', file);
    const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/assets`, {
      method: 'POST',
      body: formData
    });
    const payload = (await response.json().catch(() => ({}))) as {
      asset?: UploadedAsset;
      message?: string;
    };
    if (!response.ok || !payload.asset) {
      throw new Error(payload.message || `素材上传失败：${file.name}`);
    }
    return payload.asset;
  }

  function appendAssistantMessage(content: string) {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content
      }
    ]);
  }

  /**
   * 选择脚本风格 → 调用项目配置模型生成【真实完整脚本】草案（不进入正式剪辑链路）。
   * topic 来自当前输入框（V0AiChat 透传）；为空时回退到最近一条用户消息。
   */
  async function generateScript(style: VideoScriptStyle, topic?: string) {
    setSelectedStyle(style);
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        content: `正在按「${style.name}」风格生成视频脚本草案…`
      }
    ]);

    const fallbackTopic = [...messages]
      .reverse()
      .find((message) => message.role === 'user')?.content;

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/script-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId: style.id,
          topic: topic?.trim() || fallbackTopic || ''
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        script?: string;
        styleName?: string;
        keywords?: string[];
        charCount?: number;
        estimatedDurationSec?: number;
        message?: string;
      };
      if (!response.ok || !payload.ok || !payload.script) {
        throw new Error(payload.message || '脚本生成失败，请稍后重试');
      }

      const script = payload.script;
      setDraftScript(script);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `已按「${style.name}」生成视频脚本草案。`,
                contentNode: (
                  <ScriptDraftCard
                    styleName={payload.styleName ?? style.name}
                    keywords={payload.keywords ?? style.keywords}
                    initialScript={script}
                    charCount={payload.charCount ?? script.length}
                    estimatedDurationSec={payload.estimatedDurationSec ?? 0}
                    onRegenerate={() => void generateScript(style, topic)}
                    onConfirm={(editedScript) => handleConfirmScript(editedScript, style)}
                  />
                )
              }
            : item
        )
      );
    } catch (error) {
      const content = error instanceof Error ? error.message : '脚本生成失败，请稍后重试。';
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content } : item))
      );
      toast.error(content);
    }
  }

  /** 确认使用脚本草案：记录为「最终采用脚本」，供一键生成/正式链路使用。 */
  function handleConfirmScript(script: string, style: VideoScriptStyle) {
    const finalScript = script.trim();
    if (!finalScript) return;
    setConfirmedScript(finalScript);
    setDraftScript(finalScript);
    appendAssistantMessage(
      [
        `已确认使用「${style.name}」风格的脚本。`,
        '',
        '点击「一键生成」即可使用该脚本正式制作视频（配音 / 素材匹配 / 时间线 / 剪映草稿）。'
      ].join('\n')
    );
  }

  /** 自动添加素材：真实执行素材匹配，并展示用户可读的素材列表（不进入正式剪辑链路）。 */
  async function autoAddMaterials() {
    const style = selectedStyle ?? pickRandomStyle();
    if (!selectedStyle) {
      setSelectedStyle(style);
    }
    const lastUserTopic =
      [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const script = confirmedScript || draftScript || lastUserTopic || '';

    if (!script) {
      appendAssistantMessage(
        '请先输入视频主题或生成脚本，再点击「自动添加素材」，以便系统按脚本匹配企业素材。'
      );
      return;
    }

    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        content: '正在按脚本匹配企业素材…'
      }
    ]);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/material-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        total?: number;
        segments?: MaterialPreviewSegment[];
        message?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || '素材匹配失败，请稍后重试');
      }

      const segments = payload.segments ?? [];
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `已按脚本匹配到 ${payload.total ?? segments.length} 段企业素材。`,
                contentNode: (
                  <MaterialPreviewCard
                    total={payload.total ?? segments.length}
                    segments={segments}
                  />
                )
              }
            : item
        )
      );
    } catch (error) {
      const content = error instanceof Error ? error.message : '素材匹配失败，请稍后重试。';
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content } : item))
      );
      toast.error(content);
    }
  }

  async function createAutomationTask(message: string, files: File[]) {
    const prompt = message.trim();
    const userAttachments = files.map(fileToAttachment);
    const userText = prompt || draftScript || confirmedScript || '请自动生成一条企业宣传短视频。';
    const userMessage: V0ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
      attachments: userAttachments
    };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: 'assistant',
        content: '正在接收素材并创建自动剪辑任务...'
      }
    ]);
    setIsSubmitting(true);

    try {
      const uploadedAssets: UploadedAsset[] = [];
      for (const file of files) {
        uploadedAssets.push(await uploadAsset(file));
      }

      const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/agent-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          useLlm: true
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        task?: { id: string; status: string; title?: string };
        stage?: string;
        videoRatio?: string;
        targetDuration?: number;
        assetCount?: number;
        timeline?: { videoTrack?: Array<{ duration: number }> };
        message?: string;
      };
      if (!response.ok || !payload.task) {
        throw new Error(payload.message || '自动剪辑任务创建失败');
      }

      const task = payload.task;
      const taskTitle = task.title || userText;
      // 验收用：用户输入含「故意失败 / 测试失败」时演示失败分支；真实接入后由后端决定。
      const forceFail = /故意失败|测试失败|失败演示/.test(message);
      const ratioLabel =
        payload.videoRatio && RATIO_LABELS[payload.videoRatio]
          ? RATIO_LABELS[payload.videoRatio]
          : (RATIO_LABELS[selectedRatio] ?? selectedRatio);
      const timelineDuration = Array.isArray(payload.timeline?.videoTrack)
        ? payload.timeline!.videoTrack!.reduce((sum, seg) => sum + (seg.duration || 0), 0)
        : 0;
      const durationLabel = `约 ${Math.max(1, Math.round(timelineDuration))} 秒`;
      const assetCount = typeof payload.assetCount === 'number' ? payload.assetCount : 0;
      const draftPath = `企业素材库/剪映草稿/${taskTitle}.draft`;

      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `已为你创建自动剪辑任务：${taskTitle}`,
                contentNode: (
                  <AutoEditTaskCard
                    workspaceSlug={workspaceSlug}
                    taskId={task.id}
                    title={taskTitle}
                    createdAt={Date.now()}
                    forceFail={forceFail}
                    ratioLabel={ratioLabel}
                    durationLabel={durationLabel}
                    assetCount={assetCount}
                    draftPath={draftPath}
                  />
                )
              }
            : item
        )
      );
      toast.success('自动剪辑任务已创建');
    } catch (error) {
      const content =
        error instanceof Error ? error.message : '自动剪辑服务暂时不可用，请稍后重试。';
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content } : item))
      );
      toast.error(content);
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 第一步：选择企业模板 + 用户需求 → 只生成脚本文案（快），用户确认后再匹配素材、再生成。 */
  async function generateByTemplate(template: EnterpriseTemplate, topic?: string) {
    setSelectedStyle(null);
    const fallbackTopic =
      [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const businessContext = topic?.trim() || fallbackTopic || '';
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        content: `正在按「${template.displayName}」模板生成脚本文案…`
      }
    ]);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/template-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.templateId, businessContext })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        templateId?: string;
        textFillCount?: number;
        textFillTotal?: number;
        constraintFailures?: Array<{ slotId?: string; reason?: string }>;
        mediaPlanCount?: number;
        textPlan?: Record<string, string>;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.message || '生成文案失败，请稍后重试');
      }
      const textPlan = payload.textPlan || {};
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `已按「${template.displayName}」模板生成脚本文案（${Object.keys(textPlan).length} 段）。请先确认文案，再匹配素材。`,
                contentNode: (
                  <TemplateStepCard
                    workspaceSlug={workspaceSlug}
                    templateId={template.templateId}
                    templateName={template.displayName}
                    businessContext={businessContext}
                    textPlan={textPlan}
                    constraintFailures={payload.constraintFailures ?? []}
                    onComplete={(info) => {
                      setMessages((cur) =>
                        cur.map((m) =>
                          m.id === assistantId
                            ? {
                                ...m,
                                content: `已生成剪映草稿：${info.draftName}`,
                                contentNode: (
                                  <AutoEditTaskCard
                                    workspaceSlug={workspaceSlug}
                                    taskId={info.draftName}
                                    title={info.draftName}
                                    createdAt={Date.now()}
                                    ratioLabel={RATIO_LABELS['9:16'] ?? '9:16'}
                                    durationLabel={undefined}
                                    assetCount={info.mediaPlanCount}
                                    draftPath={
                                      info.draftPath ||
                                      `企业素材库/剪映草稿/${info.draftName}.draft`
                                    }
                                  />
                                )
                              }
                            : m
                        )
                      );
                    }}
                  />
                )
              }
            : item
        )
      );
    } catch (error) {
      const content = error instanceof Error ? error.message : '生成文案失败，请稍后重试。';
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content } : item))
      );
      toast.error(content);
    }
  }

  async function handleSubmit(message: string, files: File[]) {
    await createAutomationTask(message, files);
  }

  async function handleOneClickGenerate() {
    // 优先使用用户确认的脚本；其次使用最近生成的脚本草案；再回退到最近用户消息。
    const lastUserTopic =
      [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const message = confirmedScript || draftScript || lastUserTopic || '';
    await createAutomationTask(message, []);
  }

  return (
    <>
      <WorkspaceHeaderActions>
        <div className='flex items-center gap-2'>
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={`/dashboard/workspaces/${workspaceSlug}/review`}
          >
            <Icons.video className='size-4' />
            任务审核
          </Link>
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={`/dashboard/workspaces/${workspaceSlug}/assets`}
          >
            <Icons.media className='size-4' />
            素材资产
          </Link>
        </div>
      </WorkspaceHeaderActions>

      <div className='min-h-[calc(100vh-180px)] bg-background'>
        <V0AiChat
          title='今天要生成什么视频？'
          placeholder='描述视频主题、目标客户、口播方向或成片要求，也可以直接上传素材...'
          messages={messages}
          isGenerating={isSubmitting}
          acceptedFileTypes='image/*,video/*,.md,.txt,.pdf,.csv'
          onSubmit={handleSubmit}
          voiceOptions={productionVoices}
          onVoiceChange={(option) => setSelectedVoiceId(option.id)}
          ratioOptions={[
            { id: '9:16', label: '9:16' },
            { id: '16:9', label: '16:9' },
            { id: '3:4', label: '3:4' },
            { id: '4:3', label: '4:3' }
          ]}
          onRatioChange={(option) => setSelectedRatio(option.id)}
          resolutionOptions={[
            { id: '720p', label: '720P' },
            { id: '1080p', label: '1080P' }
          ]}
          onResolutionChange={(option) => setSelectedResolution(option.id)}
          modelMenu={{
            label: '知衡默认模型',
            configuredModels: [
              {
                id: 'zhiheng-default',
                label: '知衡默认模型',
                description: '当前自动剪辑使用的默认智能模型',
                active: true
              }
            ],
            onConfigure: () => router.push('/dashboard/system/providers')
          }}
          quickActions={[
            {
              label: '按模板生成方案',
              icon: <Icons.sparkles className='size-4' />,
              menuItems: [
                ...enterpriseTemplates.map((t) => ({
                  label: t.displayName,
                  description: `${t.templateName && t.templateName !== t.displayName ? t.templateName + ' · ' : ''}${t.canvas || '—'} · ${t.status === 'approved' ? '已验收' : '测试中'} · ${t.textSlotCount}文字槽`,
                  icon: <Icons.video className='size-4' />,
                  onClick: (topic?: string) => void generateByTemplate(t, topic)
                })),
                {
                  label: '添加剪映模板',
                  description: '进入模板库管理可复用的剪映模板',
                  icon: <Icons.add className='size-4' />,
                  onClick: () => router.push(`/dashboard/workspaces/${workspaceSlug}/projects`)
                }
              ]
            },
            {
              label: '自动添加素材',
              icon: <Icons.media className='size-4' />,
              onClick: autoAddMaterials
            },
            {
              label: '一键生成',
              icon: <Icons.video className='size-4' />,
              variant: 'primary',
              onClick: () => void handleOneClickGenerate()
            }
          ]}
        />
      </div>
    </>
  );
}

/**
 * 模板分步卡片（SOP：先文案 → 再素材 → 最后生成）。
 * - step=script：展示生成的脚本文案，用户确认后匹配素材
 * - step=media ：展示素材计划，用户确认后生成剪映草稿
 * - step=done  ：生成完成，回调 onComplete 交给外层替换为任务卡
 */
function TemplateStepCard({
  workspaceSlug,
  templateId,
  templateName,
  businessContext,
  textPlan,
  constraintFailures,
  onComplete
}: {
  workspaceSlug: string;
  templateId: string;
  templateName: string;
  businessContext: string;
  textPlan: Record<string, string>;
  constraintFailures: Array<{ slotId?: string; reason?: string }>;
  onComplete: (info: { draftName: string; draftPath?: string; mediaPlanCount: number }) => void;
}) {
  const [step, setStep] = React.useState<'script' | 'media' | 'done'>('script');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [mediaPlan, setMediaPlan] = React.useState<
    Record<string, { fileName?: string; assetPath?: string; assetDurationSec?: number }>
  >({});
  const entries = Object.entries(textPlan || {});
  const failed = (constraintFailures || []).filter((f) => typeof f.slotId === 'string' && f.reason);
  const mediaEntries = Object.entries(mediaPlan || {});

  async function confirmScript() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/template-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, businessContext, explicitTextPlan: textPlan })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        mediaPlan?: Record<
          string,
          { fileName?: string; assetPath?: string; assetDurationSec?: number }
        >;
        mediaPlanCount?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '素材匹配失败，请稍后重试');
      }
      setMediaPlan(payload.mediaPlan ?? {});
      setStep('media');
    } catch (e) {
      setError(e instanceof Error ? e.message : '素材匹配失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMedia() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/automation/template-finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            businessContext,
            explicitTextPlan: textPlan,
            mediaPlan
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        draftName?: string;
        draftPath?: string;
        mediaPlanCount?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.draftName) {
        throw new Error(payload.error || '生成剪映草稿失败');
      }
      setStep('done');
      onComplete({
        draftName: payload.draftName,
        draftPath: payload.draftPath,
        mediaPlanCount: payload.mediaPlanCount ?? mediaEntries.length
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成剪映草稿失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='rounded-lg border bg-background/60 p-4'>
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <p className='font-medium'>
            模板：{templateName}
            {step === 'media' && (
              <span className='ml-2 text-xs text-muted-foreground'>文案已确认</span>
            )}
            {step === 'done' && <span className='ml-2 text-xs text-green-500'>已生成</span>}
          </p>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {step === 'script' && `${entries.length} 段文案 · 请确认后匹配素材`}
            {step === 'media' && `${mediaEntries.length} 个素材槽 · 请确认后生成剪映草稿`}
            {failed.length > 0 && (
              <span className='ml-2 text-amber-500'>{failed.length} 个槽位未通过字数约束</span>
            )}
          </p>
        </div>
        {step === 'script' && (
          <Button size='sm' disabled={busy} onClick={() => void confirmScript()}>
            {busy ? '正在匹配素材…' : '确认文案，匹配素材'}
          </Button>
        )}
        {step === 'media' && (
          <Button size='sm' disabled={busy} onClick={() => void confirmMedia()}>
            {busy ? '正在生成…' : '确认素材，生成剪映草稿'}
          </Button>
        )}
      </div>

      {error && <p className='mb-2 text-xs text-red-500'>{error}</p>}

      {step === 'script' && (
        <div className='max-h-64 space-y-1.5 overflow-y-auto rounded-md bg-muted/30 p-3'>
          {entries.length === 0 && (
            <p className='text-xs text-muted-foreground'>该模板没有可替换文字槽位。</p>
          )}
          {entries.map(([slotId, text], index) => (
            <div key={slotId} className='flex items-baseline gap-2 text-sm'>
              <span className='shrink-0 text-xs text-muted-foreground' title={`槽位 ID：${slotId}`}>
                {index + 1}.
              </span>
              <span className='break-all'>{text}</span>
            </div>
          ))}
        </div>
      )}

      {step === 'media' && (
        <div className='max-h-64 space-y-1.5 overflow-y-auto rounded-md bg-muted/30 p-3'>
          {mediaEntries.length === 0 && (
            <p className='text-xs text-muted-foreground'>
              未匹配到素材（请确认“系统管理 /
              数据存储”中的“视频素材库”路径与索引）。可直接生成，草稿将沿用母版素材。
            </p>
          )}
          {mediaEntries.map(([materialId, info]) => (
            <div key={materialId} className='flex items-baseline gap-2 text-sm'>
              <span className='shrink-0 font-mono text-[10px] text-muted-foreground'>
                {info.fileName || materialId}
              </span>
              <span className='break-all text-muted-foreground'>
                {info.assetPath ?? ''}
                {typeof info.assetDurationSec === 'number'
                  ? ` · ${info.assetDurationSec.toFixed(1)}s`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
