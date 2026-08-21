'use client';

import * as React from 'react';
import { useStore } from '@tanstack/react-form';
import * as z from 'zod';
import { useAppForm } from '@/lib/form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ToggleGroupItem } from '@/components/ui/toggle-group';
import type { DateRange } from 'react-day-picker';
import { Icons } from '@/components/icons';

// Schema — validated on submit, errors display next to each field
const demoFormSchema = z.object({
  name: z.string().min(2, '姓名至少需要 2 个字符'),
  email: z.email('邮箱地址无效'),
  age: z.number({ error: '年龄为必填项' }).min(18, '必须年满 18 岁'),
  password: z.string().min(8, '密码至少需要 8 个字符'),
  phone: z.string().min(10, '手机号至少需要 10 位数字'),
  website: z.string().url('URL 无效').or(z.literal('')),
  bio: z.string().min(10, '个人简介至少需要 10 个字符'),
  country: z.string().min(1, '请选择国家'),
  framework: z.string().min(1, '请选择框架'),
  interests: z.array(z.string()).min(1, '请至少选择一个兴趣'),
  gender: z.string().min(1, '请选择性别'),
  newsletter: z.boolean(),
  rating: z.number().min(0).max(10),
  birthDate: z.date().optional(),
  dateRange: z.any().optional(),
  eventTime: z.string().optional(),
  favoriteColor: z.string().optional(),
  otp: z.string().min(6, '请输入 6 位数字'),
  formatting: z.array(z.string()).optional(),
  tags: z.array(z.string()).min(1, '请至少添加一个标签'),
  terms: z.boolean().refine((val) => val === true, '你必须同意条款'),
  avatar: z.array(z.any()).optional()
});

const countryOptions = [
  { value: 'us', label: '美国' },
  { value: 'ca', label: '加拿大' },
  { value: 'uk', label: '英国' },
  { value: 'au', label: '澳大利亚' },
  { value: 'de', label: '德国' },
  { value: 'fr', label: '法国' }
];

const frameworkOptions = [
  { value: 'next', label: 'Next.js' },
  { value: 'remix', label: 'Remix' },
  { value: 'astro', label: 'Astro' },
  { value: 'nuxt', label: 'Nuxt' },
  { value: 'svelte', label: 'SvelteKit' },
  { value: 'angular', label: 'Angular' }
];

const interestOptions = [
  { value: 'technology', label: '科技' },
  { value: 'sports', label: '运动' },
  { value: 'music', label: '音乐' },
  { value: 'travel', label: '旅行' },
  { value: 'cooking', label: '烹饪' },
  { value: 'reading', label: '阅读' }
];

const genderOptions = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'prefer-not-to-say', label: '不愿透露' }
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className='space-y-1'>
      <Separator />
      <h3 className='text-muted-foreground pt-2 text-sm font-medium tracking-wide uppercase'>
        {children}
      </h3>
    </div>
  );
}

// ─── Form ───

type DemoFormValues = {
  name: string;
  email: string;
  age?: number;
  password: string;
  phone: string;
  website: string;
  bio: string;
  country: string;
  framework: string;
  interests: string[];
  gender: string;
  newsletter: boolean;
  rating: number;
  birthDate?: Date;
  dateRange?: DateRange;
  eventTime?: string;
  favoriteColor?: string;
  otp: string;
  formatting?: string[];
  tags: string[];
  terms: boolean;
  avatar?: File[];
};

export default function DemoForm() {
  const form = useAppForm({
    defaultValues: {
      name: '',
      email: '',
      age: undefined,
      password: '',
      phone: '',
      website: '',
      bio: '',
      country: '',
      framework: '',
      interests: [],
      gender: '',
      newsletter: false,
      rating: 5,
      birthDate: undefined,
      dateRange: undefined,
      eventTime: '',
      favoriteColor: '#6366f1',
      otp: '',
      formatting: [],
      tags: [],
      terms: false,
      avatar: []
    } as DemoFormValues,
    validators: {
      onSubmit: demoFormSchema
    },
    onSubmit: () => {
      alert('表单提交成功！');
    }
  });

  const formValues = useStore(form.store, (s) => s.values);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <div className='grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]'>
      <Card>
        <CardHeader>
          <CardTitle className='text-2xl font-bold'>全部表单输入示例</CardTitle>
          <p className='text-muted-foreground'>
            涵盖所有可能的表单输入——基于 TanStack Form + shadcn/ui 构建
          </p>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-6'
            noValidate
            aria-busy={isSubmitting}
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            {/* ─── TEXT INPUTS ─── */}
            <SectionTitle>文本输入</SectionTitle>

            <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <form.AppField
                name='name'
                children={(field) => <field.TextField label='姓名' required placeholder='张三' />}
              />

              {/* Async validation: simulated server-side email check */}
              <form.AppField
                name='email'
                asyncDebounceMs={500}
                validators={{
                  onChangeAsync: async ({ value }) => {
                    if (!value || value.length < 3) return undefined;
                    await new Promise((r) => setTimeout(r, 500));
                    if (value === 'taken@example.com') {
                      return { message: '该邮箱已被注册' };
                    }
                    return undefined;
                  }
                }}
                children={(field) => (
                  <field.TextField
                    label='邮箱'
                    required
                    type='email'
                    placeholder='john@example.com'
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

              <form.AppField
                name='age'
                children={(field) => (
                  <field.TextField
                    label='年龄'
                    required
                    type='number'
                    min={18}
                    max={100}
                    placeholder='18'
                  />
                )}
              />

              <form.AppField
                name='phone'
                children={(field) => (
                  <field.TextField
                    label='电话'
                    required
                    type='tel'
                    placeholder='+86 138 0000 0000'
                  />
                )}
              />

              <form.AppField
                name='website'
                children={(field) => (
                  <field.TextField label='网站' type='url' placeholder='https://example.com' />
                )}
              />
            </FieldGroup>

            {/* ─── TEXTAREA ─── */}
            <form.AppField
              name='bio'
              children={(field) => (
                <field.TextareaField
                  label='个人简介'
                  required
                  placeholder='介绍一下你自己……'
                  maxLength={500}
                  rows={4}
                  showCount
                />
              )}
            />

            {/* ─── SELECT & COMBOBOX ─── */}
            <SectionTitle>下拉与组合框</SectionTitle>

            <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <form.AppField
                name='country'
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
                name='framework'
                children={(field) => (
                  <field.ComboboxField
                    label='框架'
                    required
                    description='可搜索下拉框'
                    options={frameworkOptions}
                    placeholder='搜索框架……'
                  />
                )}
              />
            </FieldGroup>

            {/* ─── CHECKBOX & RADIO ─── */}
            <SectionTitle>复选框与单选框</SectionTitle>

            <form.AppField
              name='interests'
              mode='array'
              children={(field) => (
                <field.CheckboxGroupField
                  label='兴趣'
                  required
                  description='可多选'
                  options={interestOptions}
                  className='grid grid-cols-2 gap-3 md:grid-cols-3'
                />
              )}
            />
            {formValues.interests.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {formValues.interests.map((v) => (
                  <Badge key={v} variant='secondary'>
                    {interestOptions.find((o) => o.value === v)?.label || v}
                  </Badge>
                ))}
              </div>
            )}

            <form.AppField
              name='gender'
              children={(field) => (
                <field.RadioGroupField label='性别' required options={genderOptions} />
              )}
            />

            {/* ─── TOGGLE & SWITCH ─── */}
            <SectionTitle>开关与切换</SectionTitle>

            <form.AppField
              name='newsletter'
              children={(field) => (
                <field.SwitchField label='订阅新闻邮件' description='接收新功能与产品的更新通知' />
              )}
            />

            <form.AppField
              name='formatting'
              mode='array'
              children={(field) => (
                <field.ToggleGroupField label='文本格式' description='可多选的切换组'>
                  <ToggleGroupItem value='bold' aria-label='加粗'>
                    <Icons.bold className='h-4 w-4' />
                  </ToggleGroupItem>
                  <ToggleGroupItem value='italic' aria-label='斜体'>
                    <Icons.italic className='h-4 w-4' />
                  </ToggleGroupItem>
                  <ToggleGroupItem value='underline' aria-label='下划线'>
                    <Icons.underline className='h-4 w-4' />
                  </ToggleGroupItem>
                </field.ToggleGroupField>
              )}
            />

            <form.AppField
              name='terms'
              children={(field) => <field.CheckboxField label='我同意服务条款与条件' required />}
            />

            {/* ─── SLIDER ─── */}
            <SectionTitle>滑块</SectionTitle>

            <form.AppField
              name='rating'
              children={(field) => (
                <field.SliderField
                  label='综合评分'
                  description='为你的体验评分（0-10）'
                  min={0}
                  max={10}
                  step={0.5}
                />
              )}
            />

            {/* ─── DATE & TIME ─── */}
            <SectionTitle>日期与时间</SectionTitle>

            <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <form.AppField
                name='birthDate'
                children={(field) => (
                  <field.DatePickerField
                    label='出生日期'
                    disabledDates={(date) => date > new Date()}
                  />
                )}
              />

              <form.AppField
                name='eventTime'
                children={(field) => <field.TextField label='活动时间' type='time' />}
              />
            </FieldGroup>

            <form.AppField
              name='dateRange'
              children={(field) => <field.DateRangeField label='日期范围' />}
            />

            {/* ─── SPECIAL INPUTS ─── */}
            <SectionTitle>特殊输入</SectionTitle>

            <FieldGroup className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <form.AppField
                name='otp'
                children={(field) => (
                  <field.OtpField label='验证码' required description='6 位验证码输入框' />
                )}
              />

              <form.AppField
                name='favoriteColor'
                children={(field) => (
                  <field.ColorField label='喜欢的颜色' description='原生取色器（含十六进制）' />
                )}
              />
            </FieldGroup>

            <form.AppField
              name='tags'
              mode='array'
              children={(field) => (
                <field.TagsField label='标签' required description='按回车或点击“添加”创建标签' />
              )}
            />

            {/* ─── FILE UPLOAD ─── */}
            <SectionTitle>文件上传</SectionTitle>

            <form.AppField
              name='avatar'
              children={(field) => (
                <field.FileUploadField
                  label='头像'
                  description='拖拽或点击上传（最大 5MB）'
                  maxSize={5000000}
                  maxFiles={1}
                />
              )}
            />

            {/* ─── SUBMIT ─── */}
            <Separator />
            <div className='flex gap-4 pt-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => form.reset()}
                className='flex-1'
              >
                重置
              </Button>
              <form.AppForm>
                <form.SubmitButton className='flex-1'>提交表单</form.SubmitButton>
              </form.AppForm>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Form Data Preview - sticky sidebar */}
      <div className='xl:sticky xl:top-16 xl:self-start'>
        <Card>
          <CardHeader>
            <CardTitle>表单数据预览</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='bg-muted max-h-[calc(100vh-8rem)] overflow-auto rounded-lg p-4 text-xs'>
              {JSON.stringify(formValues, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
