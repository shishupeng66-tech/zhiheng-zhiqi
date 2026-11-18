import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';

// 展示用示例数据，尚未连接真实销售记录。
const salesData = [
  { name: '王伟', detail: '上海 · 企业客户', amount: '+¥1,999.00' },
  { name: '李娜', detail: '杭州 · 企业客户', amount: '+¥39.00' },
  { name: '张敏', detail: '深圳 · 企业客户', amount: '+¥299.00' },
  { name: '刘洋', detail: '成都 · 企业客户', amount: '+¥99.00' },
  { name: '陈静', detail: '北京 · 企业客户', amount: '+¥39.00' }
];

export function RecentSales() {
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>近期销售</CardTitle>
        <CardDescription>本月你完成了 265 笔销售。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-8'>
          {salesData.map((sale) => (
            <div key={sale.name} className='flex items-center'>
              <Avatar className='h-9 w-9'>
                <AvatarFallback>{sale.name.slice(-2)}</AvatarFallback>
              </Avatar>
              <div className='ml-4 space-y-1'>
                <p className='text-sm leading-none font-medium'>{sale.name}</p>
                <p className='text-muted-foreground text-sm'>{sale.detail}</p>
              </div>
              <div className='ml-auto font-medium'>{sale.amount}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
