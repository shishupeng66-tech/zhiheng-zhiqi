import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';

const videoStyles = [
  'AI 自动选择最适合风格',
  '工业实力展示风',
  '老板行业观点风',
  '客户痛点科普风',
  '产品案例展示风'
];

const scriptOptions = ['AI 自动生成脚本', '选择当前任务脚本', '使用已审核脚本', '保留手动输入文案'];

const voiceOptions = ['AI 自动选择声音', '企业专业男声', '清晰自然女声', '选择声音资产'];

const materialOptions = [
  'AI 自动匹配素材资产',
  '手动添加素材',
  '只使用当前任务素材',
  '只使用已审核素材'
];

const advancedSettings = [
  {
    icon: Icons.video,
    label: '视频比例',
    value: '竖屏 9:16',
    description: '第一版保留配置入口，后续支持抖音、视频号、小红书比例。'
  },
  {
    icon: Icons.clock,
    label: '时长',
    value: 'AI 自动控制',
    description: '根据主题、脚本和素材数量自动建议 30-60 秒成片。'
  },
  {
    icon: Icons.text,
    label: '字幕',
    value: '默认开启',
    description: '支持字幕位置、字号、颜色、关键词强调等扩展。'
  },
  {
    icon: Icons.music,
    label: '背景音乐',
    value: 'AI 自动匹配',
    description: '后续可选择音乐资产、音量和节奏卡点策略。'
  }
];

function ConfigSelect({
  label,
  description,
  icon: Icon,
  options
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  options: string[];
}) {
  return (
    <div className='rounded-lg border bg-background p-4'>
      <div className='mb-3 flex items-start gap-3'>
        <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <Icon className='size-4' />
        </div>
        <div className='min-w-0'>
          <div className='font-medium'>{label}</div>
          <p className='mt-1 text-sm leading-5 text-muted-foreground'>{description}</p>
        </div>
      </div>
      <Select defaultValue={options[0]}>
        <SelectTrigger className='w-full'>
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

export function AutomationEditingOverviewPage() {
  return (
    <div className='space-y-5'>
      <Card className='overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background'>
        <CardHeader className='border-b bg-background/60'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>
              <Icons.video className='size-3' />
              视频生产
            </Badge>
            <Badge variant='outline'>企业版视频创建入口</Badge>
          </div>
          <CardTitle className='text-2xl'>创建视频</CardTitle>
          <CardDescription className='max-w-3xl leading-6'>
            输入本次视频主题或生产需求，系统将按风格、脚本、声音和素材配置生成成片。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4 p-5'>
          <div className='grid gap-2'>
            <div className='text-sm font-medium'>本次视频主题 / 需求描述</div>
            <Textarea
              className='min-h-32 resize-none text-base'
              placeholder='例如：介绍企业饮料瓶生产优势'
            />
          </div>
          <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
            <Icons.info className='size-4' />
            <span>建议说明视频目标、产品类型、客户痛点或需要突出的企业优势。</span>
          </div>
        </CardContent>
      </Card>

      <section className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <Card>
          <CardHeader>
            <CardTitle>视频生成配置</CardTitle>
            <CardDescription>
              默认由 AI 自动选择配置，也可以按当前任务手动指定脚本、声音和素材。
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <ConfigSelect
              label='风格'
              description='从风格库概念选择成片表达方式。'
              icon={Icons.palette}
              options={videoStyles}
            />
            <ConfigSelect
              label='脚本'
              description='默认 AI 自动生成，也支持选择当前任务脚本。'
              icon={Icons.post}
              options={scriptOptions}
            />
            <ConfigSelect
              label='声音'
              description='默认 AI 自动选择，也支持选择声音资产。'
              icon={Icons.music}
              options={voiceOptions}
            />
            <ConfigSelect
              label='素材'
              description='默认 AI 自动匹配素材资产，也支持手动添加素材。'
              icon={Icons.media}
              options={materialOptions}
            />
          </CardContent>
        </Card>

        <Card className='border-primary/30'>
          <CardHeader>
            <CardTitle>生成视频</CardTitle>
            <CardDescription>确认主题和配置后，开始自动化剪辑生产。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-lg border bg-muted/30 p-4'>
              <div className='flex items-center gap-2 font-medium'>
                <Icons.sparkles className='size-4 text-primary' />
                当前生成方式
              </div>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                AI 生成脚本、匹配素材、选择声音并完成基础剪辑。高级效果将在下方设置中逐步扩展。
              </p>
            </div>
            <Button size='lg' className='w-full'>
              <Icons.video className='size-4' />
              一键生成视频
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>高级设置</CardTitle>
          <CardDescription>第一版仅保留扩展空间，后续接入真实视频参数和模板能力。</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          {advancedSettings.map((item) => (
            <div key={item.label} className='rounded-lg border p-4'>
              <div className='flex items-center gap-3'>
                <div className='flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground'>
                  <item.icon className='size-4' />
                </div>
                <div>
                  <div className='font-medium'>{item.label}</div>
                  <div className='text-sm text-primary'>{item.value}</div>
                </div>
              </div>
              <p className='mt-3 text-sm leading-6 text-muted-foreground'>{item.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
