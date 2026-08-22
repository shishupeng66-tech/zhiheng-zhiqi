import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';

const tasks = [
  {
    name: '智能产线交付能力 60 秒宣传片',
    style: '工业实力展示风',
    status: '待审核',
    createdAt: '今天 09:42'
  },
  {
    name: '老板谈制造企业降本增效',
    style: '老板行业观点风',
    status: '生成中',
    createdAt: '今天 08:15'
  },
  {
    name: '客户如何判断供应商稳定性',
    style: '客户痛点科普风',
    status: '需重生成',
    createdAt: '昨天 17:30'
  },
  {
    name: '新能源零部件案例展示',
    style: '产品案例展示风',
    status: '已通过',
    createdAt: '昨天 14:05'
  }
];

const statusVariant = {
  待审核: 'secondary',
  生成中: 'outline',
  需重生成: 'destructive',
  已通过: 'default'
} as const;

export function AutomationEditingReviewPage() {
  return (
    <div className='space-y-5'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>任务审核</h2>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          AI 自动生成后进入任务队列，管理员可以查看、删除或重新生成。当前为 mock 数据。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>视频生产任务</CardTitle>
          <CardDescription>用于验收任务列表的信息结构和操作入口。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>视频名称</TableHead>
                <TableHead>风格</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.name}>
                  <TableCell>
                    <div className='font-medium'>{task.name}</div>
                    <div className='text-xs text-muted-foreground'>AI 自动剪辑任务</div>
                  </TableCell>
                  <TableCell>{task.style}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[task.status as keyof typeof statusVariant]}>
                      {task.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{task.createdAt}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button variant='outline' size='sm'>
                        <Icons.post className='size-3.5' />
                        查看
                      </Button>
                      <Button variant='outline' size='sm'>
                        <Icons.sparkles className='size-3.5' />
                        重新生成
                      </Button>
                      <Button variant='destructive' size='sm'>
                        <Icons.trash className='size-3.5' />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
