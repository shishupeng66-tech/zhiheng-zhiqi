/**
 * Phase 3-B 声音复刻 UI 类型与常量
 *
 * 这些常量定义在「前端」侧，与后端豆包 voice_clone 接口的语言码映射保持一致；
 * 后端 (services/voice-service/app/providers/clone.py) 的 LANGUAGE_CODE_MAP 是权威源，
 * 这里只是 UI 下拉枚举，二者同步演进。
 */
export type CloneLanguageKey = 'cn' | 'en' | 'ja' | 'es' | 'id';

export const SUPPORTED_LANGUAGES: ReadonlyArray<{
  key: CloneLanguageKey;
  label: string;
  code: number;
}> = [
  { key: 'cn', label: '中文（普通话）', code: 0 },
  { key: 'en', label: '英语', code: 1 },
  { key: 'ja', label: '日语', code: 2 },
  { key: 'es', label: '西班牙语', code: 3 },
  { key: 'id', label: '印尼语', code: 4 }
];

/** 录音状态机 */
export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopped'
  | 'denied'
  | 'unsupported';

/** 前端「我的声音」列表项（乐观更新或来自后端真实回写） */
export interface MyCloneEntry {
  id: string; // 本地 uuid（伪 ID），与后端 voice_clones.id 区分
  displayName: string;
  language: CloneLanguageKey;
  status: 'pending' | 'training' | 'ready' | 'failed';
  errorMessage?: string;
  demoAudioUrl?: string;
  createdAt: number; // Date.now()
  /** 真实后端 voice_clones.id，前端列表在列表刷新时对齐；空表示本次仅本地乐观添加 */
  remoteId?: string;
}

/** 上传文件白名单（与 services/voice-service Phase 3-A ALLOWED_FORMATS 对齐） */
export const ALLOWED_AUDIO_MIME = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/x-aac'
] as const;

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

/** 从浏览器 File 推断音频格式（后端 sample_format 用） */
export function inferAudioFormat(file: File): 'wav' | 'mp3' | 'ogg' | 'm4a' | 'aac' | 'pcm' | null {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.includes('wav') || name.endsWith('.wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3') || name.endsWith('.mp3')) return 'mp3';
  if (mime.includes('ogg') || name.endsWith('.ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || name.endsWith('.m4a')) return 'm4a';
  if (mime.includes('aac') || name.endsWith('.aac')) return 'aac';
  if (mime.includes('pcm') || name.endsWith('.pcm')) return 'pcm';
  return null;
}
