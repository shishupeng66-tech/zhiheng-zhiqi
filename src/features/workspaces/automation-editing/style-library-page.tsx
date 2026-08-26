import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 视频剪辑 Skill 库页面(原「风格库」升级)
 *
 * 定位:不是普通视觉风格,而是「视频剪辑 Skill 库」——
 * 每个 Skill 代表一套可执行的自动剪辑规则(脚本 / 素材 / 镜头 / 配音 / 字幕 / BGM)。
 * 未来由 Agent Orchestrator 加载 skill.json 驱动自动剪辑。
 *
 * 本轮为结构占位:展示 5 个初始 Skill + 状态标签;不做复杂编辑器。
 * 规则内容(script/assets/shots/voice/subtitle/bgm/review)在
 * skills/video-editing/<Skill 名>/{skill.md, skill.json} 中迭代。
 */

const skillCards = [
  {
    name: '知识科普型',
    id: 'knowledge-science',
    description: '把客户关心的专业问题讲清楚,用冷知识/反常识开场建立专业信任。',
    rules: [
      '脚本:冷知识 Hook + 2-3 点差异展开',
      '素材:工艺特写 / 检测 / 环境收尾',
      '镜头:讲解节奏,不追求单一长镜头'
    ],
    status: '草稿',
    statusVariant: 'secondary' as const
  },
  {
    name: '老板 IP 观点型',
    id: 'executive-ip',
    description: '老板第一人称表达行业观点,建立专业可信与行业判断力。',
    rules: ['脚本:观点先行 + 三点展开', '素材:口播/办公室/车间佐证', '镜头:观点佐证,画面服务论证'],
    status: '草稿',
    statusVariant: 'secondary' as const
  },
  {
    name: '行业避坑型',
    id: 'industry-avoidance',
    description: '用清单式干货帮客户避开选厂/合作中的常见坑,降低沟通成本。',
    rules: ['脚本:5 坑清单,高信息密度', '素材:流程拆解 / 关键细节特写', '镜头:快节奏点状切换'],
    status: '草稿',
    statusVariant: 'secondary' as const
  },
  {
    name: '工厂实力展示型',
    id: 'factory-showcase',
    description: '用产能数字与生产全流程展示制造能力、设备规模与交付稳定性。',
    rules: ['脚本:数字开场 + 全流程', '素材:灌装/封盖/贴标/装箱', '镜头:一个工序一个镜头'],
    status: '草稿',
    statusVariant: 'secondary' as const
  },
  {
    name: '产品案例型',
    id: 'product-case',
    description: '用真实客户案例讲"从想法到落地"的路径,沉淀复用价值。',
    rules: ['脚本:案例故事开场', '素材:打样→试产→成品递进', '镜头:从无到有的叙事拼贴'],
    status: '草稿',
    statusVariant: 'secondary' as const
  }
];

export function AutomationEditingStyleLibraryPage() {
  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>视频剪辑 Skill 库</h2>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          管理自动剪辑 Skill,每种 Skill 定义脚本、素材、镜头、配音、字幕和 BGM 规则。 未来由 Agent
          按内容类型加载对应 Skill 驱动自动剪辑。
        </p>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        {skillCards.map((skill) => (
          <Card key={skill.id}>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>{skill.name}</CardTitle>
                  <CardDescription className='mt-2 leading-6'>{skill.description}</CardDescription>
                </div>
                <Badge variant={skill.statusVariant}>{skill.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className='grid gap-2 text-sm'>
              {skill.rules.map((rule, i) => (
                <div key={i} className='rounded-lg border bg-muted/20 p-3 leading-6'>
                  {rule}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className='text-xs leading-5 text-muted-foreground'>
        状态说明:草稿 = 结构占位,规则待结合企业定位与真实成片测试迭代;测试中 = 已进入成片测试;已发布
        = 达到验收线可正式使用。 规则结构定义见{' '}
        <code className='font-mono'>skills/video-editing/schema.v1.json</code>。
      </p>
    </div>
  );
}
