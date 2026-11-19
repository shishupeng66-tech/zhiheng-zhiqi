import PageContainer from '@/components/layout/page-container';
import AdvancedFormPatterns from '@/features/forms/components/advanced-form-patterns';

export const metadata = {
  title: '仪表盘：高级表单模式'
};

export default function Page() {
  return (
    <PageContainer
      pageTitle='高级表单模式'
      pageDescription='联动字段、异步校验、动态行、嵌套对象、跨字段校验以及表单级错误。'
    >
      <AdvancedFormPatterns />
    </PageContainer>
  );
}
