'use client';

import * as React from 'react';
import {
  ArrowUpIcon,
  Bot,
  ChevronDown,
  FileUp,
  ImageIcon,
  Mic2,
  MonitorIcon,
  Paperclip,
  PlusIcon,
  RectangleVertical,
  Sparkles,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type UseAutoResizeTextareaProps = {
  minHeight: number;
  maxHeight?: number;
};

export type V0ChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
};

export type V0ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: V0ChatAttachment[];
  /**
   * 可选的自定义节点。当存在时优先渲染它（而非纯文本 content），
   * 用于把富交互卡片（如自动剪辑任务进度卡）嵌入对话流。
   * 不影响聊天本身的结构，向后兼容普通文本消息。
   */
  contentNode?: React.ReactNode;
};

type MenuItem = {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  /** 触发时可拿到当前输入框内容（例如作为脚本生成主题） */
  onClick?: (currentInput?: string) => void;
};

type QuickAction = {
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary';
  /** 触发时可拿到当前输入框内容（例如作为脚本生成主题） */
  onClick?: (currentInput?: string) => void;
  menuItems?: MenuItem[];
};

type EditingSettingId = 'voice' | 'ratio' | 'resolution';

type EditingSettingButtonProps = {
  id: EditingSettingId;
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  openSetting: EditingSettingId | null;
  disabled?: boolean;
  onOpenChange: (id: EditingSettingId | null) => void;
  onSelect: (option: { id: string; label: string; description?: string }) => void;
};

type SelectableOption = {
  id: string;
  label: string;
  description?: string;
};

type V0AiChatProps = {
  title?: string;
  placeholder?: string;
  messages?: V0ChatMessage[];
  disabled?: boolean;
  isGenerating?: boolean;
  maxFiles?: number;
  acceptedFileTypes?: string;
  onSubmit?: (message: string, files: File[]) => void | Promise<void>;
  quickActions?: QuickAction[];
  voiceOptions?: SelectableOption[];
  onVoiceChange?: (option: SelectableOption) => void;
  ratioOptions?: SelectableOption[];
  onRatioChange?: (option: SelectableOption) => void;
  resolutionOptions?: SelectableOption[];
  onResolutionChange?: (option: SelectableOption) => void;
  modelMenu?: {
    label: string;
    configuredModels: Array<{
      id: string;
      label: string;
      description?: string;
      active?: boolean;
    }>;
    onConfigure?: () => void;
  };
};

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustHeight = React.useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  React.useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function attachmentIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon className='size-4' />;
  if (type.startsWith('video/')) return <Video className='size-4' />;
  return <FileUp className='size-4' />;
}

function toAttachment(file: File): V0ChatAttachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
  };
}

function ActionButton({
  icon,
  label,
  variant = 'default',
  menuItems,
  onClick,
  currentInput
}: QuickAction & { currentInput?: string }) {
  const [open, setOpen] = React.useState(false);
  const className = cn(
    'flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition-colors',
    variant === 'primary'
      ? 'border-primary/60 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90'
      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
  );

  if (menuItems?.length) {
    return (
      <div className='relative'>
        <button
          type='button'
          className={className}
          onClick={() => {
            onClick?.(currentInput);
            setOpen((current) => !current);
          }}
        >
          {icon}
          <span>{label}</span>
          <ChevronDown
            className={cn('size-3.5 opacity-70 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open ? (
          <div className='absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl'>
            {menuItems.map((item) => (
              <button
                key={item.label}
                type='button'
                className='flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground'
                onClick={() => {
                  item.onClick?.(currentInput);
                  setOpen(false);
                }}
              >
                {item.icon}
                <span className='grid gap-0.5'>
                  <span className='font-medium'>{item.label}</span>
                  {item.description ? (
                    <span className='text-xs text-muted-foreground'>{item.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button type='button' className={className} onClick={() => onClick?.(currentInput)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EditingSettingButton({
  id,
  icon,
  label,
  value,
  options,
  openSetting,
  disabled,
  onOpenChange,
  onSelect
}: EditingSettingButtonProps) {
  const open = openSetting === id;

  return (
    <div className='relative'>
      <button
        type='button'
        className='flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
        disabled={disabled}
        onClick={() => onOpenChange(open ? null : id)}
      >
        {icon}
        <span className='hidden sm:inline'>{label}</span>
        <span className='max-w-20 truncate text-zinc-200'>{value}</span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className='absolute bottom-full right-0 z-50 mb-2 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl'>
          <div className='px-2 py-1 text-xs font-medium text-muted-foreground'>{label}</div>
          {options.map((option) => (
            <button
              key={option.id}
              type='button'
              className='flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground'
              onClick={() => {
                onSelect(option);
                onOpenChange(null);
              }}
            >
              <span className='grid gap-0.5'>
                <span>{option.label}</span>
                {option.description ? (
                  <span className='text-xs text-muted-foreground'>{option.description}</span>
                ) : null}
              </span>
              {option.label === value ? (
                <span className='shrink-0 text-xs text-primary'>当前</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function V0AiChat({
  title = '今天要生成什么？',
  placeholder = '描述你的需求...',
  messages = [],
  disabled = false,
  isGenerating = false,
  maxFiles = 10,
  acceptedFileTypes = 'image/*,video/*,.md,.txt,.pdf',
  onSubmit,
  quickActions,
  voiceOptions,
  onVoiceChange,
  ratioOptions,
  onRatioChange,
  resolutionOptions,
  onResolutionChange,
  modelMenu
}: V0AiChatProps) {
  const [value, setValue] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [attachments, setAttachments] = React.useState<V0ChatAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false);
  const [openSetting, setOpenSetting] = React.useState<EditingSettingId | null>(null);
  const [selectedVoice, setSelectedVoice] = React.useState('AI 自动选音色');
  const [selectedRatio, setSelectedRatio] = React.useState('9:16');
  const [selectedResolution, setSelectedResolution] = React.useState('1080P');
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 60, maxHeight: 200 });

  React.useEffect(
    () => () => {
      attachments.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    },
    [attachments]
  );

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
        setOpenSetting(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  function appendFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    const selected = Array.from(nextFiles).slice(0, Math.max(0, maxFiles - files.length));
    setFiles((current) => [...current, ...selected]);
    setAttachments((current) => [...current, ...selected.map(toAttachment)]);
  }

  function removeAttachment(id: string) {
    const target = attachments.find((item) => item.id === id);
    if (target?.preview) URL.revokeObjectURL(target.preview);
    const index = attachments.findIndex((item) => item.id === id);
    setAttachments((current) => current.filter((item) => item.id !== id));
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function handleSubmit() {
    const text = value.trim();
    if (disabled || isGenerating || (!text && files.length === 0)) return;
    await onSubmit?.(text, files);
    setValue('');
    setFiles([]);
    setAttachments((current) => {
      current.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
    adjustHeight(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  const canSubmit = !disabled && !isGenerating && (value.trim().length > 0 || files.length > 0);
  const defaultActions: QuickAction[] = [
    { label: '上传素材', icon: <ImageIcon className='size-4' /> },
    { label: '创建视频任务', icon: <FileUp className='size-4' /> },
    { label: '生成短视频', icon: <MonitorIcon className='size-4' /> }
  ];
  const actions = quickActions ?? defaultActions;
  const availableVoiceOptions = voiceOptions?.length
    ? [{ id: 'auto', label: 'AI 自动选音色' }, ...voiceOptions]
    : [{ id: 'auto', label: 'AI 自动选音色' }];
  const availableRatioOptions = ratioOptions ?? [
    { id: '9:16', label: '9:16' },
    { id: '16:9', label: '16:9' },
    { id: '3:4', label: '3:4' },
    { id: '4:3', label: '4:3' }
  ];
  const availableResolutionOptions = resolutionOptions ?? [
    { id: '720p', label: '720P' },
    { id: '1080p', label: '1080P' }
  ];

  return (
    <div className='mx-auto flex min-h-[calc(100vh-210px)] w-full max-w-5xl flex-col items-center justify-center px-4 py-8'>
      <div className='w-full space-y-8'>
        <div className='space-y-3 text-center'>
          <div className='mx-auto flex size-11 items-center justify-center rounded-xl border bg-card'>
            <Sparkles className='size-5 text-primary' />
          </div>
          <h1 className='text-3xl font-semibold tracking-tight text-foreground md:text-4xl'>
            {title}
          </h1>
        </div>

        {messages.length > 0 ? (
          <div className='mx-auto max-h-[34vh] w-full max-w-4xl space-y-3 overflow-y-auto rounded-xl border bg-card/40 p-3'>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm',
                  message.role === 'user'
                    ? 'ml-auto max-w-[82%] bg-primary text-primary-foreground'
                    : 'mr-auto max-w-[88%] bg-background'
                )}
              >
                {message.contentNode ?? (
                  <div className='whitespace-pre-wrap leading-6'>{message.content}</div>
                )}
                {message.attachments?.length ? (
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {message.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className='flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 text-xs text-foreground'
                      >
                        {attachmentIcon(attachment.type)}
                        <span className='max-w-40 truncate'>{attachment.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className='w-full'>
          <div className='relative rounded-xl border border-border bg-neutral-950 shadow-lg dark:bg-neutral-950'>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isGenerating}
              className='min-h-[60px] resize-none border-none bg-transparent px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus-visible:ring-0'
              style={{ overflow: 'hidden' }}
            />

            {attachments.length > 0 ? (
              <div className='flex gap-2 overflow-x-auto border-t border-neutral-800 p-3'>
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className='relative flex h-20 min-w-52 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-white'
                  >
                    {attachment.preview ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.name}
                        className='size-14 rounded-md object-cover'
                      />
                    ) : (
                      <div className='flex size-14 items-center justify-center rounded-md bg-neutral-800'>
                        {attachmentIcon(attachment.type)}
                      </div>
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-xs font-medium'>{attachment.name}</div>
                      <div className='mt-1 text-[11px] text-neutral-400'>
                        {formatFileSize(attachment.size)}
                      </div>
                    </div>
                    <Button
                      type='button'
                      size='icon-xs'
                      variant='ghost'
                      className='absolute right-1 top-1 text-neutral-400 hover:text-white'
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <X className='size-3' />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className='flex items-center justify-between p-3'>
              <button
                type='button'
                className='group flex items-center gap-1 rounded-lg p-2 transition-colors hover:bg-neutral-800'
                onClick={() => inputRef.current?.click()}
                disabled={disabled || isGenerating}
              >
                <Paperclip className='size-4 text-white' />
                <span className='hidden text-xs text-zinc-400 transition-opacity group-hover:inline'>
                  上传素材
                </span>
              </button>

              <div ref={toolbarRef} className='flex items-center gap-2'>
                <EditingSettingButton
                  id='voice'
                  icon={<Mic2 className='size-3.5' />}
                  label='音色'
                  value={selectedVoice}
                  options={availableVoiceOptions}
                  openSetting={openSetting}
                  disabled={disabled || isGenerating}
                  onOpenChange={(id) => {
                    setModelMenuOpen(false);
                    setOpenSetting(id);
                  }}
                  onSelect={(option) => {
                    setSelectedVoice(option.label);
                    onVoiceChange?.(option);
                  }}
                />
                <EditingSettingButton
                  id='ratio'
                  icon={<RectangleVertical className='size-3.5' />}
                  label='比例'
                  value={selectedRatio}
                  options={availableRatioOptions}
                  openSetting={openSetting}
                  disabled={disabled || isGenerating}
                  onOpenChange={(id) => {
                    setModelMenuOpen(false);
                    setOpenSetting(id);
                  }}
                  onSelect={(option) => {
                    setSelectedRatio(option.label);
                    onRatioChange?.(option);
                  }}
                />
                <EditingSettingButton
                  id='resolution'
                  icon={<MonitorIcon className='size-3.5' />}
                  label='分辨率'
                  value={selectedResolution}
                  options={availableResolutionOptions}
                  openSetting={openSetting}
                  disabled={disabled || isGenerating}
                  onOpenChange={(id) => {
                    setModelMenuOpen(false);
                    setOpenSetting(id);
                  }}
                  onSelect={(option) => {
                    setSelectedResolution(option.label);
                    onResolutionChange?.(option);
                  }}
                />
                {modelMenu ? (
                  <div className='relative'>
                    <button
                      type='button'
                      className='flex items-center justify-between gap-1 rounded-lg border border-dashed border-zinc-700 px-2 py-1 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800'
                      disabled={disabled || isGenerating}
                      onClick={() => {
                        setOpenSetting(null);
                        setModelMenuOpen((current) => !current);
                      }}
                    >
                      <Bot className='size-4' />
                      <span className='max-w-32 truncate'>{modelMenu.label}</span>
                      <ChevronDown
                        className={cn(
                          'size-3.5 transition-transform',
                          modelMenuOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {modelMenuOpen ? (
                      <div className='absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl'>
                        <div className='px-2 py-1 text-xs font-medium text-muted-foreground'>
                          已配置模型
                        </div>
                        {modelMenu.configuredModels.map((model) => (
                          <button
                            key={model.id}
                            type='button'
                            className='flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground'
                            onClick={() => setModelMenuOpen(false)}
                          >
                            <Bot className='mt-0.5 size-4' />
                            <span className='grid flex-1 gap-0.5'>
                              <span className='font-medium'>{model.label}</span>
                              {model.description ? (
                                <span className='text-xs text-muted-foreground'>
                                  {model.description}
                                </span>
                              ) : null}
                            </span>
                            {model.active ? (
                              <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary'>
                                当前
                              </span>
                            ) : null}
                          </button>
                        ))}
                        <div className='my-1 h-px bg-border' />
                        <button
                          type='button'
                          className='flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground'
                          onClick={() => {
                            setModelMenuOpen(false);
                            modelMenu.onConfigure?.();
                          }}
                        >
                          <PlusIcon className='size-4' />
                          配置模型
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type='button'
                    className='flex items-center justify-between gap-1 rounded-lg border border-dashed border-zinc-700 px-2 py-1 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800'
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || isGenerating || attachments.length >= maxFiles}
                  >
                    <PlusIcon className='size-4' />
                    Project
                  </button>
                )}
                <button
                  type='button'
                  className={cn(
                    'flex items-center justify-between gap-1 rounded-lg border border-zinc-700 px-1.5 py-1.5 text-sm transition-colors hover:border-zinc-600 hover:bg-zinc-800',
                    canSubmit ? 'bg-white text-black' : 'text-zinc-400'
                  )}
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  <ArrowUpIcon
                    className={cn('size-4', canSubmit ? 'text-black' : 'text-zinc-400')}
                  />
                  <span className='sr-only'>发送</span>
                </button>
              </div>
            </div>
          </div>

          <div className='mt-4 flex flex-wrap items-center justify-center gap-3'>
            {actions.map((action) => (
              <ActionButton
                key={action.label}
                icon={action.icon ?? <Sparkles className='size-4' />}
                label={action.label}
                variant={action.variant}
                menuItems={action.menuItems}
                onClick={action.onClick}
                currentInput={value}
              />
            ))}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type='file'
        multiple
        className='hidden'
        accept={acceptedFileTypes}
        onChange={(event) => {
          appendFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
