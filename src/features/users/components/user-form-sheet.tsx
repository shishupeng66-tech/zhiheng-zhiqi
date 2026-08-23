'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { createUserMutation, updateUserMutation } from '../api/mutations';
import type { User } from '../api/types';
import { toast } from 'sonner';
import { userSchema, type UserFormValues } from '../schemas/user';
import { INDUSTRY_OPTIONS, SOURCE_OPTIONS, CUSTOMER_STATUS_OPTIONS } from './users-table/options';

interface UserFormSheetProps {
  user?: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormSheet({ user, open, onOpenChange }: UserFormSheetProps) {
  const isEdit = !!user;

  const createMutation = useMutation({
    ...createUserMutation,
    onSuccess: () => {
      toast.success('客户已创建');
      onOpenChange(false);
      form.reset();
    },
    onError: () => toast.error('无法创建客户，请重试。')
  });

  const updateMutation = useMutation({
    ...updateUserMutation,
    onSuccess: () => {
      toast.success('客户已更新');
      onOpenChange(false);
    },
    onError: () => toast.error('无法更新客户，请重试。')
  });

  const form = useAppForm({
    defaultValues: {
      customer_name: user?.customer_name ?? '',
      contact: user?.contact ?? '',
      contact_phone: user?.contact_phone ?? '',
      email: user?.email ?? '',
      company_address: user?.company_address ?? '',
      industry: user?.industry ?? '',
      source: user?.source ?? '',
      owner: user?.owner ?? '',
      status: user?.status ?? '',
      remark: user?.remark ?? ''
    } as UserFormValues,
    validators: {
      onSubmit: userSchema
    },
    onSubmit: async ({ value }) => {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: user.id, values: value });
      } else {
        await createMutation.mutateAsync(value);
      }
    }
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>{isEdit ? '编辑客户' : '新建客户'}</SheetTitle>
          <SheetDescription>
            {isEdit ? '在下方更新客户详情。' : '填写详细信息以创建新客户。'}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form
            id='user-form-sheet'
            className='space-y-6 p-4 md:p-4'
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className='space-y-4'>
              <div className='text-sm font-semibold text-muted-foreground'>基础信息</div>
              <FieldGroup>
                <div className='grid grid-cols-2 gap-4'>
                  <form.AppField
                    name='customer_name'
                    children={(field) => (
                      <field.TextField label='客户名称' required placeholder='请输入客户名称' />
                    )}
                  />
                  <form.AppField
                    name='contact'
                    children={(field) => (
                      <field.TextField label='联系人' required placeholder='请输入联系人' />
                    )}
                  />
                </div>

                <div className='grid grid-cols-2 gap-4'>
                  <form.AppField
                    name='contact_phone'
                    children={(field) => (
                      <field.TextField
                        label='联系电话'
                        required
                        type='tel'
                        placeholder='请输入联系电话'
                      />
                    )}
                  />
                  <form.AppField
                    name='email'
                    children={(field) => (
                      <field.TextField
                        label='邮箱'
                        required
                        type='email'
                        placeholder='zhangsan@example.com'
                      />
                    )}
                  />
                </div>

                <form.AppField
                  name='company_address'
                  children={(field) => (
                    <field.TextField label='公司地址' placeholder='请输入公司地址' />
                  )}
                />

                <form.AppField
                  name='industry'
                  children={(field) => (
                    <field.SelectField
                      label='行业'
                      required
                      options={INDUSTRY_OPTIONS}
                      placeholder='请选择行业'
                    />
                  )}
                />
              </FieldGroup>
            </div>

            <div className='space-y-4'>
              <div className='text-sm font-semibold text-muted-foreground'>业务信息</div>
              <FieldGroup>
                <div className='grid grid-cols-2 gap-4'>
                  <form.AppField
                    name='source'
                    children={(field) => (
                      <field.SelectField
                        label='客户来源'
                        required
                        options={SOURCE_OPTIONS}
                        placeholder='请选择客户来源'
                      />
                    )}
                  />
                  <form.AppField
                    name='owner'
                    children={(field) => (
                      <field.TextField label='负责人' required placeholder='请输入负责人' />
                    )}
                  />
                </div>

                <form.AppField
                  name='status'
                  children={(field) => (
                    <field.SelectField
                      label='客户状态'
                      required
                      options={CUSTOMER_STATUS_OPTIONS}
                      placeholder='请选择客户状态'
                    />
                  )}
                />

                <form.AppField
                  name='remark'
                  children={(field) => (
                    <field.TextareaField label='备注' placeholder='请输入备注' rows={3} />
                  )}
                />
              </FieldGroup>
            </div>
          </form>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <LoadingButton loading={isPending} type='submit' form='user-form-sheet'>
            {isEdit ? '更新客户' : '创建客户'}
          </LoadingButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UserFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> 添加客户
      </Button>
      <UserFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
