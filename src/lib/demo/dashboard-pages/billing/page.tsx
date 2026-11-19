import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { billingInfoContent } from '@/config/infoconfig';

/**
 * 账单与套餐页（本地版，替换原 Clerk <PricingTable> / useOrganization）。
 * 本地企业部署不依赖第三方计费平台，订阅与额度由系统管理员在后台配置。
 */
export default function BillingPage() {
  return (
    <PageContainer
      pageTitle='账单与套餐'
      pageDescription='管理企业订阅与使用额度'
      infoContent={billingInfoContent}
    >
      <div className='space-y-6'>
        <Alert>
          <Icons.info className='h-4 w-4' />
          <AlertDescription>
            本地企业部署版不依赖第三方计费平台，套餐与额度由系统管理员在后台统一配置。
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>套餐与额度</CardTitle>
            <CardDescription>功能建设中</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>
              计费与套餐管理将在后续版本开放。如需调整订阅或额度，请联系系统管理员。
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
