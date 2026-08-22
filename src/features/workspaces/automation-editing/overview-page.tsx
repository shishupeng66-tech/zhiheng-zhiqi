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
import { Icons } from '@/components/icons';

const recommendation = {
  topic: '展示智能产线如何提升交付稳定性',
  style: '工业实力展示风',
  direction: '以真实车间镜头为主，突出设备规模、生产节拍、质检流程和交付能力。',
  materials: ['产线航拍 8 段', '设备特写 14 张', '质检流程 3 段', '工厂外景 2 段']
};

const generationOptions = [
  {
    label: '主题',
    value: 'AI 自动选择：智能产线交付能力',
    options: ['AI 自动选择：智能产线交付能力', '工厂实力展示', '产品案例说明']
  },
  {
    label: '脚本',
    value: 'AI 自动生成：60 秒企业宣传脚本',
    options: ['AI 自动生成：60 秒企业宣传脚本', '老板口播结构', '客户痛点科普结构']
  },
  {
    label: '声音',
    value: 'AI 自动选择：稳重企业旁白',
    options: ['AI 自动选择：稳重企业旁白', '专业男声', '清晰女声']
  },
  {
    label: '素材',
    value: 'AI 自动匹配：最新产线素材',
    options: ['AI 自动匹配：最新产线素材', '只使用已审核素材', '使用全部可用素材']
  }
];

const customItems = [
  { label: '主题', value: '按行业热点、产品卖点或客户痛点人工指定主题。' },
  { label: '脚本', value: '调整开头钩子、卖点顺序、结尾行动号召。' },
  { label: '声音', value: '选择企业旁白、人声风格、语速和情绪。' },
  { label: '素材', value: '限定素材文件夹、镜头类型或品牌露出比例。' }
];

export function AutomationEditingOverviewPage() {
  return (
    <div className='space-y-5'>
      <section className='grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]'>
        <Card className='overflow-hidden'>
          <CardHeader className='border-b bg-muted/30'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>
                <Icons.sparkles className='size-3' />
                今日 AI 内容推荐
              </Badge>
              <Badge variant='outline'>Mock 数据</Badge>
            </div>
            <CardTitle className='text-xl'>{recommendation.topic}</CardTitle>
            <CardDescription className='max-w-3xl leading-6'>
              AI 默认完成主题、脚本、声音和素材匹配，人只在需要时介入调整。
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px]'>
            <div className='space-y-4'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>推荐风格</div>
                  <div className='mt-1 font-medium'>{recommendation.style}</div>
                </div>
                <div className='rounded-lg border p-3'>
                  <div className='text-xs text-muted-foreground'>内容方向</div>
                  <div className='mt-1 font-medium'>制造能力可信背书</div>
                </div>
              </div>
              <div className='rounded-lg border p-4'>
                <div className='text-sm font-medium'>AI 生成判断</div>
                <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                  {recommendation.direction}
                </p>
              </div>
              <Button size='lg' className='w-full sm:w-fit'>
                <Icons.sparkles className='size-4' />
                使用推荐一键生成
              </Button>
            </div>
            <div className='rounded-lg border bg-background p-4'>
              <div className='text-sm font-medium'>使用素材情况</div>
              <div className='mt-3 space-y-2'>
                {recommendation.materials.map((item) => (
                  <div key={item} className='flex items-center gap-2 text-sm'>
                    <Icons.circleCheck className='size-4 text-primary' />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>一键生成</CardTitle>
            <CardDescription>默认全部由 AI 选择；下拉项仅用于原型展示。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {generationOptions.map((item) => (
              <div key={item.label} className='grid gap-2'>
                <div className='text-sm font-medium'>{item.label}</div>
                <Select defaultValue={item.value}>
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {item.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button className='mt-2 w-full' size='lg'>
              <Icons.video className='size-4' />
              一键生成视频
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>高级自定义</CardTitle>
          <CardDescription>
            人可以介入，但不是默认路径。这里先展示可配置的信息层级。
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          {customItems.map((item) => (
            <div key={item.label} className='rounded-lg border p-4'>
              <div className='flex items-center justify-between gap-2'>
                <div className='font-medium'>{item.label}</div>
                <Button variant='outline' size='sm'>
                  <Icons.edit className='size-3.5' />
                  修改
                </Button>
              </div>
              <p className='mt-3 text-sm leading-6 text-muted-foreground'>{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
