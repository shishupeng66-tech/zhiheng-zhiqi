'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';

import { VoiceCloneHero } from './_components/voice-clone-hero';
import { UploadZone } from './_components/voice-clone-upload-zone';
import { RecordingZone } from './_components/voice-clone-recording-zone';
import { LanguageSelector } from './_components/voice-clone-language-selector';
import { MetaForm } from './_components/voice-clone-meta-form';
import { MyVoices } from './_components/voice-clone-my-voices';
import {
  inferAudioFormat,
  MAX_AUDIO_BYTES,
  type CloneLanguageKey,
  type MyCloneEntry
} from './types';

interface VoiceClonePageProps {
  workspaceSlug: string;
}

/**
 * Phase 3-B 声音复刻主页面（client）
 *
 * 状态机：
 *   idle → user fills form & uploads/records → submitting → done/error
 *
 * 数据流：
 *   1. 用户输入表单 + 提供音频 (file 或 recordedBlob)
 *   2. 点击「创建声音」：
 *      - 创建 MyCloneEntry(status=pending) 立即加入列表（乐观更新）
 *      - 调 Phase 3-A 已有的 POST /api/.../voices/clone（API 接口预留，可真调或 mock）
 *      - 成功 → 更新该条目 status=ready + demoAudioUrl
 *      - 失败 → 更新该条目 status=failed + errorMessage，toast 友好提示
 *   3. 不阻塞 UI：捕获错误后列表仍展示本次尝试。
 *
 * Phase 3-B 暂未对接「我的声音」GET API（业务侧拉 voice_clones 全表权限未确定），
 * 所以当前列表由本地 in-memory state 提供；以后再切真后端时把 reload() 接到
 * `GET /api/.../voices/clones`，对外接口语义不变。
 */
export function VoiceClonePage({ workspaceSlug }: VoiceClonePageProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = React.useState<Blob | null>(null);
  const [language, setLanguage] = React.useState<CloneLanguageKey>('cn');
  const [displayName, setDisplayName] = React.useState('');
  const [referenceText, setReferenceText] = React.useState('');
  const [demoText, setDemoText] = React.useState('你好，这是我的声音试听。');
  const [tab, setTab] = React.useState<'upload' | 'record'>('upload');

  const [entries, setEntries] = React.useState<MyCloneEntry[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const hasAudio = Boolean(file || recordedBlob);
  const canSubmit =
    !submitting && hasAudio && displayName.trim().length >= 2 && referenceText.trim().length >= 1;

  const reload = React.useCallback(async () => {
    // Phase 3-B: 暂未对接 GET API，这里仅刷新本地内存。
    // 真实拉取将替换为：fetch(`/api/workspaces/${workspaceSlug}/voices/clones`)…
    setEntries((prev) => [...prev]);
  }, []);

  async function handleSubmit() {
    if (!canSubmit) {
      toast.warning('请填写声音名称、参考文本，并提供音频文件');
      return;
    }
    const entryId = crypto.randomUUID();
    const createdAt = Date.now();
    const audioFormat = inferAudioFormat(file ?? new File([recordedBlob!], 'rec.webm'));
    if (!audioFormat) {
      toast.error('无法识别音频格式');
      return;
    }

    // 乐观加入列表
    const placeholder: MyCloneEntry = {
      id: entryId,
      displayName: displayName.trim(),
      language,
      status: 'pending',
      createdAt
    };
    setEntries((prev) => [placeholder, ...prev]);
    setSubmitting(true);

    try {
      // ---- Phase 3-A 接口预留 (POST /api/.../voices/clone) ----
      const fd = new FormData();
      if (file) {
        fd.append('sample', file);
      } else if (recordedBlob) {
        const ext = audioFormat === 'mp3' ? 'mp3' : audioFormat === 'wav' ? 'wav' : 'webm';
        fd.append(
          'sample',
          new File([recordedBlob], `mic-${createdAt}.${ext}`, { type: recordedBlob.type })
        );
      }
      fd.append('displayName', displayName.trim());
      fd.append('referenceText', referenceText.trim());
      fd.append('language', language);
      fd.append('demoText', demoText.trim() || '你好，这是我的声音试听。');

      // 注意：API 已预留，但本期不阻塞 UI；如果 fetch 抛错（连接失败/超时），
      // 会落到 catch，保持列表显示 pending 条目，仅显示错误。
      const resp = await fetch(`/api/workspaces/${workspaceSlug}/voices/clone`, {
        method: 'POST',
        body: fd
      });
      const payload = (await resp.json().catch(() => ({}))) as {
        voiceCloneId?: string;
        status?: 'training' | 'ready' | 'failed';
        demoAudioUrl?: string;
        errorMessage?: string;
        message?: string;
      };

      if (!resp.ok) {
        throw new Error(payload.errorMessage || payload.message || `HTTP ${resp.status}`);
      }

      // 成功：让 UI 完成状态 → 提交后清理表单
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? {
                ...e,
                status: payload.status === 'ready' ? 'ready' : 'training',
                remoteId: payload.voiceCloneId,
                demoAudioUrl: payload.demoAudioUrl
              }
            : e
        )
      );
      toast.success(`「${displayName}」已开始训练`);
      // 清理表单
      setFile(null);
      setRecordedBlob(null);
      setDisplayName('');
      setReferenceText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'failed', errorMessage: msg } : e))
      );
      toast.error('训练请求失败：' + msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='space-y-8'>
      <VoiceCloneHero />

      <div className='grid gap-6 lg:grid-cols-5'>
        {/* 左：上传 / 录音 / 语言 */}
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>1. 上传或录制参考音频</CardTitle>
            <CardDescription>
              选其一即可。建议 10–30 秒清晰单人说话，背景安静，单文件 ≤ 10MB。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'upload' | 'record')}>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='upload' disabled={submitting}>
                  <Icons.upload className='size-4' />
                  上传音频
                </TabsTrigger>
                <TabsTrigger value='record' disabled={submitting}>
                  <Icons.music className='size-4' />
                  开始录制
                </TabsTrigger>
              </TabsList>
              <TabsContent value='upload' className='mt-4'>
                <UploadZone
                  file={file}
                  onFileChange={(f) => {
                    setFile(f);
                    if (f) setRecordedBlob(null);
                  }}
                  disabled={submitting}
                />
              </TabsContent>
              <TabsContent value='record' className='mt-4'>
                <RecordingZone
                  recordedBlob={recordedBlob}
                  onRecorded={(b) => {
                    setRecordedBlob(b);
                    if (b) setFile(null);
                  }}
                  disabled={submitting}
                />
              </TabsContent>
            </Tabs>

            <div className='mt-6 space-y-2'>
              <label className='text-sm font-medium'>目标语言</label>
              <LanguageSelector value={language} onChange={setLanguage} disabled={submitting} />
              <p className='text-muted-foreground text-xs'>
                选择与素材中说话人语种匹配的语言，可显著提高复刻相似度。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 右：元数据表单 + 创建按钮 */}
        <Card className='lg:col-span-3'>
          <CardHeader>
            <CardTitle className='text-base'>2. 给声音起名并提交</CardTitle>
            <CardDescription>
              为这个声音起个名字，再补充一段与录音对应的文字。点击「创建声音」开始训练。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetaForm
              displayName={displayName}
              referenceText={referenceText}
              demoText={demoText}
              onDisplayNameChange={setDisplayName}
              onReferenceTextChange={setReferenceText}
              onDemoTextChange={setDemoText}
              onSubmit={handleSubmit}
              disabled={submitting}
            />

            {!hasAudio && (
              <p className='text-muted-foreground mt-4 flex items-center gap-1.5 text-xs'>
                <Icons.info className='size-3.5' />
                还没提供音频。上面没文件时，创建声音按钮不可用。
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <MyVoices entries={entries} onReload={reload} loading={false} />

      <p className='text-muted-foreground/70 text-center text-xs'>
        单文件最大 {MAX_AUDIO_BYTES / 1024 / 1024} MB · 训练时长取决于音频长度与队列负载
      </p>
    </div>
  );
}
