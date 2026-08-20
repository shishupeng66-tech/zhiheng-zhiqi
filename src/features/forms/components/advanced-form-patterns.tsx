'use client';

import * as React from 'react';
import { useStore } from '@tanstack/react-form';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdvancedFormValues = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  team: {
    name: string;
    size: number;
  };
  members: Array<{ name: string; role: string }>;
  country: string;
  state: string;
};

// ---------------------------------------------------------------------------
// Country / State data
// ---------------------------------------------------------------------------

const countryStateMap: Record<string, { value: string; label: string }[]> = {
  us: [
    { value: 'ca', label: 'California' },
    { value: 'ny', label: 'New York' },
    { value: 'tx', label: 'Texas' }
  ],
  uk: [
    { value: 'ldn', label: 'London' },
    { value: 'mnc', label: 'Manchester' },
    { value: 'brm', label: 'Birmingham' }
  ],
  au: [
    { value: 'nsw', label: 'New South Wales' },
    { value: 'vic', label: 'Victoria' },
    { value: 'qld', label: 'Queensland' }
  ]
};

const countryOptions = [
  { value: 'us', label: '美国' },
  { value: 'uk', label: '英国' },
  { value: 'au', label: '澳大利亚' }
];

// ---------------------------------------------------------------------------
// Form-level Zod schema (cross-field validation on submit)
// ---------------------------------------------------------------------------

const advancedSchema = z.object({
  username: z.string().min(3, '用户名至少需要 3 个字符'),
  email: z.string().email('邮箱格式无效'),
  password: z.string().min(8, '至少需要 8 个字符'),
  confirmPassword: z.string().min(1, '请确认你的密码'),
  team: z.object({
    name: z.string().min(2, '团队名称至少需要 2 个字符'),
    size: z.number().min(1, '至少 1 名成员').max(100, '最多 100 名成员')
  }),
  members: z
    .array(
      z.object({
        name: z.string().min(1, '成员名称为必填项'),
        role: z.string().min(1, '角色为必填项')
      })
    )
    .min(1, '请至少添加一名成员'),
  country: z.string().min(1, '请选择国家'),
  state: z.string().min(1, '请选择省/州')
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdvancedFormPatterns() {
  const form = useAppForm({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      team: {
        name: '',
        size: 1
      },
      members: [{ name: '', role: '' }],
      country: '',
      state: ''
    } as AdvancedFormValues,
    validators: {
      onSubmit: advancedSchema
    },
    onSubmit: () => {
      toast.success('团队注册成功！');
    }
  });

  // Read current country reactively for dependent state field
  const selectedCountry = useStore(form.store, (s) => s.values.country);
  const stateOptions = countryStateMap[selectedCountry] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-2xl font-bold'>团队注册</CardTitle>
        <p className='text-muted-foreground'>
          演示异步校验、联动字段、嵌套对象、动态数组与监听器副作用。
        </p>
      </CardHeader>
      <CardContent>
        <form
          className='space-y-6'
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          {/* ─── Section 1: Account ─── */}
          <div className='space-y-1'>
            <h3 className='text-lg font-semibold'>账户</h3>
            <p className='text-muted-foreground text-sm'>异步校验、联动字段</p>
          </div>

          <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {/* Username — async validation (spinner built into TextField) */}
            <form.AppField
              name='username'
              asyncDebounceMs={500}
              validators={{
                onChangeAsync: async ({ value }) => {
                  if (!value || value.length < 3) return undefined;
                  await new Promise((r) => setTimeout(r, 500));
                  if (value === 'admin' || value === 'test') {
                    return { message: '用户名已被占用' };
                  }
                  return undefined;
                }
              }}
              children={(field) => (
                <field.TextField label='用户名' required placeholder='请选择用户名' />
              )}
            />

            <form.AppField
              name='email'
              children={(field) => (
                <field.TextField
                  label='邮箱'
                  required
                  type='email'
                  placeholder='you@example.com'
                />
              )}
            />

            <form.AppField
              name='password'
              children={(field) => (
                <field.TextField
                  label='密码'
                  required
                  type='password'
                  placeholder='至少 8 个字符'
                />
              )}
            />

            {/* Confirm Password — linked validation via onChangeListenTo */}
            <form.AppField
              name='confirmPassword'
              validators={{
                onChangeListenTo: ['password'],
                onChange: ({ value, fieldApi }) => {
                  const password = fieldApi.form.getFieldValue('password');
                  if (value && value !== password) {
                    return { message: '两次输入的密码不一致' };
                  }
                  return undefined;
                }
              }}
              children={(field) => (
                <field.TextField
                  label='确认密码'
                  required
                  type='password'
                  placeholder='请再次输入密码'
                />
              )}
            />
          </FieldGroup>

          <Separator />

          {/* ─── Section 2: Team Info (nested objects) ─── */}
          <div className='space-y-1'>
            <h3 className='text-lg font-semibold'>团队信息</h3>
            <p className='text-muted-foreground text-sm'>使用点号路径的嵌套对象</p>
          </div>

          <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <form.AppField
              name='team.name'
              children={(field) => (
                <field.TextField label='团队名称' required placeholder='例如：先锋小队' />
              )}
            />
            <form.AppField
              name='team.size'
              children={(field) => (
                <field.TextField
                  label='团队规模'
                  required
                  type='number'
                  min={1}
                  max={100}
                  placeholder='1-100'
                />
              )}
            />
          </FieldGroup>

          <Separator />

          {/* ─── Section 3: Members (dynamic array rows — raw form.Field) ─── */}
          <div className='space-y-1'>
            <h3 className='text-lg font-semibold'>成员</h3>
            <p className='text-muted-foreground text-sm'>可动态增删的数组行</p>
          </div>

          <form.Field
            name='members'
            mode='array'
            children={(field) => (
              <div className='space-y-3'>
                {field.state.value.map((_, i) => (
                  <div key={i} className='flex items-start gap-2'>
                    <form.Field
                      name={`members[${i}].name`}
                      children={(subField) => {
                        const isSubInvalid =
                          subField.state.meta.isTouched && !subField.state.meta.isValid;
                        return (
                          <Field className='flex-1' data-invalid={isSubInvalid}>
                            <Input
                              id={`member-name-${i}`}
                              name={subField.name}
                              placeholder='成员姓名'
                              value={subField.state.value}
                              onChange={(e) => subField.handleChange(e.target.value)}
                              onBlur={subField.handleBlur}
                              aria-label={`第 ${i + 1} 位成员姓名`}
                              aria-invalid={isSubInvalid}
                              aria-describedby={isSubInvalid ? `member-name-${i}-error` : undefined}
                            />
                            {isSubInvalid && (
                              <FieldError
                                id={`member-name-${i}-error`}
                                errors={subField.state.meta.errors}
                              />
                            )}
                          </Field>
                        );
                      }}
                    />
                    <form.Field
                      name={`members[${i}].role`}
                      children={(subField) => {
                        const isSubInvalid =
                          subField.state.meta.isTouched && !subField.state.meta.isValid;
                        return (
                          <Field className='flex-1' data-invalid={isSubInvalid}>
                            <Input
                              id={`member-role-${i}`}
                              name={subField.name}
                              placeholder='角色'
                              value={subField.state.value}
                              onChange={(e) => subField.handleChange(e.target.value)}
                              onBlur={subField.handleBlur}
                              aria-label={`第 ${i + 1} 位成员角色`}
                              aria-invalid={isSubInvalid}
                              aria-describedby={isSubInvalid ? `member-role-${i}-error` : undefined}
                            />
                            {isSubInvalid && (
                              <FieldError
                                id={`member-role-${i}-error`}
                                errors={subField.state.meta.errors}
                              />
                            )}
                          </Field>
                        );
                      }}
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => field.removeValue(i)}
                      aria-label={`移除第 ${i + 1} 位成员`}
                    >
                      <Icons.close className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => field.pushValue({ name: '', role: '' })}
                >
                  <Icons.add className='mr-2 h-4 w-4' /> 添加成员
                </Button>
                {field.state.value.length > 0 && (
                  <div className='flex flex-wrap gap-1'>
                    {field.state.value
                      .filter((m) => m.name)
                      .map((m, idx) => (
                        <Badge key={idx} variant='secondary'>
                          {m.name}
                          {m.role ? ` (${m.role})` : ''}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}
          />

          <Separator />

          {/* ─── Section 4: Preferences (listeners / side effects) ─── */}
          <div className='space-y-1'>
            <h3 className='text-lg font-semibold'>偏好设置</h3>
            <p className='text-muted-foreground text-sm'>
              监听器副作用——选择国家会重置省/州
            </p>
          </div>

          <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <form.AppField
              name='country'
              listeners={{
                onChange: ({ fieldApi }) => {
                  fieldApi.form.setFieldValue('state', '');
                }
              }}
              children={(field) => (
                <field.SelectField
                  label='国家'
                  required
                  options={countryOptions}
                  placeholder='请选择国家'
                />
              )}
            />
            <form.AppField
              name='state'
              children={(field) => (
                <field.SelectField
                  label='省 / 地区'
                  required
                  options={stateOptions}
                  placeholder={selectedCountry ? '请选择省/州' : '请先选择国家'}
                />
              )}
            />
          </FieldGroup>

          <Separator />

          {/* ─── Submit ─── */}
          <div className='flex gap-4 pt-2'>
            <Button type='button' variant='outline' onClick={() => form.reset()} className='flex-1'>
              重置
            </Button>
            <form.AppForm>
              <form.SubmitButton className='flex-1'>注册团队</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
