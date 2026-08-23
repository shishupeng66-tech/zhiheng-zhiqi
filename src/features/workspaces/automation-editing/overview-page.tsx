'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';

type UploadedAsset = {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
};

type FormState = {
  prompt: string;
  scriptLanguage: string;
  paragraphNumber: string;
  keywords: string;
  scriptText: string;
  scriptPrompt: string;
  materialSource: string;
  stitchMode: string;
  transitionMode: string;
  videoRatio: string;
  clipDuration: string;
  videoCount: string;
  clipSpeed: string;
  matchByScript: boolean;
  voiceMode: string;
  voiceService: string;
  voiceName: string;
  voiceVolume: string;
  voiceSpeed: string;
  musicSource: string;
  musicVolume: number;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitlePosition: string;
  subtitleStyle: string;
  subtitleSize: string;
  subtitleColor: string;
  subtitleBackground: boolean;
  titleEnabled: boolean;
  descriptionEnabled: boolean;
  tagsEnabled: boolean;
  coverEnabled: boolean;
};

const initialForm: FormState = {
  prompt: '',
  scriptLanguage: '自动检测',
  paragraphNumber: '1 段',
  keywords: '企业实力、生产能力、质量控制',
  scriptText: '',
  scriptPrompt: '',
  materialSource: '企业素材库',
  stitchMode: '按顺序拼接',
  transitionMode: '无转场',
  videoRatio: '竖屏 9:16',
  clipDuration: '3 秒',
  videoCount: '1 条',
  clipSpeed: '1.0x',
  matchByScript: true,
  voiceMode: '自动配音',
  voiceService: '企业默认 TTS',
  voiceName: 'AI 自动选择音色',
  voiceVolume: '100%',
  voiceSpeed: '1.0x',
  musicSource: 'AI 自动匹配音乐',
  musicVolume: 30,
  subtitleEnabled: true,
  subtitleFont: '企业默认字体',
  subtitlePosition: '底部（推荐）',
  subtitleStyle: '简洁商务字幕',
  subtitleSize: '30',
  subtitleColor: '白色',
  subtitleBackground: true,
  titleEnabled: true,
  descriptionEnabled: true,
  tagsEnabled: true,
  coverEnabled: true
};

const keywordSuggestions = ['企业实力', '生产能力', '质量控制', '交付稳定', '客户信任'];

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
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className='grid gap-1.5'>
      <div className='text-xs font-medium text-muted-foreground'>{label}</div>
      <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger className='h-8 w-full text-xs'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
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

function ToolButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <Button variant='outline' size='sm' className='h-8 text-xs' onClick={onClick}>
      {children}
    </Button>
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
    <Card className='flex h-[calc(100vh-245px)] min-h-[540px] flex-col overflow-hidden'>
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
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [assets, setAssets] = React.useState<UploadedAsset[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function fillAiDraft() {
    const prompt = form.prompt.trim() || '制作一条 60 秒企业宣传短视频';
    setForm((current) => ({
      ...current,
      prompt,
      keywords: '企业实力、生产能力、质量控制、交付稳定、客户信任',
      scriptText:
        '开场突出企业核心能力，随后展示生产流程、质量控制和服务响应，结尾引导客户了解更多解决方案。'
    }));
    toast.success('已生成可编辑的脚本草稿和关键词');
  }

  async function uploadAsset(file: File) {
    setUploading(true);
    try {
      const data = new FormData();
      data.set('asset', file);
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/assets`, {
        method: 'POST',
        body: data
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? '素材上传失败');
        return;
      }
      setAssets((current) => [payload.asset, ...current]);
      setForm((current) => ({ ...current, materialSource: '素材库 + 本地补充' }));
      toast.success('素材已上传并加入本次任务');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function createTask() {
    if (!form.prompt.trim()) {
      toast.error('请先输入视频主题或需求');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/automation/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          keywords: splitKeywords(form.keywords),
          materialAssetIds: assets.map((asset) => asset.id),
          packagingOptions: [
            form.titleEnabled ? 'title' : '',
            form.descriptionEnabled ? 'description' : '',
            form.tagsEnabled ? 'tags' : '',
            form.coverEnabled ? 'cover' : '',
            `count:${form.videoCount.match(/\d+/)?.[0] ?? '1'}`
          ].filter(Boolean)
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? '创建视频任务失败');
        return;
      }
      toast.success('已提交内置自动化剪辑引擎，请到任务审核查看结果');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-4 pb-3'>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/x-flv,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg'
        className='hidden'
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadAsset(file);
        }}
      />

      <section className='grid items-stretch gap-4 xl:grid-cols-4'>
        <StepCard
          number='01'
          icon={Icons.post}
          title='视频内容'
          description='对应脚本、主题、关键词和生成语言。可直接给需求，也可粘贴完整脚本。'
        >
          <Textarea
            className='min-h-16 resize-none text-sm'
            placeholder='例如：制作一条 60 秒企业宣传短视频，突出核心能力、质量控制、服务流程和客户信任。'
            value={form.prompt}
            onChange={(event) => update('prompt', event.target.value)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <SelectField
              label='脚本语言'
              value={form.scriptLanguage}
              options={['自动检测', '简体中文', '英文', '中英双语']}
              onChange={(value) => update('scriptLanguage', value)}
            />
            <SelectField
              label='脚本段落'
              value={form.paragraphNumber}
              options={['1 段', '2 段', '3 段', '5 段', '8 段']}
              onChange={(value) => update('paragraphNumber', value)}
            />
          </div>
          <div className='grid grid-cols-[1fr_auto] gap-2'>
            <Input
              className='h-8 text-xs'
              placeholder='视频关键词'
              value={form.keywords}
              onChange={(event) => update('keywords', event.target.value)}
            />
            <ToolButton onClick={fillAiDraft}>
              <Icons.sparkles className='size-4' />
              AI生成
            </ToolButton>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {keywordSuggestions.map((keyword) => (
              <Badge key={keyword} variant='outline' className='text-xs'>
                {keyword}
              </Badge>
            ))}
          </div>
          <Textarea
            className='min-h-20 flex-1 resize-none text-sm'
            placeholder='视频文案/脚本，可粘贴完整脚本；留空时由 AI 生成。'
            value={form.scriptText}
            onChange={(event) => update('scriptText', event.target.value)}
          />
          <Textarea
            className='min-h-12 resize-none text-xs'
            placeholder='高级脚本要求：语气、受众、时长、禁用词、结构等。'
            value={form.scriptPrompt}
            onChange={(event) => update('scriptPrompt', event.target.value)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <ToolButton onClick={fillAiDraft}>
              <Icons.sparkles className='size-4' />
              生成脚本
            </ToolButton>
            <ToolButton onClick={fillAiDraft}>
              <Icons.sparkles className='size-4' />
              生成关键词
            </ToolButton>
          </div>
        </StepCard>

        <StepCard
          number='02'
          icon={Icons.media}
          title='素材与画面'
          description='对应素材来源、上传文件、画面比例、拼接、转场、片段时长和生成数量。'
        >
          <div className='grid grid-cols-3 gap-1.5'>
            {[
              ['126', '可用素材'],
              [String(assets.length), '本次选择'],
              ['12', '待补充']
            ].map(([value, label]) => (
              <div key={label} className='rounded-md border p-2'>
                <div className='text-base font-semibold'>{value}</div>
                <div className='text-xs text-muted-foreground'>{label}</div>
              </div>
            ))}
          </div>
          <SelectField
            label='视频来源'
            value={form.materialSource}
            options={['企业素材库', '本地文件', 'AI 自动匹配', '素材库 + 本地补充']}
            onChange={(value) => update('materialSource', value)}
          />
          <div className='rounded-md border bg-muted/20 p-2'>
            <div className='flex items-center justify-between gap-2'>
              <div>
                <div className='text-sm font-medium'>上传本地素材</div>
                <div className='text-xs text-muted-foreground'>
                  支持图片、视频、音频；当前接入本地存储。
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icons.upload className='size-4' />
                {uploading ? '上传中' : '选择'}
              </Button>
            </div>
          </div>
          {assets.length > 0 ? (
            <div className='rounded-md border px-2 py-1.5 text-xs text-muted-foreground'>
              已选：{assets.map((asset) => asset.name).join('、')}
            </div>
          ) : null}
          <div className='grid grid-cols-2 gap-2'>
            <SelectField
              label='拼接模式'
              value={form.stitchMode}
              options={['按顺序拼接', 'AI 自动排序', '按脚本段落拼接', '随机混剪']}
              onChange={(value) => update('stitchMode', value)}
            />
            <SelectField
              label='转场模式'
              value={form.transitionMode}
              options={['无转场', '自然淡入淡出', '商务快切', 'AI 自动选择']}
              onChange={(value) => update('transitionMode', value)}
            />
            <SelectField
              label='视频比例'
              value={form.videoRatio}
              options={['竖屏 9:16', '横屏 16:9', '方屏 1:1']}
              onChange={(value) => update('videoRatio', value)}
            />
            <SelectField
              label='片段时长'
              value={form.clipDuration}
              options={['2 秒', '3 秒', '5 秒', '8 秒']}
              onChange={(value) => update('clipDuration', value)}
            />
            <SelectField
              label='生成数量'
              value={form.videoCount}
              options={['1 条', '2 条', '3 条', '5 条']}
              onChange={(value) => update('videoCount', value)}
            />
            <SelectField
              label='播放速度'
              value={form.clipSpeed}
              options={['0.8x', '1.0x', '1.2x', '1.5x']}
              onChange={(value) => update('clipSpeed', value)}
            />
          </div>
          <CompactSwitch
            label='按文案匹配画面'
            checked={form.matchByScript}
            onChange={(checked) => update('matchByScript', checked)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <ToolButton>
              <Icons.media className='size-4' />
              素材库
            </ToolButton>
            <ToolButton>
              <Icons.sparkles className='size-4' />
              AI匹配
            </ToolButton>
          </div>
        </StepCard>

        <StepCard
          number='03'
          icon={Icons.music}
          title='配音与音乐'
          description='对应自动配音、上传音频、无配音、声音资产、语速音量和背景音乐。'
        >
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
          <SelectField
            label='配音服务'
            value={form.voiceService}
            options={['企业默认 TTS', 'Edge TTS', '火山引擎豆包语音', '本地语音服务']}
            onChange={(value) => update('voiceService', value)}
          />
          <SelectField
            label='配音音色'
            value={form.voiceName}
            options={['AI 自动选择音色', '企业宣传旁白', '老板 IP 声音', '通用讲解声音']}
            onChange={(value) => update('voiceName', value)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <SelectField
              label='音量'
              value={form.voiceVolume}
              options={['80%', '100%', '120%']}
              onChange={(value) => update('voiceVolume', value)}
            />
            <SelectField
              label='语速'
              value={form.voiceSpeed}
              options={['0.8x', '1.0x', '1.2x']}
              onChange={(value) => update('voiceSpeed', value)}
            />
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <ToolButton onClick={() => toast.info('试听需要已配置语音服务后启用')}>
              <Icons.music className='size-4' />
              试听音色
            </ToolButton>
            <ToolButton onClick={() => fileInputRef.current?.click()}>
              <Icons.upload className='size-4' />
              上传音频
            </ToolButton>
          </div>
          <SelectField
            label='背景音乐'
            value={form.musicSource}
            options={['AI 自动匹配音乐', '企业音乐库', '上传背景音乐', '不使用音乐']}
            onChange={(value) => update('musicSource', value)}
          />
          <div className='rounded-md border p-2'>
            <div className='mb-1.5 flex items-center justify-between text-xs'>
              <span>背景音乐音量</span>
              <Badge variant='secondary'>{form.musicVolume}%</Badge>
            </div>
            <Slider
              value={[form.musicVolume]}
              max={100}
              step={1}
              aria-label='背景音乐音量'
              onValueChange={(value) =>
                update('musicVolume', Array.isArray(value) ? (value[0] ?? 30) : value)
              }
            />
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <ToolButton>
              <Icons.workspace className='size-4' />
              声音资产
            </ToolButton>
            <ToolButton>
              <Icons.settings className='size-4' />
              语音参数
            </ToolButton>
          </div>
        </StepCard>

        <StepCard
          number='04'
          icon={Icons.palette}
          title='字幕与包装'
          description='对应字幕开关、字体位置、颜色描边、标题简介、标签关键词和封面。'
        >
          <CompactSwitch
            label='启用字幕'
            checked={form.subtitleEnabled}
            onChange={(checked) => update('subtitleEnabled', checked)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <SelectField
              label='字幕字体'
              value={form.subtitleFont}
              options={['企业默认字体', '微软雅黑', '黑体', '清晰商务字体']}
              onChange={(value) => update('subtitleFont', value)}
            />
            <SelectField
              label='字幕位置'
              value={form.subtitlePosition}
              options={['底部（推荐）', '中下方', '顶部', '自定义']}
              onChange={(value) => update('subtitlePosition', value)}
            />
            <SelectField
              label='字幕样式'
              value={form.subtitleStyle}
              options={['简洁商务字幕', '重点词高亮', '底部信息条']}
              onChange={(value) => update('subtitleStyle', value)}
            />
            <SelectField
              label='字幕大小'
              value={form.subtitleSize}
              options={['24', '30', '36', '42', '60']}
              onChange={(value) => update('subtitleSize', value)}
            />
            <SelectField
              label='字幕颜色'
              value={form.subtitleColor}
              options={['白色', '品牌主色', '深色']}
              onChange={(value) => update('subtitleColor', value)}
            />
            <SelectField
              label='描边粗细'
              value={form.subtitleBackground ? '1.5' : '0'}
              options={['0', '1.5', '2', '3']}
              onChange={(value) => update('subtitleBackground', value !== '0')}
            />
          </div>
          <CompactSwitch
            label='字幕背景'
            checked={form.subtitleBackground}
            onChange={(checked) => update('subtitleBackground', checked)}
          />
          <div className='grid grid-cols-2 gap-2'>
            <CompactSwitch
              label='生成标题'
              checked={form.titleEnabled}
              onChange={(checked) => update('titleEnabled', checked)}
            />
            <CompactSwitch
              label='生成简介'
              checked={form.descriptionEnabled}
              onChange={(checked) => update('descriptionEnabled', checked)}
            />
            <CompactSwitch
              label='生成标签'
              checked={form.tagsEnabled}
              onChange={(checked) => update('tagsEnabled', checked)}
            />
            <CompactSwitch
              label='生成封面'
              checked={form.coverEnabled}
              onChange={(checked) => update('coverEnabled', checked)}
            />
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <ToolButton>
              <Icons.palette className='size-4' />
              恢复默认
            </ToolButton>
            <ToolButton>
              <Icons.edit className='size-4' />
              保存模板
            </ToolButton>
          </div>
          <Button
            className='mt-auto w-full'
            size='sm'
            disabled={saving}
            onClick={() => void createTask()}
          >
            <Icons.video className='size-4' />
            {saving ? '生成中...' : '一键生成视频'}
          </Button>
        </StepCard>
      </section>
    </div>
  );
}
