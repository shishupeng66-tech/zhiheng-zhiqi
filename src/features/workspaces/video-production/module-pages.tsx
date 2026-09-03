import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WorkspaceEmptyState } from '../components/workspace-empty-state';
import { WorkspaceModulePage } from '../components/workspace-module-page';

export function AssetsPage() {
  return (
    <WorkspaceModulePage
      title='素材库'
      description='集中管理企业短视频生产所需的视频、图片、标签和素材分析状态。'
      primaryAction='上传素材'
      metrics={[
        { label: '视频素材', value: 0 },
        { label: '图片素材', value: 0 },
        { label: '待分析', value: 0 },
        { label: '已打标签', value: 0 }
      ]}
      sections={[
        {
          title: '视频',
          description: '后续展示视频素材、抽帧结果与可用片段。',
          tags: ['搜索', '标签', '分析状态']
        },
        {
          title: '图片',
          description: '后续展示图片素材、人物、场景和产品标签。',
          tags: ['图片', '分类', '可用性']
        },
        {
          title: '素材理解',
          description: '预留素材理解、抽帧、标签和素材卡片能力。',
          tags: ['AI 分析', '标签', '结构化']
        }
      ]}
      emptyTitle='素材库还没有内容'
      emptyDescription='上传视频或图片素材后，这里会展示素材卡片、标签和分析状态。'
    />
  );
}

export function TopicsPage() {
  return (
    <WorkspaceModulePage
      title='选题中心'
      description='沉淀选题来源、生产状态和 AI 推荐入口，后续接入企业知识与已有素材。'
      primaryAction='新建选题'
      actions={[
        { label: 'AI 推荐选题', icon: 'sparkles' },
        { label: '从素材创建', icon: 'media' },
        { label: '从知识创建', icon: 'post' }
      ]}
      sections={[
        {
          title: '选题列表',
          description: '后续展示选题标题、来源、状态、负责人和更新时间。',
          tags: ['草稿', '已确认', '已使用']
        },
        {
          title: '来源管理',
          description: '记录企业知识、热点、素材洞察和人工输入来源。',
          tags: ['企业知识', '素材', '人工']
        },
        {
          title: '状态流转',
          description: '为选题从生成到确认再到脚本生产预留状态。',
          tags: ['待确认', '生产中', '已归档']
        }
      ]}
      emptyTitle='还没有选题'
      emptyDescription='可以先手动创建选题，后续接入企业知识和素材后再启用 AI 推荐。'
    />
  );
}

export function ScriptsPage() {
  return (
    <WorkspaceModulePage
      title='脚本中心'
      description='管理短视频脚本草稿、确认状态和使用记录。'
      primaryAction='新建脚本'
      actions={[
        { label: 'AI 生成脚本', icon: 'sparkles' },
        { label: '导入选题', icon: 'post' },
        { label: '查看已确认', icon: 'check' }
      ]}
      sections={[
        { title: '草稿', description: '存放待编辑和待确认的脚本草稿。', tags: ['草稿', '可编辑'] },
        { title: '已确认', description: '进入视频生产前的最终脚本版本。', tags: ['确认', '版本'] },
        {
          title: '已使用',
          description: '记录脚本关联的视频项目和复用情况。',
          tags: ['项目', '复用']
        }
      ]}
      emptyTitle='还没有脚本'
      emptyDescription='从选题生成脚本，或手动创建第一条短视频脚本。'
    />
  );
}

export function AiVideoPage() {
  const steps = ['选择素材', 'AI选题与脚本', 'AI导演与配镜头', '自动成片', '审核'];

  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>AI 视频生产</h2>
        <p className='max-w-3xl text-sm text-muted-foreground'>
          这里是自动剪辑核心工作台的第一版流程骨架，暂不接入 FFmpeg 或真实成片引擎。
        </p>
      </div>

      <div className='grid gap-3 lg:grid-cols-5'>
        {steps.map((step, index) => (
          <Card key={step} className='min-h-32'>
            <CardHeader>
              <Badge variant='outline' className='mb-2 w-fit'>
                {index + 1}
              </Badge>
              <CardTitle>{step}</CardTitle>
              <CardDescription>
                {index === 0 && '选择企业素材库中的视频、图片和可用片段。'}
                {index === 1 && '结合素材与知识生成选题和脚本候选。'}
                {index === 2 && '规划镜头结构、节奏和画面组合。'}
                {index === 3 && '预留自动渲染、字幕、配乐和导出流程。'}
                {index === 4 && '进入审核中心进行确认、修改或发布。'}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>生产任务</CardTitle>
          <CardDescription>
            真实任务接入后，这里会展示素材、脚本、成片状态和操作记录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceEmptyState
            title='还没有 AI 视频生产任务'
            description='从选择素材和脚本开始，后续会在这里形成自动剪辑任务队列。'
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectsPage() {
  return (
    <WorkspaceModulePage
      title='视频项目'
      description='跟踪未来的视频生产任务，包括项目名称、选题、状态、创建人和更新时间。'
      primaryAction='新建视频项目'
      sections={[
        { title: '项目名称', description: '后续用于展示每个视频生产项目的主标题。' },
        { title: '选题', description: '项目会关联一个或多个选题来源。' },
        { title: '状态', description: '覆盖草稿、生产中、待审核、待发布、已发布。' }
      ]}
      emptyTitle='还没有视频项目'
      emptyDescription='新建视频项目后，这里会展示项目列表和生产状态。'
    />
  );
}

export function ReviewPage() {
  return (
    <WorkspaceModulePage
      title='审核中心'
      description='集中处理待审核视频、审核通过和需要修改的内容。'
      metrics={[
        { label: '待审核视频', value: 0 },
        { label: '审核通过', value: 0 },
        { label: '需要修改', value: 0 }
      ]}
      sections={[
        { title: '待审核', description: '等待负责人确认内容质量、合规与品牌表达。' },
        { title: '审核通过', description: '通过后进入发布中心。' },
        { title: '需要修改', description: '退回脚本或 AI 视频生产流程继续调整。' }
      ]}
      emptyTitle='当前没有待审核内容'
      emptyDescription='生成视频项目并提交审核后，这里会显示审核任务。'
    />
  );
}

export function PublishPage() {
  return (
    <WorkspaceModulePage
      title='发布中心'
      description='管理待发布、已排期、已发布和发布失败的视频内容。暂不接入抖音发布。'
      metrics={[
        { label: '待发布', value: 0 },
        { label: '已排期', value: 0 },
        { label: '已发布', value: 0 },
        { label: '发布失败', value: 0 }
      ]}
      emptyTitle='当前没有发布任务'
      emptyDescription='审核通过的视频会进入发布中心，后续再接入平台账号和排期能力。'
    />
  );
}

export function AnalyticsPage() {
  return (
    <WorkspaceModulePage
      title='数据复盘'
      description='为内容数量、播放、互动、线索和表现趋势预留复盘结构。'
      metrics={[
        { label: '内容数量', value: 0 },
        { label: '播放', value: 0 },
        { label: '互动', value: 0 },
        { label: '线索', value: 0 }
      ]}
      sections={[
        { title: '表现趋势', description: '暂无真实数据，不生成虚假的增长曲线。' },
        { title: '内容复盘', description: '后续按选题、脚本、素材和发布时间分析表现。' },
        { title: '线索归因', description: '预留从内容曝光到销售线索的归因结构。' }
      ]}
      emptyTitle='暂无可复盘数据'
      emptyDescription='发布数据接入后，这里会展示真实趋势和内容表现。'
    />
  );
}
