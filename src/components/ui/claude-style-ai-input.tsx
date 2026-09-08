'use client';

import * as React from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  ImageIcon,
  Loader2,
  Music,
  Plus,
  SlidersHorizontal,
  UploadCloud,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FileWithPreview = {
  id: string;
  file: File;
  preview?: string;
  type: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'error';
  uploadProgress?: number;
  textContent?: string;
};

export type PastedContent = {
  id: string;
  content: string;
  timestamp: Date;
  wordCount: number;
};

export type ModelOption = {
  id: string;
  name: string;
  description: string;
  badge?: string;
};

type ClaudeStyleAiInputProps = {
  onSendMessage?: (
    message: string,
    files: FileWithPreview[],
    pastedContent: PastedContent[]
  ) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  models?: ModelOption[];
  defaultModel?: string;
  onModelChange?: (modelId: string) => void;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const PASTE_THRESHOLD = 200;
const DEFAULT_MODELS: ModelOption[] = [
  { id: 'default', name: '智能生成', description: '使用系统默认模型', badge: '默认' },
  { id: 'fast', name: '快速草稿', description: '优先生成速度' },
  { id: 'quality', name: '精细方案', description: '优先内容完整度' }
];

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Number.parseFloat((bytes / 1024 ** index).toFixed(2))} ${sizes[index]}`;
}

function getFileTypeLabel(type: string) {
  const parts = type.split('/');
  let label = (parts[parts.length - 1] || 'FILE').toUpperCase();
  if (label.length > 7 && label.includes('-')) label = label.substring(0, label.indexOf('-'));
  if (label.length > 10) label = `${label.substring(0, 10)}...`;
  return label;
}

function getFileExtension(filename: string) {
  const extension = filename.split('.').pop()?.toUpperCase() || 'FILE';
  return extension.length > 8 ? `${extension.substring(0, 8)}...` : extension;
}

function isTextualFile(file: File) {
  const textualTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript'
  ];
  const textualExtensions = [
    'txt',
    'md',
    'csv',
    'json',
    'xml',
    'yaml',
    'yml',
    'html',
    'css',
    'js',
    'ts',
    'tsx',
    'jsx'
  ];
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return (
    textualTypes.some((type) => file.type.toLowerCase().startsWith(type)) ||
    textualExtensions.includes(extension)
  );
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve((event.target?.result as string) || '');
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function FilePreviewCard({
  file,
  onRemove
}: {
  file: FileWithPreview;
  onRemove: (id: string) => void;
}) {
  const isImage = file.type.startsWith('image/');
  const isTextual = isTextualFile(file.file);

  if (isTextual) return <TextualFilePreviewCard file={file} onRemove={onRemove} />;

  return (
    <div
      className={cn(
        'group relative size-[125px] shrink-0 overflow-hidden rounded-lg border border-zinc-600 bg-zinc-700 p-3 shadow-md',
        isImage && 'p-0'
      )}
    >
      {isImage && file.preview ? (
        <img src={file.preview} alt={file.file.name} className='size-full object-cover' />
      ) : (
        <div className='absolute inset-0 flex items-end bg-gradient-to-b from-transparent to-[#30302E] p-2'>
          <p className='rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white'>
            {getFileTypeLabel(file.type)}
          </p>
        </div>
      )}
      <div className='absolute bottom-2 left-2 max-w-[90%]'>
        <p className='truncate text-xs font-medium text-zinc-100'>{file.file.name}</p>
        <p className='mt-1 text-[10px] text-zinc-400'>{formatFileSize(file.file.size)}</p>
      </div>
      <Button
        size='icon-xs'
        variant='outline'
        className='absolute right-1 top-1 opacity-0 group-hover:opacity-100'
        onClick={() => onRemove(file.id)}
      >
        <X className='size-3' />
      </Button>
    </div>
  );
}

function TextualFilePreviewCard({
  file,
  onRemove
}: {
  file: FileWithPreview;
  onRemove: (id: string) => void;
}) {
  const previewText = file.textContent?.slice(0, 150) || '';
  const needsTruncation = (file.textContent?.length || 0) > 150;

  return (
    <div className='group relative size-[125px] shrink-0 overflow-hidden rounded-lg border border-zinc-600 bg-zinc-700 p-3 shadow-md'>
      <div className='max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[8px] text-zinc-300'>
        {file.textContent ? (
          <>
            {previewText}
            {needsTruncation ? '...' : ''}
          </>
        ) : (
          <div className='flex h-full items-center justify-center text-zinc-400'>
            <Loader2 className='size-4 animate-spin' />
          </div>
        )}
      </div>
      <div className='absolute inset-0 flex items-end bg-gradient-to-b from-transparent to-[#30302E] p-2'>
        <p className='rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white'>
          {getFileExtension(file.file.name)}
        </p>
        <div className='absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
          {file.textContent ? (
            <Button
              size='icon-xs'
              variant='outline'
              onClick={() => navigator.clipboard.writeText(file.textContent || '')}
            >
              <Copy className='size-3' />
            </Button>
          ) : null}
          <Button size='icon-xs' variant='outline' onClick={() => onRemove(file.id)}>
            <X className='size-3' />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PastedContentCard({
  content,
  onRemove
}: {
  content: PastedContent;
  onRemove: (id: string) => void;
}) {
  return (
    <div className='group relative size-[125px] shrink-0 overflow-hidden rounded-lg border border-zinc-600 bg-zinc-700 p-3 shadow-md'>
      <div className='max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[8px] text-zinc-300'>
        {content.content.slice(0, 150)}
        {content.content.length > 150 ? '...' : ''}
      </div>
      <div className='absolute inset-0 flex items-end bg-gradient-to-b from-transparent to-[#30302E] p-2'>
        <p className='rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white'>
          PASTED
        </p>
        <div className='absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
          <Button
            size='icon-xs'
            variant='outline'
            onClick={() => navigator.clipboard.writeText(content.content)}
          >
            <Copy className='size-3' />
          </Button>
          <Button size='icon-xs' variant='outline' onClick={() => onRemove(content.id)}>
            <X className='size-3' />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModelSelectorDropdown({
  models,
  selectedModel,
  onModelChange
}: {
  models: ModelOption[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedModelData = models.find((model) => model.id === selectedModel) || models[0];
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className='relative'>
      <Button
        variant='ghost'
        size='sm'
        className='h-9 px-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className='max-w-[200px] truncate'>{selectedModelData?.name}</span>
        <ChevronDown className={cn('ml-1 size-4 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen ? (
        <div className='absolute bottom-full right-0 z-20 mb-2 w-72 rounded-lg border border-zinc-700 bg-zinc-800 p-2 shadow-xl'>
          {models.map((model) => (
            <button
              key={model.id}
              className={cn(
                'flex w-full items-center justify-between rounded-md p-2.5 text-left transition-colors hover:bg-zinc-700',
                model.id === selectedModel && 'bg-zinc-700'
              )}
              onClick={() => {
                onModelChange(model.id);
                setIsOpen(false);
              }}
            >
              <div>
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-zinc-100'>{model.name}</span>
                  {model.badge ? (
                    <span className='rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-300'>
                      {model.badge}
                    </span>
                  ) : null}
                </div>
                <p className='mt-0.5 text-xs text-zinc-400'>{model.description}</p>
              </div>
              {model.id === selectedModel ? (
                <Check className='size-4 shrink-0 text-blue-400' />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ClaudeStyleAiInput({
  onSendMessage,
  disabled = false,
  placeholder = '描述你想生成的产品图、产品视频或商品内容...',
  maxFiles = MAX_FILES,
  maxFileSize = MAX_FILE_SIZE,
  acceptedFileTypes,
  models = DEFAULT_MODELS,
  defaultModel,
  onModelChange
}: ClaudeStyleAiInputProps) {
  const [message, setMessage] = React.useState('');
  const [files, setFiles] = React.useState<FileWithPreview[]>([]);
  const [pastedContent, setPastedContent] = React.useState<PastedContent[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState(defaultModel || models[0]?.id || '');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    const maxHeight = Number.parseInt(getComputedStyle(textareaRef.current).maxHeight, 10) || 120;
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
  }, [message]);

  const removeFile = React.useCallback((id: string) => {
    setFiles((current) => {
      const fileToRemove = current.find((file) => file.id === id);
      if (fileToRemove?.preview) URL.revokeObjectURL(fileToRemove.preview);
      return current.filter((file) => file.id !== id);
    });
  }, []);

  const handleFileSelect = React.useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;
      const availableSlots = maxFiles - files.length;
      const filesToAdd = Array.from(selectedFiles).slice(0, Math.max(0, availableSlots));
      const newFiles = filesToAdd
        .filter((file) => file.size <= maxFileSize)
        .filter((file) => {
          if (!acceptedFileTypes) return true;
          return acceptedFileTypes.some(
            (type) => file.type.includes(type) || type === file.name.split('.').pop()
          );
        })
        .map<FileWithPreview>((file) => ({
          id: crypto.randomUUID(),
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          type: file.type || 'application/octet-stream',
          uploadStatus: 'uploading',
          uploadProgress: 0
        }));

      setFiles((current) => [...current, ...newFiles]);
      newFiles.forEach((fileToUpload) => {
        if (isTextualFile(fileToUpload.file)) {
          readFileAsText(fileToUpload.file)
            .then((textContent) => {
              setFiles((current) =>
                current.map((file) =>
                  file.id === fileToUpload.id ? { ...file, textContent } : file
                )
              );
            })
            .catch(() => {
              setFiles((current) =>
                current.map((file) =>
                  file.id === fileToUpload.id
                    ? { ...file, uploadStatus: 'error', textContent: '文件读取失败' }
                    : file
                )
              );
            });
        }

        window.setTimeout(() => {
          setFiles((current) =>
            current.map((file) =>
              file.id === fileToUpload.id
                ? { ...file, uploadStatus: 'complete', uploadProgress: 100 }
                : file
            )
          );
        }, 250);
      });
    },
    [acceptedFileTypes, files.length, maxFileSize, maxFiles]
  );

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const fileItems = Array.from(event.clipboardData.items).filter((item) => item.kind === 'file');
    if (fileItems.length > 0 && files.length < maxFiles) {
      event.preventDefault();
      const pastedFiles = fileItems.map((item) => item.getAsFile()).filter(Boolean) as File[];
      const dataTransfer = new DataTransfer();
      pastedFiles.forEach((file) => dataTransfer.items.add(file));
      handleFileSelect(dataTransfer.files);
      return;
    }

    const textData = event.clipboardData.getData('text');
    if (textData && textData.length > PASTE_THRESHOLD && pastedContent.length < 5) {
      event.preventDefault();
      setMessage(`${message}${textData.slice(0, PASTE_THRESHOLD)}...`);
      setPastedContent((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          content: textData,
          timestamp: new Date(),
          wordCount: textData.split(/\s+/).filter(Boolean).length
        }
      ]);
    }
  }

  async function handleSend() {
    if (disabled || (!message.trim() && files.length === 0 && pastedContent.length === 0)) return;
    if (files.some((file) => file.uploadStatus === 'uploading')) return;

    await onSendMessage?.(message, files, pastedContent);
    setMessage('');
    files.forEach((file) => {
      if (file.preview) URL.revokeObjectURL(file.preview);
    });
    setFiles([]);
    setPastedContent([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  const hasContent = message.trim() || files.length > 0 || pastedContent.length > 0;
  const canSend =
    hasContent && !disabled && !files.some((file) => file.uploadStatus === 'uploading');

  return (
    <div
      className='relative mx-auto w-full max-w-4xl'
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFileSelect(event.dataTransfer.files);
      }}
    >
      {isDragging ? (
        <div className='absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-500 bg-[#1C3F62]'>
          <p className='flex items-center gap-2 text-sm text-blue-300'>
            <UploadCloud className='size-4' />
            将素材拖放到这里
          </p>
        </div>
      ) : null}

      <div className='flex min-h-[150px] flex-col items-end gap-2 rounded-xl border border-zinc-700 bg-[#30302E] shadow-lg'>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className='min-h-[100px] max-h-[120px] w-full flex-1 resize-none border-0 bg-transparent p-4 text-sm text-zinc-100 shadow-none outline-none placeholder:text-zinc-500 focus-visible:ring-0 sm:text-base'
          rows={1}
        />

        <div className='flex w-full items-center justify-between gap-2 px-3 pb-1.5'>
          <div className='flex items-center gap-2'>
            <Button
              size='icon'
              variant='ghost'
              className='size-9 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || files.length >= maxFiles}
            >
              <Plus className='size-5' />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              className='size-9 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              disabled={disabled}
            >
              <SlidersHorizontal className='size-5' />
            </Button>
          </div>
          <div className='flex items-center gap-2'>
            <ModelSelectorDropdown
              models={models}
              selectedModel={selectedModel}
              onModelChange={(modelId) => {
                setSelectedModel(modelId);
                onModelChange?.(modelId);
              }}
            />
            <Button
              size='icon'
              className={cn(
                'size-9 rounded-md transition-colors',
                canSend ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-zinc-700 text-zinc-500'
              )}
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              {disabled ? (
                <Loader2 className='size-5 animate-spin' />
              ) : (
                <ArrowUp className='size-5' />
              )}
            </Button>
          </div>
        </div>

        {files.length > 0 || pastedContent.length > 0 ? (
          <div className='w-full overflow-x-auto border-t border-zinc-700 bg-[#262624] p-3'>
            <div className='flex gap-3'>
              {pastedContent.map((content) => (
                <PastedContentCard
                  key={content.id}
                  content={content}
                  onRemove={(id) =>
                    setPastedContent((current) => current.filter((item) => item.id !== id))
                  }
                />
              ))}
              {files.map((file) => (
                <FilePreviewCard key={file.id} file={file} onRemove={removeFile} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type='file'
        multiple
        className='hidden'
        accept={acceptedFileTypes?.join(',')}
        onChange={(event) => {
          handleFileSelect(event.target.files);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
