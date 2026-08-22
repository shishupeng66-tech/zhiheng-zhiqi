import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * 专属区域页（本地版，替换原 Clerk <Show plan="pro"> / useOrganization）。
 * Pro 套餐概念属于 Clerk SaaS，本地部署由系统管理员配置能力开放，此处以占位说明呈现。
 */
export default function ExclusivePage() {
  return (
    <PageContainer pageTitle='专属区域'>
      <Alert>
        <Icons.lock className='h-5 w-5 text-yellow-600' />
        <AlertDescription>
          专属功能（原 Pro 套餐内容）将在后续版本开放，由系统管理员配置可用能力。
        </AlertDescription>
      </Alert>
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>专属区域</CardTitle>
          <CardDescription>功能建设中</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='text-lg'>感谢使用知衡智企企业本地管理后台。</div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
