import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const keywordSuggestions = ['企业实力', '生产能力', '质量控制', '交付稳定', '客户信任'];

const materialLibraryStats = [
  { label: '可用素材', value: '126', description: '视频、图片、产品图、工厂场景' },
  { label: '已审核', value: '98', description: '默认优先进入 AI 匹配范围' },
  { label: '待补充', value: '12', description: '可由人工追加本地素材' }
];

const packagingTasks = [
  { label: '自动生成标题', description: '根据主题与脚本生成适合传播的标题。' },
  { label: '自动生成简介', description: '生成发布平台可用的视频说明。' },
  { label: '自动生成标签关键词', description: '生成搜索关键词和内容标签。' },
  { label: '自动生成封面', description: '从关键镜头或主题生成封面方案。' }
];

function SelectField({
  label,
  value,
  options,
  description
}: {
  label: string;
  value: string;
  options: string[];
  description?: string;
}) {
  return (
    <div className='grid gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <div className='text-sm font-medium'>{label}</div>
      </div>
      <Select defaultValue={value}>
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
      {description ? (
        <p className='text-xs leading-5 text-muted-foreground'>{description}</p>
      ) : null}
    </div>
  );
}

function AutoSwitch({ label, description }: { label: string; description: string }) {
  return (
    <div className='flex min-h-20 items-start justify-between gap-4 rounded-lg border p-3'>
      <div>
        <div className='text-sm font-medium'>{label}</div>
        <p className='mt-1 text-xs leading-5 text-muted-foreground'>{description}</p>
      </div>
      <Switch defaultChecked aria-label={label} />
    </div>
  );
}

function SectionTitle({
  number,
  icon: Icon,
  title,
  description
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className='flex items-start gap-3'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
        <Icon className='size-4' />
      </div>
      <div>
        <div className='mb-1 flex items-center gap-2'>
          <Badge variant='secondary'>{number}</Badge>
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </div>
    </div>
  );
}

export function AutomationEditingOverviewPage() {
  return (
    <div className='space-y-5 pb-4'>
      <Card className='border-primary/20'>
        <CardHeader className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>
              <Icons.sparkles className='size-3' />
              AI 默认完成内容生产
            </Badge>
            <Badge variant='outline'>企业宣传短视频</Badge>
            <Badge variant='outline'>UI 原型 / Mock 数据</Badge>
          </div>
          <div>
            <CardTitle className='text-2xl'>视频生产</CardTitle>
            <CardDescription className='mt-2 max-w-5xl leading-6'>
              输入视频需求后，系统默认由 AI
              完成脚本生成、素材匹配、配音、字幕包装、封面和发布文案准备。
              用户也可以手动干预风格、脚本、声音、素材和视频参数。
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <section className='grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]'>
        <Card>
          <CardHeader>
            <SectionTitle
              number='01'
              icon={Icons.post}
              title='视频内容'
              description='从视频需求输入开始，生成脚本、关键词和文案预览。'
            />
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-2'>
              <div className='text-sm font-medium'>视频主题 / 需求输入</div>
              <Textarea
                className='min-h-28 resize-none'
                placeholder='例如：为企业制作一条 60 秒宣传短视频，突出核心能力、质量控制、服务流程和客户信任。'
              />
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]'>
              <SelectField
                label='生成视频脚本的语言'
                value='自动检测'
                options={['自动检测', '简体中文', '英文', '中英双语']}
              />
              <Button variant='outline' className='mt-auto w-full'>
                <Icons.adjustments className='size-4' />
                高级脚本设置
              </Button>
            </div>

            <div className='grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]'>
              <div className='grid gap-2'>
                <div className='text-sm font-medium'>视频关键词</div>
                <Input placeholder='企业实力、生产能力、质量控制、交付稳定、客户信任' />
              </div>
              <div className='flex items-end'>
                <Button variant='outline' className='w-full'>
                  <Icons.sparkles className='size-4' />
                  AI 生成文案和关键词
                </Button>
              </div>
            </div>

            <div className='flex flex-wrap gap-2'>
              {keywordSuggestions.map((keyword) => (
                <Badge key={keyword} variant='outline'>
                  {keyword}
                </Badge>
              ))}
            </div>

            <div className='grid gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <div className='text-sm font-medium'>视频文案（可选）</div>
                <Badge variant='secondary'>可由 AI 自动生成</Badge>
              </div>
              <Textarea
                className='min-h-32 resize-none'
                placeholder='可粘贴已有脚本，也可以留空交给 AI 生成。'
              />
            </div>

            <div className='rounded-lg border bg-muted/25 p-4'>
              <div className='mb-2 flex items-center gap-2 text-sm font-medium'>
                <Icons.info className='size-4 text-primary' />
                文案预览
              </div>
              <p className='text-sm leading-6 text-muted-foreground'>
                AI 将根据主题生成开场钩子、企业能力说明、画面节奏建议、配音文案和结尾行动号召。
                当前为 UI 原型，不会生成真实脚本。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle
              number='02'
              icon={Icons.media}
              title='素材与画面'
              description='优先使用企业素材库，也支持本地上传、拼接模式、转场和画面比例配置。'
            />
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-3 sm:grid-cols-3'>
              {materialLibraryStats.map((item) => (
                <div key={item.label} className='rounded-lg border p-3'>
                  <div className='text-2xl font-semibold'>{item.value}</div>
                  <div className='mt-1 text-sm font-medium'>{item.label}</div>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>{item.description}</p>
                </div>
              ))}
            </div>

            <SelectField
              label='视频来源'
              value='企业素材库'
              options={['企业素材库', '本地文件', 'AI 自动匹配素材', '企业素材库 + 本地补充']}
              description='默认从已审核企业素材中匹配画面。'
            />

            <div className='rounded-lg border bg-muted/20 p-4'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <div className='text-sm font-medium'>上传本地文件</div>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    支持 AVI、FLV、JPG、MKV、MOV、MP4、PNG。
                  </p>
                </div>
                <Button variant='outline'>
                  <Icons.upload className='size-4' />
                  选择文件
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                单个文件最大 200MB。当前仅为界面原型，不会实际上传。
              </p>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <SelectField
                label='视频拼接模式'
                value='按顺序拼接'
                options={['按顺序拼接', 'AI 自动排序', '按脚本段落拼接']}
              />
              <SelectField
                label='视频转场模式'
                value='无转场'
                options={['无转场', '自然淡入淡出', '商务快切', 'AI 自动选择']}
              />
              <SelectField
                label='视频比例'
                value='竖屏 9:16'
                options={['竖屏 9:16', '横屏 16:9', '方屏 1:1']}
              />
              <SelectField
                label='单个片段最大时长'
                value='3 秒'
                options={['2 秒', '3 秒', '5 秒', '8 秒']}
              />
              <SelectField
                label='同时生成视频数量'
                value='1 条'
                options={['1 条', '2 条', '3 条']}
              />
              <SelectField
                label='视频编码器'
                value='系统默认编码器'
                options={['系统默认编码器', 'H.264', 'H.265']}
              />
            </div>

            <AutoSwitch
              label='按文案顺序匹配画面'
              description='根据脚本段落顺序自动安排素材，减少人工调整。'
            />

            <div className='rounded-lg border p-3'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div className='text-sm font-medium'>片段播放速度</div>
                <Badge variant='secondary'>1.00x</Badge>
              </div>
              <Slider defaultValue={[50]} max={100} step={1} aria-label='片段播放速度' />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]'>
        <Card>
          <CardHeader>
            <SectionTitle
              number='03'
              icon={Icons.music}
              title='配音与音乐'
              description='支持自动配音、企业声音资产、本地音频、背景音乐和试听配置。'
            />
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-2'>
              <div className='text-sm font-medium'>配音方式</div>
              <div className='grid overflow-hidden rounded-lg border sm:grid-cols-3'>
                {['自动配音', '上传音频', '无配音'].map((item, index) => (
                  <Button
                    key={item}
                    variant={index === 0 ? 'default' : 'ghost'}
                    className='rounded-none'
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <SelectField
                label='配音服务'
                value='企业默认 TTS'
                options={['企业默认 TTS', '火山引擎豆包语音', '本地语音服务']}
                description='这里只展示配置入口，不保存真实 API Key。'
              />
              <SelectField
                label='配音音色'
                value='AI 自动选择音色'
                options={['AI 自动选择音色', '企业宣传旁白', '老板 IP 声音', '通用讲解声音']}
              />
              <SelectField label='配音音量' value='100%' options={['80%', '100%', '120%']} />
              <SelectField label='配音语速' value='1.0x' options={['0.8x', '1.0x', '1.2x']} />
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <Button variant='outline'>
                <Icons.music className='size-4' />
                试听音色
              </Button>
              <Button variant='outline'>
                <Icons.post className='size-4' />
                完整试听
              </Button>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='grid gap-2'>
                <div className='text-sm font-medium'>上传音频</div>
                <Button variant='outline' className='justify-start'>
                  <Icons.upload className='size-4' />
                  选择本地音频
                </Button>
              </div>
              <SelectField
                label='背景音乐来源'
                value='AI 自动匹配音乐'
                options={['AI 自动匹配音乐', '企业音乐库', '上传背景音乐', '不使用音乐']}
              />
            </div>

            <div className='rounded-lg border p-3'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div className='text-sm font-medium'>背景音乐音量</div>
                <Badge variant='secondary'>30%</Badge>
              </div>
              <Slider defaultValue={[30]} max={100} step={1} aria-label='背景音乐音量' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle
              number='04'
              icon={Icons.palette}
              title='字幕样式与视频包装'
              description='控制字幕样式、视频包装、封面、标题、简介和标签关键词。'
            />
          </CardHeader>
          <CardContent className='space-y-5'>
            <AutoSwitch label='启用字幕' description='默认开启字幕，便于无声播放场景理解内容。' />

            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              <SelectField
                label='字幕字体'
                value='企业默认字体'
                options={['企业默认字体', '清晰黑体', '稳重宋体']}
              />
              <SelectField
                label='字幕位置'
                value='底部（推荐）'
                options={['底部（推荐）', '中下方', '顶部']}
              />
              <SelectField
                label='字幕样式'
                value='简洁商务字幕'
                options={['简洁商务字幕', '重点词高亮', '底部信息条']}
              />
              <SelectField label='字幕大小' value='30' options={['24', '30', '36', '42']} />
              <SelectField label='字幕颜色' value='白色' options={['白色', '品牌主色', '深色']} />
              <SelectField label='描边颜色' value='黑色' options={['黑色', '无描边', '品牌深色']} />
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <AutoSwitch
                label='启用字幕背景'
                description='为字幕增加背景块，提升复杂画面中的可读性。'
              />
              <AutoSwitch
                label='启用圆角半透明字幕背景'
                description='使用更克制的企业宣传视觉包装。'
              />
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              {packagingTasks.map((item) => (
                <AutoSwitch key={item.label} label={item.label} description={item.description} />
              ))}
            </div>

            <div className='rounded-lg border bg-muted/25 p-4'>
              <div className='mb-2 text-sm font-medium'>发布文案预览</div>
              <p className='text-sm leading-6 text-muted-foreground'>
                系统会根据视频主题、脚本和关键词准备标题、简介、标签和封面建议。当前仅展示信息架构，不调用真实发布接口。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className='sticky bottom-0 z-10 border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <div className='font-medium'>准备开始自动化视频生产</div>
            <p className='text-sm text-muted-foreground'>
              当前为产品 UI 原型，按钮不会触发真实 AI、剪辑、上传或数据接口。
            </p>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button variant='outline'>
              <Icons.edit className='size-4' />
              保存为生产模板
            </Button>
            <Button size='lg'>
              <Icons.video className='size-4' />
              一键生成视频
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
