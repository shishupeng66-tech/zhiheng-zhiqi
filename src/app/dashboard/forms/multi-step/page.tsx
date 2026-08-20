import PageContainer from '@/components/layout/page-container';
import FormsShowcasePage from '@/features/forms/components/forms-showcase-page';

export const metadata = {
  title: '仪表盘：分步表单'
};

export default function Page() {
  return (
    <PageContainer pageTitle='分步表单' pageDescription='多步骤向导式表单模式。'>
      <FormsShowcasePage />
    </PageContainer>
  );
}
