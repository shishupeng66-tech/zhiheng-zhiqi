import PageContainer from '@/components/layout/page-container';
import SheetFormDemo from '@/features/forms/components/sheet-form-demo';

export const metadata = {
  title: '仪表盘：抽屉与弹窗表单'
};

export default function Page() {
  return (
    <PageContainer
      pageTitle='抽屉与弹窗表单'
      pageDescription='位于抽屉与弹窗内、使用外部提交按钮的表单模式。'
    >
      <SheetFormDemo />
    </PageContainer>
  );
}
