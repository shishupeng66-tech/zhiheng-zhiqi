'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { automationVoiceOptions } from './voice-options';
import { useCurrentUser } from '@/components/auth/user-provider';
import { toast } from 'sonner';

type UploadedAsset = {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
};

type UploadTarget = 'material' | 'voice' | 'music';

type FormState = {
  prompt: string;
  scriptLanguage: string;
  paragraphNumber: string;
  keywords: string;
  scriptText: string;
  scriptPrompt: string;
  customSystemPrompt: string;
  materialSource: string;
  stitchMode: string;
  transitionMode: string;
  videoRatio: string;
  clipDuration: string;
  videoCount: string;
  clipSpeed: string;
  videoEncoder: string;
  stopAt: string;
  workerThreads: string;
  matchByScript: boolean;
  voiceMode: string;
  voiceService: string;
  voiceName: string;
  voiceVolume: string;
  voiceSpeed: string;
  customAudioAssetId: string;
  customAudioFileName: string;
  musicSource: string;
  musicPrompt: string;
  customMusicAssetId: string;
  customMusicFileName: string;
  musicVolume: number;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitlePosition: string;
  customSubtitlePosition: string;
  subtitleSize: string;
  subtitleColor: string;
  strokeColor: string;
  strokeWidth: string;
  subtitleBackground: boolean;
  subtitleBackgroundColor: string;
  roundedSubtitleBackground: boolean;
  titleEnabled: boolean;
  descriptionEnabled: boolean;
  tagsEnabled: boolean;
  coverEnabled: boolean;
};

const initialForm: FormState = {
  prompt: '',
  scriptLanguage: '自动检测',
  paragraphNumber: '1 段',
  keywords: '',
  scriptText: '',
  scriptPrompt: '',
  customSystemPrompt: '',
  materialSource: '本地文件',
  stitchMode: '顺序拼接',
  transitionMode: '无转场',
  videoRatio: '竖屏 9:16（抖音视频）',
  clipDuration: '3',
  videoCount: '1',
  clipSpeed: '1.0x',
  videoEncoder: '默认（推荐）',
  stopAt: '完整视频',
  workerThreads: '2',
  matchByScript: true,
  voiceMode: '自动配音',
  voiceService: 'enterprise-voice',
  voiceName: 'auto',
  voiceVolume: '100%',
  voiceSpeed: '1.0x',
  customAudioAssetId: '',
  customAudioFileName: '',
  musicSource: '随机背景音乐',
  musicPrompt: '',
  customMusicAssetId: '',
  customMusicFileName: '',
  musicVolume: 30,
  subtitleEnabled: true,
  subtitleFont: 'BeVietnamPro-Bold.ttf',
  subtitlePosition: '底部（推荐）',
  customSubtitlePosition: '70',
  subtitleSize: '30',
  subtitleColor: '#F3EDED',
  strokeColor: '#000000',
  strokeWidth: '1.50',
  subtitleBackground: false,
  subtitleBackgroundColor: '#000000',
  roundedSubtitleBackground: false,
  titleEnabled: true,
  descriptionEnabled: true,
  tagsEnabled: true,
  coverEnabled: true
};

const keywordSuggestions = ['企业实力', '生产能力', '质量控制', '交付稳定', '客户信任'];

const defaultSystemPrompt = `# Role: Video Script Generator

## Goals:
Generate a script for a video, depending on the subject of the video.

## Constraints:
1. The script is to be returned as a string with the specified number of paragraphs.
2. Do not under any circumstance reference this prompt in your response.
3. Keep the language natural, concise, and suitable for short video narration.`;

function splitKeywords(value: string) {
  return value
    .split(/[,\s，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const normalizedOptions = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option
  );
  const currentLabel = normalizedOptions.find((option) => option.value === value)?.label ?? value;
  return (
    <div className='grid gap-1.5'>
      <div className='text-xs font-medium text-muted-foreground'>{label}</div>
      <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger className='h-8 w-full text-xs'>
          <span>{currentLabel}</span>
        </SelectTrigger>
        <SelectContent>
          {normalizedOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompactSwitch({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className='flex h-8 items-center justify-between rounded-md border px-2.5'>
      <span className='text-xs font-medium'>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  disabled
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant='outline'
      size='sm'
      className='h-8 justify-center text-xs'
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function MiniPanel({ children }: { children: React.ReactNode }) {
  return <div className='rounded-md border bg-muted/20 p-2'>{children}</div>;
}

function ColorPickerField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className='grid gap-1.5'>
      <div className='text-xs font-medium'>{label}</div>
      <div className='flex items-center gap-2'>
        <label
          className='relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border'
          style={{ backgroundColor: value }}
          aria-label={label}
        >
          <input
            type='color'
            className='absolute inset-0 size-full cursor-pointer opacity-0'
            value={value}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
        </label>
        <Input
          className='h-8 text-xs uppercase'
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
}) {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : min;

  return (
    <div className='grid gap-1.5'>
      <div className='flex items-center justify-between text-xs font-medium'>
        <span>{label}</span>
        <span className='text-primary'>{value}</span>
      </div>
      <Slider
        value={[safeValue]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(next) => {
          const raw = Array.isArray(next) ? (next[0] ?? safeValue) : safeValue;
          onChange(step < 1 ? raw.toFixed(2).replace(/\.00$/, '') : String(raw));
        }}
      />
    </div>
  );
}

function StepCard({
  number,
  icon: Icon,
  title,
  description,
  children
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className='flex h-[calc(100vh-265px)] min-h-[520px] flex-col overflow-hidden'>
      <CardHeader className='p-3 pb-2'>
        <div className='flex items-center gap-2'>
          <div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
            <Icon className='size-4' />
          </div>
          <Badge variant='secondary'>{number}</Badge>
          <CardTitle className='text-base'>{title}</CardTitle>
        </div>
        <p className='mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground'>{description}</p>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-2.5 overflow-y-auto p-3 pt-0'>
        {children}
      </CardContent>
    </Card>
  );
}

export function AutomationEditingOverviewPage({ workspaceSlug }: { workspaceSlug: string }) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = React.useRef<UploadTarget>('material');
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [assets, setAssets] = React.useState<UploadedAsset[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [aiGenerating, setAiGenerating] = React.useState(false);
  const [previewing, setPreviewing] = React.useState<'voice' | 'full' | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = React.useState('');
  const [scriptSettingsOpen, setScriptSettingsOpen] = React.useState(false);
  const previewCacheRef = React.useRef(new Map<string, string>());
  const user = useCurrentUser();

  React.useEffect(() => {
    return () => {
      for (const url of previewCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(target: UploadTarget) {
    uploadTargetRef.current = target;
    if (fileInputRef.current) {
      fileInputRef.current.multiple = target === 'material';
    }
    fileInputRef.current?.click();
  }

  async function generateAiDraft() {
    const prompt = form.prompt.trim();
    if (!prompt) {
      toast.error('请先输入视频主题或需求');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'video_copy',
          topic: prompt,
          language: form.scriptLanguage,
          existingScript: form.scriptText,
          style: form.scriptPrompt
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? 'AI服务暂时不可用，请稍后重试。');
        return;
      }
      setForm((current) => ({
        ...current,
        scriptText: String(payload.script ?? ''),
        keywords: Array.isArray(payload.keywords) ? payload.keywords.join('、') : current.keywords
      }));
      toast.success('已生成可编辑的视频文案和关键词');
    } finally {
      setAiGenerating(false);
    }
  }

  async function generateAiKeywords() {
    const script = form.scriptText.trim();
    if (!script) {
      toast.error('请先输入或生成视频文案');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'keywords', script })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? 'AI服务暂时不可用，请稍后重试。');
        return;
      }
      setForm((current) => ({
        ...current,
        keywords: Array.isArray(payload.keywords) ? payload.keywords.join('、') : current.keywords
      }));
      toast.success('已根据文案生成视频关键词');
    } finally {
      setAiGenerating(false);
    }
  }

  async function uploadOneAsset(file: File, target: UploadTarget) {
    const data = new FormData();
    data.set('asset', file);
    const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/assets`, {
      method: 'POST',
      body: data
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${file.name}：${payload.message ?? '文件上传失败'}`);
    }

    const asset = payload.asset as UploadedAsset | undefined;
    if (!asset?.id) {
      throw new Error(`${file.name}：上传接口未返回素材信息`);
    }

    setAssets((current) => [asset, ...current]);
    if (target === 'voice') {
      setForm((current) => ({
        ...current,
        voiceMode: '上传音频',
        customAudioAssetId: asset.id,
        customAudioFileName: asset.name
      }));
    } else if (target === 'music') {
      setForm((current) => ({
        ...current,
        musicSource: '自定义背景音乐',
        customMusicAssetId: asset.id,
        customMusicFileName: asset.name
      }));
    } else {
      setForm((current) => ({ ...current, materialSource: '本地文件' }));
    }
  }

  async function uploadAssets(files: File[], target: UploadTarget) {
    setUploading(true);
    try {
      for (const file of files) {
        await uploadOneAsset(file, target);
      }

      if (target === 'voice') {
        toast.success('配音音频已接入本次任务');
      } else if (target === 'music') {
        toast.success('背景音乐已接入本次任务');
      } else {
        toast.success(`已上传 ${files.length} 个素材`);
      }
    } catch (error) {
      console.error('[automation-assets] upload failed', error);
      toast.error(error instanceof Error ? error.message : '文件上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAsset(assetId: string) {
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
  }

  function currentVoiceSpeed() {
    const value = Number.parseFloat(form.voiceSpeed.replace('x', ''));
    return Number.isFinite(value) ? value : 1;
  }

  function currentVoiceVolume() {
    const value = Number.parseInt(form.voiceVolume.replace('%', ''), 10);
    return Number.isFinite(value) ? value / 100 : 1;
  }

  async function playVoicePreview(kind: 'voice' | 'full') {
    const text = kind === 'voice' ? '你好，这是当前音色的试听效果。' : form.scriptText.trim();
    if (!text) {
      toast.error('请先输入或生成视频文案');
      return;
    }

    const speed = currentVoiceSpeed();
    const volume = currentVoiceVolume();
    const cacheKey = JSON.stringify({ kind, text, voiceId: form.voiceName, speed, volume });
    const cachedUrl = previewCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      setPreviewAudioUrl(cachedUrl);
      await new Audio(cachedUrl).play().catch(() => undefined);
      return;
    }

    setPreviewing(kind);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/voice-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: form.voiceName,
          speed,
          volume
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message ?? '试听生成失败，请稍后重试。');
      }

      const audioUrl = URL.createObjectURL(await res.blob());
      previewCacheRef.current.set(cacheKey, audioUrl);
      setPreviewAudioUrl(audioUrl);
      await new Audio(audioUrl).play().catch(() => undefined);
      toast.success(kind === 'voice' ? '音色试听已生成' : '完整试听已生成');
    } catch (error) {
      console.error('[voice-preview] failed', error);
      toast.error(error instanceof Error ? error.message : '试听生成失败，请稍后重试。');
    } finally {
      setPreviewing(null);
    }
  }

  async function createTask() {
    if (!form.prompt.trim() && !form.scriptText.trim()) {
      toast.error('请先输入视频主题、需求或完整脚本');
      return;
    }

    setSaving(true);
    try {
      const packagingOptions = [
        form.titleEnabled ? 'title' : '',
        form.descriptionEnabled ? 'description' : '',
        form.tagsEnabled ? 'tags' : '',
        form.coverEnabled ? 'cover' : '',
        `count:${form.videoCount.match(/\d+/)?.[0] ?? '1'}`,
        `clipSpeed:${form.clipSpeed.replace('x', '')}`,
        `videoEncoder:${form.videoEncoder}`,
        `stopAt:${form.stopAt}`,
        `workerThreads:${form.workerThreads}`,
        `paragraph:${form.paragraphNumber.match(/\d+/)?.[0] ?? '1'}`,
        form.scriptPrompt.trim() ? `scriptPrompt:${form.scriptPrompt.trim()}` : '',
        form.customSystemPrompt.trim()
          ? `customSystemPrompt:${form.customSystemPrompt.trim()}`
          : '',
        form.customAudioAssetId ? `customAudio:${form.customAudioAssetId}` : '',
        form.musicPrompt.trim() ? `bgmPrompt:${form.musicPrompt.trim()}` : '',
        form.customMusicAssetId ? `customBgm:${form.customMusicAssetId}` : '',
        `customPosition:${form.customSubtitlePosition}`,
        `strokeColor:${form.strokeColor}`,
        `strokeWidth:${form.strokeWidth}`,
        `subtitleBgColor:${form.subtitleBackgroundColor}`,
        `roundedSubtitleBackground:${form.roundedSubtitleBackground ? 'true' : 'false'}`
      ].filter(Boolean);

      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          keywords: splitKeywords(form.keywords),
          materialAssetIds: assets.map((asset) => asset.id),
          packagingOptions
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? '创建视频任务失败');
        return;
      }
      toast.success('已提交 MoneyPrinterTurbo 内置生产任务，请到任务审核查看结果');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-3 pb-3'>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/x-flv,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac'
        className='hidden'
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length === 0) return;
          const selectedFiles = uploadTargetRef.current === 'material' ? files : files.slice(0, 1);
          void uploadAssets(selectedFiles, uploadTargetRef.current);
        }}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='secondary'>MoneyPrinterTurbo 内置版</Badge>
        <ToolButton
          onClick={() => (window.location.href = `/dashboard/workspaces/${workspaceSlug}/review`)}
        >
          <Icons.post className='size-4' />
          任务管理
        </ToolButton>
        {user?.role === 'super_admin' ? (
          <ToolButton onClick={() => (window.location.href = '/dashboard/system/settings')}>
            <Icons.settings className='size-4' />
            模型与接口设置
          </ToolButton>
        ) : null}
        <ToolButton
          onClick={() =>
            toast.info('运行日志写入 engines/moneyprinterturbo/storage/zhiheng-logs。')
          }
        >
          <Icons.workspace className='size-4' />
          运行日志
        </ToolButton>
        <Button type='button' size='sm' disabled={saving} onClick={createTask}>
          <Icons.video className='size-4' />
          {saving ? '正在提交...' : '一键生成视频'}
        </Button>
      </div>

      <section className='grid items-stretch gap-3 xl:grid-cols-4'>
        <StepCard
          number='01'
          icon={Icons.post}
          title='视频内容'
          description='粘贴知识库给出的脚本文案，也可以保留原有 AI 辅助生成入口。'
        >
          <div className='border-t pt-3'>
            <div className='mb-2 text-xs font-medium'>视频主题（AI 将根据主题生成视频文案）</div>
            <Textarea
              className='min-h-16 resize-none text-sm'
              placeholder='例如：人工智能如何改变日常生活'
              value={form.prompt}
              onChange={(event) => update('prompt', event.target.value)}
            />
          </div>

          <SelectField
            label='生成视频脚本的语言'
            value={form.scriptLanguage}
            options={['自动检测', '简体中文', '英文', '中英双语']}
            onChange={(value) => update('scriptLanguage', value)}
          />

          <button
            type='button'
            className='flex h-8 items-center gap-2 rounded-md px-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground'
            onClick={() => setScriptSettingsOpen((current) => !current)}
          >
            <span>{scriptSettingsOpen ? '⌄' : '›'}</span>
            <span>高级脚本设置</span>
          </button>

          {scriptSettingsOpen ? (
            <div className='space-y-3 rounded-md border bg-muted/20 p-3'>
              <SliderField
                label='文案段落数量'
                value={form.paragraphNumber.match(/\d+/)?.[0] ?? '1'}
                min={1}
                max={10}
                step={1}
                onChange={(value) => update('paragraphNumber', `${value} 段`)}
              />
              <div className='grid gap-1.5'>
                <div className='text-xs font-medium'>自定义文案要求</div>
                <Textarea
                  className='min-h-16 resize-none text-xs'
                  placeholder='例如：语气更轻松，适合小红书风格，面向年轻用户，开头更有悬念'
                  value={form.scriptPrompt}
                  onChange={(event) => update('scriptPrompt', event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <div className='text-xs font-medium'>系统提示词</div>
                <Textarea
                  className='min-h-24 resize-none font-mono text-xs'
                  value={form.customSystemPrompt || defaultSystemPrompt}
                  onChange={(event) => update('customSystemPrompt', event.target.value)}
                />
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <ToolButton
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      paragraphNumber: '1 段',
                      scriptPrompt: '',
                      customSystemPrompt: ''
                    }))
                  }
                >
                  <Icons.palette className='size-4' />
                  恢复默认提示词
                </ToolButton>
                <ToolButton
                  onClick={() => toast.info(form.customSystemPrompt || defaultSystemPrompt)}
                >
                  <Icons.post className='size-4' />
                  预览最终提示词
                </ToolButton>
              </div>
            </div>
          ) : null}

          <ToolButton onClick={generateAiDraft} disabled={aiGenerating}>
            <Icons.sparkles className='size-4' />
            {aiGenerating ? 'AI生成中...' : '点击使用AI生成视频文案和关键词'}
          </ToolButton>

          <div className='grid gap-1.5'>
            <div className='flex items-center gap-2 text-xs font-medium'>
              <span>视频文案（可选）</span>
              <span className='text-muted-foreground'>?</span>
            </div>
            <Textarea
              className='min-h-24 flex-1 resize-none text-sm'
              value={form.scriptText}
              onChange={(event) => update('scriptText', event.target.value)}
            />
          </div>

          <ToolButton onClick={generateAiKeywords} disabled={aiGenerating}>
            <Icons.sparkles className='size-4' />
            {aiGenerating ? 'AI生成中...' : '点击使用AI根据文案生成视频关键词'}
          </ToolButton>

          <div className='grid gap-1.5'>
            <div className='flex items-center gap-2 text-xs font-medium'>
              <span>视频关键词（英文，可选）</span>
              <span className='text-muted-foreground'>?</span>
            </div>
            <Textarea
              className='min-h-20 resize-none text-sm'
              value={form.keywords}
              onChange={(event) => update('keywords', event.target.value)}
            />
          </div>
        </StepCard>

        <StepCard
          number='02'
          icon={Icons.media}
          title='素材与画面'
          description='优先选择本地文件，按脚本参数设置素材来源、比例、转场与片段节奏。'
        >
          <div className='border-t pt-3'>
            <SelectField
              label='视频来源'
              value={form.materialSource}
              options={['本地文件', 'Pexels', 'Pixabay', 'Coverr']}
              onChange={(value) => update('materialSource', value)}
            />
          </div>

          {form.materialSource === '本地文件' ? (
            <div className='grid gap-2'>
              <div className='text-xs font-medium'>上传本地文件</div>
              <div className='rounded-md bg-muted/60 p-3'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={uploading}
                  onClick={() => chooseFile('material')}
                >
                  <Icons.upload className='size-4' />
                  Upload
                </Button>
                <div className='mt-3 text-xs text-muted-foreground'>
                  200MB per file • AVI, FLV, JPG, MKV, MOV, MP4, PNG
                </div>
              </div>
              {assets.length > 0 ? (
                <div className='space-y-1.5 rounded-md border p-2 text-xs'>
                  <div className='font-medium text-foreground'>已选素材（{assets.length}）</div>
                  <div className='space-y-1'>
                    {assets.map((asset) => (
                      <div
                        key={asset.id}
                        className='flex items-center justify-between gap-2 rounded border bg-background px-2 py-1'
                      >
                        <span className='truncate text-muted-foreground'>{asset.name}</span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          onClick={() => removeAsset(asset.id)}
                        >
                          删除
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <SelectField
            label='视频拼接模式'
            value={form.stitchMode}
            options={['顺序拼接', '随机拼接']}
            onChange={(value) => update('stitchMode', value)}
          />

          <CompactSwitch
            label='按文案顺序匹配画面'
            checked={form.matchByScript}
            onChange={(checked) => update('matchByScript', checked)}
          />

          <SelectField
            label='视频转场模式'
            value={form.transitionMode}
            options={['无转场', '随机转场', '淡入', '淡出', '滑入', '滑出']}
            onChange={(value) => update('transitionMode', value)}
          />

          <SelectField
            label='视频比例'
            value={form.videoRatio}
            options={['竖屏 9:16（抖音视频）', '横屏 16:9', '方屏 1:1']}
            onChange={(value) => update('videoRatio', value)}
          />

          <SelectField
            label='单个片段最大时长（秒）'
            value={form.clipDuration}
            options={['2', '3', '5', '8', '10']}
            onChange={(value) => update('clipDuration', value)}
          />

          <SliderField
            label='片段播放速度'
            value={form.clipSpeed.replace('x', '')}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(value) => update('clipSpeed', `${value}x`)}
          />

          <SelectField
            label='同时生成视频数量'
            value={form.videoCount}
            options={['1', '2', '3', '5']}
            onChange={(value) => update('videoCount', value)}
          />

          <SelectField
            label='视频编码器'
            value={form.videoEncoder}
            options={['默认（推荐）', 'libx264', 'h264_nvenc']}
            onChange={(value) => update('videoEncoder', value)}
          />
        </StepCard>

        <StepCard
          number='03'
          icon={Icons.music}
          title='配音与音乐'
          description='设置自动配音、上传配音或无配音，并选择背景音乐相关参数。'
        >
          <div className='border-t pt-3'>
            <div className='mb-2 text-xs font-medium'>配音方式</div>
            <div className='grid grid-cols-3 overflow-hidden rounded-md border'>
              {['自动配音', '上传音频', '无配音'].map((item) => (
                <Button
                  key={item}
                  variant={form.voiceMode === item ? 'default' : 'ghost'}
                  size='sm'
                  className='h-8 rounded-none text-xs'
                  onClick={() => update('voiceMode', item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          {form.voiceMode === '自动配音' ? (
            <>
              <SelectField
                label='配音音色'
                value={form.voiceName}
                options={automationVoiceOptions}
                onChange={(value) => update('voiceName', value)}
              />
              <div className='grid grid-cols-2 gap-2'>
                <SelectField
                  label='配音音量'
                  value={form.voiceVolume}
                  options={['80%', '100%', '120%']}
                  onChange={(value) => update('voiceVolume', value)}
                />
                <SelectField
                  label='配音语速'
                  value={form.voiceSpeed}
                  options={['0.8x', '1.0x', '1.2x']}
                  onChange={(value) => update('voiceSpeed', value)}
                />
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <ToolButton
                  onClick={() => void playVoicePreview('voice')}
                  disabled={previewing !== null}
                >
                  <Icons.music className='size-4' />
                  {previewing === 'voice' ? '生成试听中...' : '试听音色'}
                </ToolButton>
                <ToolButton
                  onClick={() => void playVoicePreview('full')}
                  disabled={previewing !== null}
                >
                  <Icons.video className='size-4' />
                  {previewing === 'full' ? '生成试听中...' : '完整试听'}
                </ToolButton>
              </div>
              {previewAudioUrl ? (
                <audio className='h-8 w-full' src={previewAudioUrl} controls />
              ) : null}
            </>
          ) : null}

          {form.voiceMode === '上传音频' ? (
            <>
              <div className='grid gap-2'>
                <div className='text-xs font-medium'>上传配音文件</div>
                <div className='rounded-md bg-muted/60 p-3'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={uploading}
                    onClick={() => chooseFile('voice')}
                  >
                    <Icons.upload className='size-4' />
                    Upload
                  </Button>
                  <div className='mt-3 text-xs text-muted-foreground'>
                    200MB per file • AAC, FLAC, M4A, MP3, OGG, WAV
                  </div>
                </div>
              </div>
              {form.customAudioFileName ? (
                <MiniPanel>
                  <div className='flex items-center justify-between gap-2 text-xs'>
                    <span className='truncate'>配音文件：{form.customAudioFileName}</span>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7'
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          customAudioAssetId: '',
                          customAudioFileName: ''
                        }))
                      }
                    >
                      移除
                    </Button>
                  </div>
                </MiniPanel>
              ) : null}
              <SelectField
                label='配音音量'
                value={form.voiceVolume}
                options={['80%', '100%', '120%']}
                onChange={(value) => update('voiceVolume', value)}
              />
            </>
          ) : null}

          <div className='my-3 border-t' />

          <SelectField
            label='背景音乐来源'
            value={form.musicSource}
            options={['无背景音乐', '随机背景音乐', '自定义背景音乐', 'Sonilo AI 配乐']}
            onChange={(value) => update('musicSource', value)}
          />

          {form.musicSource === 'Sonilo AI 配乐' ? (
            <Input
              className='h-8 text-xs'
              placeholder='Sonilo 音乐风格提示词，可留空'
              value={form.musicPrompt}
              onChange={(event) => update('musicPrompt', event.target.value)}
            />
          ) : null}

          {form.musicSource === '自定义背景音乐' ? (
            <>
              <div className='rounded-md bg-muted/60 p-3'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={uploading}
                  onClick={() => chooseFile('music')}
                >
                  <Icons.upload className='size-4' />
                  Upload
                </Button>
                <div className='mt-3 text-xs text-muted-foreground'>
                  200MB per file • AAC, FLAC, M4A, MP3, OGG, WAV
                </div>
              </div>
              {form.customMusicFileName ? (
                <MiniPanel>
                  <div className='flex items-center justify-between gap-2 text-xs'>
                    <span className='truncate'>音乐文件：{form.customMusicFileName}</span>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7'
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          customMusicAssetId: '',
                          customMusicFileName: ''
                        }))
                      }
                    >
                      移除
                    </Button>
                  </div>
                </MiniPanel>
              ) : null}
            </>
          ) : null}

          <SelectField
            label='背景音乐音量'
            value={`${form.musicVolume}%`}
            options={['0%', '10%', '20%', '30%', '50%', '80%', '100%']}
            onChange={(value) => update('musicVolume', Number(value.replace('%', '')))}
          />
        </StepCard>

        <StepCard
          number='04'
          icon={Icons.palette}
          title='字幕样式'
          description='控制字幕开关、字体、位置、颜色、描边和背景效果。'
        >
          <CompactSwitch
            label='启用字幕'
            checked={form.subtitleEnabled}
            onChange={(checked) => update('subtitleEnabled', checked)}
          />

          <SelectField
            label='字幕字体'
            value={form.subtitleFont}
            options={['BeVietnamPro-Bold.ttf', 'STHeitiMedium.ttc', 'Microsoft YaHei', 'SimHei']}
            onChange={(value) => update('subtitleFont', value)}
          />

          <SelectField
            label='字幕位置'
            value={form.subtitlePosition}
            options={['底部（推荐）', '顶部', '中间', '自定义']}
            onChange={(value) => update('subtitlePosition', value)}
          />

          {form.subtitlePosition === '自定义' ? (
            <Input
              className='h-8 text-xs'
              placeholder='自定义位置 0-100'
              value={form.customSubtitlePosition}
              onChange={(event) => update('customSubtitlePosition', event.target.value)}
            />
          ) : null}

          <div className='grid grid-cols-2 gap-4'>
            <ColorPickerField
              label='字幕颜色'
              value={form.subtitleColor}
              onChange={(value) => update('subtitleColor', value)}
            />
            <SliderField
              label='字幕大小'
              value={form.subtitleSize}
              min={12}
              max={90}
              step={1}
              onChange={(value) => update('subtitleSize', value)}
            />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <ColorPickerField
              label='描边颜色'
              value={form.strokeColor}
              onChange={(value) => update('strokeColor', value)}
            />
            <SliderField
              label='描边粗细'
              value={form.strokeWidth}
              min={0}
              max={6}
              step={0.25}
              onChange={(value) => update('strokeWidth', value)}
            />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <CompactSwitch
              label='启用字幕背景'
              checked={form.subtitleBackground}
              onChange={(checked) => update('subtitleBackground', checked)}
            />
            <ColorPickerField
              label='字幕背景颜色'
              value={form.subtitleBackgroundColor}
              onChange={(value) => update('subtitleBackgroundColor', value)}
            />
          </div>

          <CompactSwitch
            label='启用圆角半透明字幕背景'
            checked={form.roundedSubtitleBackground}
            onChange={(checked) => update('roundedSubtitleBackground', checked)}
          />

          <Button
            variant='outline'
            className='mt-auto w-full'
            size='sm'
            onClick={() => setForm(initialForm)}
          >
            <Icons.palette className='size-4' />
            恢复默认字幕设置
          </Button>
        </StepCard>
      </section>
    </div>
  );
}
