'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import { ALLOWED_AUDIO_MIME, MAX_AUDIO_BYTES, inferAudioFormat } from '../types';

interface UploadZoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * 上传训练音频区
 * - 拖拽 + 点选
 * - 已选文件:文件名 / 大小 / 试听本地 URL / 移除按钮
 * - 自动调用 inferAudioFormat 推断格式，超 10MB 提示
 */
export function UploadZone({ file, onFileChange, disabled }: UploadZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const previewUrl = React.useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function validateAndSet(f: File | null) {
    setError(null);
    if (!f) {
      onFileChange(null);
      return;
    }
    if (!inferAudioFormat(f)) {
      setError('不支持的音频格式，请使用 wav / mp3 / ogg / m4a / aac');
      return;
    }
    if (f.size > MAX_AUDIO_BYTES) {
      setError(`文件超过 10MB 上限（当前 ${(f.size / 1024 / 1024).toFixed(2)} MB）`);
      return;
    }
    onFileChange(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f) validateAndSet(f);
  }

  return (
    <div className='space-y-3'>
      <div
        className={cn(
          'rounded-xl border-2 border-dashed transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/30',
          disabled && 'pointer-events-none opacity-60'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <label className='block cursor-pointer p-8 text-center'>
          <input
            ref={inputRef}
            type='file'
            accept={ALLOWED_AUDIO_MIME.join(',')}
            className='sr-only'
            onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
          />
          <div className='text-muted-foreground mx-auto flex max-w-md flex-col items-center gap-3'>
            <div className='bg-background rounded-full border p-3'>
              <Icons.upload className='size-6' />
            </div>
            <div className='space-y-1'>
              <p className='text-foreground text-sm font-medium'>
                拖拽文件到此，或
                <span className='text-primary mx-1 underline-offset-4 hover:underline'>
                  点击选择
                </span>
              </p>
              <p className='text-xs'>
                wav / mp3 / ogg / m4a / aac · 单文件 ≤ 10MB · 建议 10–30 秒清晰人声
              </p>
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div className='text-destructive flex items-center gap-2 text-xs'>
          <Icons.alertCircle className='size-3.5' />
          {error}
        </div>
      )}

      {file && !error && (
        <div className='bg-card flex items-center gap-3 rounded-lg border p-3'>
          <div className='bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md'>
            <Icons.music className='size-4' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium'>{file.name}</p>
            <p className='text-muted-foreground text-xs'>
              {(file.size / 1024).toFixed(1)} KB · {inferAudioFormat(file) ?? '未知格式'}
            </p>
          </div>
          {previewUrl && (
            <audio src={previewUrl} controls className='h-8 max-w-40' preload='metadata' />
          )}
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => validateAndSet(null)}
            aria-label='移除音频'
            disabled={disabled}
          >
            <Icons.trash className='size-4' />
          </Button>
        </div>
      )}
    </div>
  );
}
