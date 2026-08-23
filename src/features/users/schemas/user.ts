import * as z from 'zod';

export const userSchema = z.object({
  customer_name: z.string().min(2, '客户名称至少需要 2 个字符'),
  contact: z.string().min(2, '联系人至少需要 2 个字符'),
  contact_phone: z.string().min(1, '请输入联系电话'),
  email: z.string().email('请输入有效的邮箱地址'),
  company_address: z.string(),
  industry: z.string().min(1, '请选择行业'),
  source: z.string().min(1, '请选择客户来源'),
  owner: z.string().min(1, '请输入负责人'),
  status: z.string().min(1, '请选择客户状态'),
  remark: z.string()
});

export type UserFormValues = z.infer<typeof userSchema>;
