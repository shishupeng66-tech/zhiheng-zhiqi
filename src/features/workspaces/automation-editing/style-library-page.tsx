import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const styles = [
  {
    name: '工业实力展示风',
    positioning: '展示制造能力、设备规模、产线效率和交付稳定性。',
    customer: '有采购意向但需要验证供应商实力的 B 端客户。',
    topics: '工厂实力、设备能力、质检流程、交付周期、团队经验。',
    script: '开头给出制造场景，中段用事实证明能力，结尾给出合作信任点。',
    shots: '航拍、产线全景、设备特写、工人操作、质检动作、成品出库。'
  },
  {
    name: '老板行业观点风',
    positioning: '通过负责人观点建立专业可信和行业判断力。',
    customer: '关注长期合作、行业理解和企业稳定性的客户。',
    topics: '行业趋势、成本变化、质量标准、供应链判断、客户选择误区。',
    script: '观点先行，三点展开，结合企业实践，结尾形成判断建议。',
    shots: '老板口播、办公室、会议、工厂走访、观点字幕、数据卡片。'
  },
  {
    name: '客户痛点科普风',
    positioning: '把客户常见问题讲清楚，降低沟通成本。',
    customer: '正在比较方案、容易被价格或参数困住的潜在客户。',
    topics: '选型误区、质量风险、交期风险、售后问题、验厂关注点。',
    script: '提出痛点，解释原因，给出判断标准，引导客户咨询。',
    shots: '问题字幕、对比镜头、流程拆解、关键细节特写、结论卡片。'
  },
  {
    name: '产品案例展示风',
    positioning: '用具体案例证明产品应用价值和交付结果。',
    customer: '已经有明确需求，需要看到案例和落地效果的客户。',
    topics: '客户背景、需求挑战、解决方案、交付过程、最终结果。',
    script: '案例背景开场，展示过程证据，突出结果指标，沉淀复用价值。',
    shots: '产品细节、应用场景、前后对比、交付现场、客户结果。'
  }
];

export function AutomationEditingStyleLibraryPage() {
  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>风格库</h2>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          企业内容风格不是滤镜，而是 AI 生产视频时使用的内容定位、脚本规则和镜头规则。
        </p>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        {styles.map((style) => (
          <Card key={style.name}>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>{style.name}</CardTitle>
                  <CardDescription className='mt-2 leading-6'>{style.positioning}</CardDescription>
                </div>
                <Badge variant='secondary'>企业风格</Badge>
              </div>
            </CardHeader>
            <CardContent className='grid gap-3 text-sm'>
              <Info label='目标客户' value={style.customer} />
              <Info label='选题方向' value={style.topics} />
              <Info label='脚本规则' value={style.script} />
              <Info label='镜头规则' value={style.shots} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border bg-muted/20 p-3'>
      <div className='text-xs font-medium text-muted-foreground'>{label}</div>
      <div className='mt-1 leading-6'>{value}</div>
    </div>
  );
}
