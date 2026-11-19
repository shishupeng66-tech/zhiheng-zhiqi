import PageContainer from '@/components/layout/page-container';
import DemoForm from '@/components/forms/demo-form';

export const metadata = {
  title: '仪表盘：基础表单'
};

export default function Page() {
  return (
    <PageContainer pageTitle='基础表单' pageDescription='涵盖所有字段类型的综合表单示例。'>
      <DemoForm />
    </PageContainer>
  );
}
