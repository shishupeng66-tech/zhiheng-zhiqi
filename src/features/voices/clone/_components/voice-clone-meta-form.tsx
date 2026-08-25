'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

interface MetaFormProps {
  displayName: string;
  referenceText: string;
  demoText: string;
  onDisplayNameChange: (v: string) => void;
  onReferenceTextChange: (v: string) => void;
  onDemoTextChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * 声音复刻元数据表单 + 「创建声音」按钮
 *
 * 字段:
 *  - displayName      声音名称（用于 voice_clones.displayName）
 *  - referenceText    与上传/录音内容对应的参考文本（强烈建议填写，提升训练效果）
 *  - demoText         试听文本（默认 "你好，这是我的声音试听。"）
 */
export function MetaForm({
  displayName,
  referenceText,
  demoText,
  onDisplayNameChange,
  onReferenceTextChange,
  onDemoTextChange,
  onSubmit,
  disabled
}: MetaFormProps) {
  const submitRef = React.useRef<HTMLButtonElement>(null);
  return (
    <fieldset
      className={cn('space-y-4', disabled && 'pointer-events-none opacity-60')}
      disabled={disabled}
    >
      <Field label='声音名称' hint='给这个声音起个名字，仅用于在「我的声音」列表中辨认'>
        <Input
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder='例如：营销女声 · 业务部'
          maxLength={80}
        />
      </Field>

      <Field
        label='参考文本'
        hint='请填写训练素材中说话人说出的内容。文本与音频不一致时 WER 检测会拒绝。'
        required
      >
        <Textarea
          value={referenceText}
          onChange={(e) => onReferenceTextChange(e.target.value)}
          placeholder='例如：大家好，欢迎来到知衡智企，今天我们来聊聊企业 AI 工作平台。'
          rows={3}
          maxLength={2000}
        />
        <p className='text-muted-foreground text-xs'>{referenceText.length} / 2000</p>
      </Field>

      <Field label='试听文本' hint='训练完成后生成的试听 mp3，会用这段话读出来'>
        <Textarea
          value={demoText}
          onChange={(e) => onDemoTextChange(e.target.value)}
          placeholder='你好，这是我的声音试听。'
          rows={2}
          maxLength={500}
        />
      </Field>

      <div className='flex items-center justify-between pt-2'>
        <p className='text-muted-foreground text-xs'>
          提交后会写入 voice_clones 数据库并立即向豆包发起训练请求
        </p>
        <Button
          ref={submitRef}
          type='button'
          onClick={onSubmit}
          disabled={disabled}
          size='lg'
          className='min-w-32'
        >
          {disabled ? (
            <>
              <Icons.spinner className='size-4 animate-spin' />
              训练中…
            </>
          ) : (
            <>
              <Icons.sparkles className='size-4' />
              创建声音
            </>
          )}
        </Button>
      </div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-1.5'>
      <div className='flex items-baseline justify-between'>
        <label className='text-sm font-medium'>
          {label}
          {required && <span className='text-destructive ml-0.5'>*</span>}
        </label>
      </div>
      {children}
      {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
    </div>
  );
}
