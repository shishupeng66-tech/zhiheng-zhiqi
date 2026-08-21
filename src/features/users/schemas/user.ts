import * as z from 'zod';

export const userSchema = z.object({
  first_name: z.string().min(2, '名至少需要 2 个字符'),
  last_name: z.string().min(2, '姓至少需要 2 个字符'),
  email: z.string().email('请输入有效的邮箱地址'),
  phone: z.string().min(1, '请输入电话号码'),
  role: z.string().min(1, '请选择角色'),
  status: z.string().min(1, '请选择状态')
});

export type UserFormValues = z.infer<typeof userSchema>;
