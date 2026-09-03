'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { V0AiChat, type V0ChatAttachment, type V0ChatMessage } from '@/components/ui/v0-ai-chat';
import { Icons } from '@/components/icons';
import { WorkspaceHeaderActions } from '@/features/workspaces/components/workspace-header-actions';
import { AutoEditTaskCard } from '@/features/workspaces/automation-editing/auto-edit-task-card';
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

type VideoStyle = {
  id: string;
  name: string;
  description: string;
  sampleScript: string;
  keywords: string[];
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

const videoStyles: VideoStyle[] = [
  {
    id: 'knowledge',
    name: '知识科普型',
    description: '解释工艺、原理和客户关心的问题。',
    sampleScript:
      '这条视频可以从一个客户常见疑问切入：为什么企业宣传视频不能只拍设备，还要讲清楚生产流程、质检节点和交付标准。系统会围绕问题、原因和解决方式生成一版短视频脚本。',
    keywords: ['知识科普', '生产流程', '质检节点', '交付标准']
  },
  {
    id: 'factory',
    name: '工厂实力展示型',
    description: '突出设备、产线、工艺、质检与交付能力。',
    sampleScript:
      '这条视频会按工厂实力展示思路展开：先展示生产现场，再说明关键工艺和质检环节，最后回到企业稳定交付能力，让客户快速建立信任。',
    keywords: ['工厂实力', '生产线', '工艺流程', '质量控制']
  },
  {
    id: 'boss-ip',
    name: '老板观点型',
    description: '用负责人视角表达行业判断和经营理念。',
    sampleScript:
      '这条视频会采用负责人观点表达：从一个行业判断开场，再结合真实生产或服务场景说明为什么企业要重视长期稳定的内容生产。',
    keywords: ['老板观点', '行业判断', '企业经营', '客户信任']
  },
  {
    id: 'case',
    name: '产品案例型',
    description: '围绕产品、应用场景和客户需求组织内容。',
    sampleScript:
      '这条视频会从产品应用场景切入，展示客户需求、产品特点和落地过程，适合用来生成案例展示或产品宣传内容。',
    keywords: ['产品案例', '应用场景', '客户需求', '产品展示']
  }
];

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
  return videoStyles[Math.floor(Math.random() * videoStyles.length)] ?? videoStyles[0];
}

export function AutomationEditingOverviewPage({
  workspaceSlug
}: AutomationEditingOverviewPageProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<V0ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedStyle, setSelectedStyle] = React.useState<VideoStyle | null>(null);
  const [draftScript, setDraftScript] = React.useState('');
  const [productionVoices, setProductionVoices] = React.useState<ProductionVoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState('auto');
  const [selectedRatio, setSelectedRatio] = React.useState('9:16');
  const [selectedResolution, setSelectedResolution] = React.useState('1080p');
  const restoredRef = React.useRef(false);

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

  // 刷新 / 重进页面后，若后端任务 API 可用，则恢复最近一条自动剪辑任务的状态卡片。
  React.useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
          cache: 'no-store'
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          tasks?: Array<{
            id: string;
            title?: string;
            createdAt?: string | number;
            materialAssetIds?: string[];
            status?: string;
          }>;
        } | null;
        const tasks = Array.isArray(payload?.tasks) ? payload!.tasks : [];
        if (cancelled || tasks.length === 0) return;

        setMessages((current) => {
          if (current.length > 0) return current;
          const latest = tasks[0];
          const rawCreated = latest.createdAt;
          const createdAt =
            typeof rawCreated === 'number'
              ? rawCreated
              : new Date(rawCreated ?? '').getTime() || Date.now();
          const restoredTitle = latest.title || '未命名任务';
          return [
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `已为你恢复最近一次自动剪辑任务：${restoredTitle}`,
              contentNode: (
                <AutoEditTaskCard
                  workspaceSlug={workspaceSlug}
                  taskId={latest.id}
                  title={restoredTitle}
                  createdAt={createdAt}
                  ratioLabel={RATIO_LABELS[selectedRatio] ?? selectedRatio}
                  assetCount={
                    Array.isArray(latest.materialAssetIds) ? latest.materialAssetIds.length : 0
                  }
                  draftPath={`企业素材库/剪映草稿/${restoredTitle}.draft`}
                />
              )
            }
          ];
        });
      } catch {
        // 恢复失败不影响新建任务，忽略即可。
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

  function generateScript(style: VideoStyle) {
    setSelectedStyle(style);
    setDraftScript(style.sampleScript);
    appendAssistantMessage(
      [
        `已按「${style.name}」生成视频脚本草案。`,
        '',
        style.sampleScript,
        '',
        `关键词：${style.keywords.join('、')}`,
        '',
        '如果不满意，可以重新选择风格生成。'
      ].join('\n')
    );
  }

  function autoAddMaterials() {
    const style = selectedStyle ?? pickRandomStyle();
    if (!selectedStyle) {
      setSelectedStyle(style);
      setDraftScript(style.sampleScript);
    }
    appendAssistantMessage(
      [
        selectedStyle
          ? `已根据「${style.name}」自动匹配素材。`
          : `未选择风格，系统已随机采用「${style.name}」并生成脚本与素材匹配方案。`,
        '',
        draftScript || style.sampleScript,
        '',
        '素材会在后台按脚本内容自动选择，不在当前页面展开。'
      ].join('\n')
    );
  }

  async function createAutomationTask(message: string, files: File[]) {
    const prompt = message.trim();
    const userAttachments = files.map(fileToAttachment);
    const userText =
      prompt || draftScript || selectedStyle?.sampleScript || '请自动生成一条企业宣传短视频。';
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

  async function handleSubmit(message: string, files: File[]) {
    await createAutomationTask(message, files);
  }

  async function handleOneClickGenerate() {
    await createAutomationTask(draftScript || selectedStyle?.sampleScript || '', []);
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
              label: '自动生成视频脚本',
              icon: <Icons.sparkles className='size-4' />,
              menuItems: [
                ...videoStyles.map((style) => ({
                  label: style.name,
                  description: style.description,
                  icon: <Icons.video className='size-4' />,
                  onClick: () => generateScript(style)
                })),
                {
                  label: '添加视频风格',
                  description: '进入风格库维护更多视频风格',
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
