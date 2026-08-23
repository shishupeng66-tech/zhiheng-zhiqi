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
  keywords: string;
  scriptText: string;
  materialSource: string;
  stitchMode: string;
  transitionMode: string;
  videoRatio: string;
  clipDuration: string;
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
};

const initialForm: FormState = {
  prompt: '',
  scriptLanguage: '自动检测',
  keywords: '企业实力、生产能力、质量控制',
  scriptText: '',
  materialSource: '企业素材库',
  stitchMode: '按顺序拼接',
  transitionMode: '无转场',
  videoRatio: '竖屏 9:16',
  clipDuration: '3 秒',
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
  subtitleBackground: true
};

const keywordSuggestions = ['企业实力', '生产能力', '质量控制'];

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
        <SelectTrigger className='h-7 w-full text-xs'>
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
    <div className='flex h-7 items-center justify-between rounded-md border px-2.5'>
      <span className='text-xs font-medium'>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
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
    <Card className='flex h-[calc(100vh-250px)] min-h-[460px] flex-col overflow-hidden'>
      <CardHeader className='p-2.5 pb-1.5'>
        <div className='flex items-center gap-2'>
          <div className='flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
            <Icon className='size-4' />
          </div>
          <Badge variant='secondary'>{number}</Badge>
          <CardTitle className='text-base'>{title}</CardTitle>
        </div>
        <p className='mt-1 line-clamp-1 text-xs leading-4 text-muted-foreground'>{description}</p>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-2 overflow-y-auto p-3 pt-0'>
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
      setForm((current) => ({ ...current, materialSource: '素材库+本地补充' }));
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
          packagingOptions: ['title', 'description', 'tags', 'cover']
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.message ?? '创建视频任务失败');
        return;
      }
      toast.success('视频生产任务已创建，请到任务审核查看');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-4 pb-3'>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/x-flv'
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
          description='输入主题，默认由 AI 生成脚本、关键词和文案。'
        >
          <div className='grid gap-1.5'>
            <div className='text-xs font-medium text-muted-foreground'>视频主题 / 需求输入</div>
            <Textarea
              className='min-h-16 resize-none text-sm'
              placeholder='例如：制作一条 60 秒企业宣传短视频。'
              value={form.prompt}
              onChange={(event) => update('prompt', event.target.value)}
            />
          </div>
          <SelectField
            label='脚本语言'
            value={form.scriptLanguage}
            options={['自动检测', '简体中文', '英文', '中英双语']}
            onChange={(value) => update('scriptLanguage', value)}
          />
          <div className='grid grid-cols-[1fr_auto] gap-2'>
            <Input
              className='h-7 text-xs'
              placeholder='视频关键词'
              value={form.keywords}
              onChange={(event) => update('keywords', event.target.value)}
            />
            <Button variant='outline' size='sm' onClick={fillAiDraft}>
              <Icons.sparkles className='size-4' />
              AI生成
            </Button>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {keywordSuggestions.map((keyword) => (
              <Badge key={keyword} variant='outline' className='text-xs'>
                {keyword}
              </Badge>
            ))}
          </div>
          <div className='grid flex-1 gap-1.5'>
            <div className='flex items-center justify-between'>
              <div className='text-xs font-medium text-muted-foreground'>视频文案（可选）</div>
              <Badge variant='secondary' className='text-xs'>
                可AI生成
              </Badge>
            </div>
            <Textarea
              className='min-h-14 flex-1 resize-none text-sm'
              placeholder='可粘贴脚本，也可以留空。'
              value={form.scriptText}
              onChange={(event) => update('scriptText', event.target.value)}
            />
          </div>
          <Button variant='outline' size='sm' className='mt-auto w-full'>
            <Icons.adjustments className='size-4' />
            高级脚本设置
          </Button>
        </StepCard>

        <StepCard
          number='02'
          icon={Icons.media}
          title='素材与画面'
          description='从企业素材库、本地文件或 AI 匹配中组织画面。'
        >
          <div className='grid grid-cols-3 gap-1.5'>
            {[
              ['126', '素材'],
              [String(assets.length), '本次'],
              ['12', '待补']
            ].map(([value, label]) => (
              <div key={label} className='rounded-md border p-1.5'>
                <div className='text-base font-semibold'>{value}</div>
                <div className='text-xs text-muted-foreground'>{label}</div>
              </div>
            ))}
          </div>
          <SelectField
            label='视频来源'
            value={form.materialSource}
            options={['企业素材库', '本地文件', 'AI 自动匹配', '素材库+本地补充']}
            onChange={(value) => update('materialSource', value)}
          />
          <div className='rounded-md border bg-muted/20 p-2'>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-sm font-medium'>上传本地文件</div>
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
            <div className='truncate rounded-md border px-2 py-1.5 text-xs text-muted-foreground'>
              已选：{assets[0].name}
            </div>
          ) : null}
          <div className='grid grid-cols-2 gap-2'>
            <SelectField
              label='拼接模式'
              value={form.stitchMode}
              options={['按顺序拼接', 'AI 自动排序', '按脚本段落拼接']}
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
          </div>
          <CompactSwitch
            label='按文案匹配画面'
            checked={form.matchByScript}
            onChange={(checked) => update('matchByScript', checked)}
          />
        </StepCard>

        <StepCard
          number='03'
          icon={Icons.music}
          title='配音与音乐'
          description='配置自动配音、企业声音、本地音频和背景音乐。'
        >
          <div className='grid grid-cols-3 overflow-hidden rounded-md border'>
            {['自动配音', '上传音频', '无配音'].map((item) => (
              <Button
                key={item}
                variant={form.voiceMode === item ? 'default' : 'ghost'}
                size='sm'
                className='rounded-none'
                onClick={() => update('voiceMode', item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <SelectField
            label='配音服务'
            value={form.voiceService}
            options={['企业默认 TTS', '火山引擎豆包语音', '本地语音服务']}
            onChange={(value) => update('voiceService', value)}
          />
          <SelectField
            label='配音音色'
            value={form.voiceName}
            options={['AI 自动选择音色', '企业宣传旁白', '老板 IP 声音', '通用讲解声音']}
            onChange={(value) => update('voiceName', value)}
          />
          <div className='grid grid-cols-2 gap-2.5'>
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
          <div className='grid grid-cols-2 gap-1.5'>
            <Button variant='outline' size='sm' onClick={() => toast.info('当前使用模拟试听')}>
              <Icons.music className='size-4' />
              试听
            </Button>
            <Button variant='outline' size='sm' onClick={() => fileInputRef.current?.click()}>
              <Icons.upload className='size-4' />
              上传
            </Button>
          </div>
          <SelectField
            label='背景音乐'
            value={form.musicSource}
            options={['AI 自动匹配音乐', '企业音乐库', '上传背景音乐', '不使用音乐']}
            onChange={(value) => update('musicSource', value)}
          />
          <div className='mt-auto rounded-md border p-2'>
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
        </StepCard>

        <StepCard
          number='04'
          icon={Icons.palette}
          title='字幕与包装'
          description='控制字幕、封面、标题、简介和标签关键词。'
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
              options={['企业默认字体', '清晰黑体', '稳重宋体']}
              onChange={(value) => update('subtitleFont', value)}
            />
            <SelectField
              label='字幕位置'
              value={form.subtitlePosition}
              options={['底部（推荐）', '中下方', '顶部']}
              onChange={(value) => update('subtitlePosition', value)}
            />
            <SelectField
              label='字幕样式'
              value={form.subtitleStyle}
              options={['简洁商务字幕', '重点词高亮', '底部信息条']}
              onChange={(value) => update('subtitleStyle', value)}
            />
            <SelectField
              label='大小'
              value={form.subtitleSize}
              options={['24', '30', '36', '42']}
              onChange={(value) => update('subtitleSize', value)}
            />
            <SelectField
              label='颜色'
              value={form.subtitleColor}
              options={['白色', '品牌主色', '深色']}
              onChange={(value) => update('subtitleColor', value)}
            />
          </div>
          <CompactSwitch
            label='字幕背景'
            checked={form.subtitleBackground}
            onChange={(checked) => update('subtitleBackground', checked)}
          />
          <div className='grid grid-cols-4 gap-1.5'>
            {['标题', '简介', '标签', '封面'].map((item) => (
              <div
                key={item}
                className='flex flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-1.5'
              >
                <span className='text-xs leading-none'>{item}</span>
                <Badge variant='outline'>AI</Badge>
              </div>
            ))}
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
