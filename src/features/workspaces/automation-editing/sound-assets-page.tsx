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

const voices = [
  {
    name: '张总声音',
    type: '老板IP声音',
    scene: '企业宣传',
    status: '可用'
  },
  {
    name: '品牌旁白女声',
    type: '企业旁白',
    scene: '产品介绍',
    status: '可用'
  },
  {
    name: '稳重男声',
    type: '通用配音',
    scene: '工业实力展示',
    status: '待确认'
  },
  {
    name: '客服讲解声',
    type: '知识讲解',
    scene: '客户痛点科普',
    status: '可用'
  }
];

export function AutomationEditingSoundAssetsPage() {
  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <h2 className='text-xl font-semibold tracking-tight'>声音资产</h2>
          <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
            管理企业可用于视频生产的声音资源。当前为 UI 原型，不接真实声音模型。
          </p>
        </div>
        <Button>
          <Icons.add className='size-4' />
          添加声音
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>声音列表</CardTitle>
          <CardDescription>用于企业宣传短视频的一键生成、旁白和老板 IP 内容。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>声音名称</TableHead>
                <TableHead>声音类型</TableHead>
                <TableHead>使用场景</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className='text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voices.map((voice) => (
                <TableRow key={voice.name}>
                  <TableCell>
                    <div className='flex items-center gap-3'>
                      <div className='flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary'>
                        <Icons.music className='size-4' />
                      </div>
                      <div>
                        <div className='font-medium'>{voice.name}</div>
                        <div className='text-xs text-muted-foreground'>Mock 声音资产</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{voice.type}</TableCell>
                  <TableCell>{voice.scene}</TableCell>
                  <TableCell>
                    <Badge variant={voice.status === '可用' ? 'secondary' : 'outline'}>
                      {voice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button variant='outline' size='sm'>
                        <Icons.music className='size-3.5' />
                        试听
                      </Button>
                      <Button variant='outline' size='sm'>
                        <Icons.edit className='size-3.5' />
                        编辑
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
