'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import { inferAudioFormat, type RecorderState } from '../types';

interface RecordingZoneProps {
  recordedBlob: Blob | null;
  onRecorded: (blob: Blob | null) => void;
  disabled?: boolean;
}

/**
 * 浏览器内录音（MediaRecorder API）。
 *
 * 流程：
 *  - 申请麦克风授权
 *  - 录制中显示实时波形（柱条按音量动态变化）
 *  - 停止后生成 Blob，可试听 / 移除
 *
 * 失败 fallback：浏览器不支持 MediaRecorder → 显示禁用按钮 + 说明。
 */
export function RecordingZone({ recordedBlob, onRecorded, disabled }: RecordingZoneProps) {
  const [state, setState] = React.useState<RecorderState>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [level, setLevel] = React.useState(0); // 0..1
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startedAtRef = React.useRef<number>(0);

  const previewUrl = React.useMemo(() => {
    if (!recordedBlob) return null;
    return URL.createObjectURL(recordedBlob);
  }, [recordedBlob]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  React.useEffect(() => {
    return () => stopInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startInternal() {
    setState('requesting');
    try {
      if (typeof MediaRecorder === 'undefined') {
        setState('unsupported');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        onRecorded(blob);
        stopInternal();
      };

      recorder.start(100);
      startedAtRef.current = Date.now();
      setElapsed(0);

      // 音量分析
      const AC =
        (
          window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          const avg = sum / buf.length / 255;
          setLevel(avg);
          if (recorderRef.current && recorderRef.current.state === 'recording') {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        tick();
      }

      setState('recording');
      // 计时
      const timer = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      // 把 timer id 关联到 state 里:不另开 hook,在 onstop 时清理
      (recorder as unknown as { __timer?: number }).__timer = timer;
    } catch (err) {
      console.warn('mic permission denied or failed', err);
      setState('denied');
    }
  }

  function stopInternal() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      const t = (recorderRef.current as unknown as { __timer?: number }).__timer;
      if (t) window.clearInterval(t);
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }

  function handleStop() {
    setState('stopped');
    stopInternal();
  }

  function handleReset() {
    onRecorded(null);
    setElapsed(0);
    setLevel(0);
    setState('idle');
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  }

  const recordedFilePreview = React.useMemo(() => {
    if (!recordedBlob) return null;
    return {
      name: 'mic-recording.webm',
      size: recordedBlob.size,
      format:
        inferAudioFormat(new File([recordedBlob], 'rec.webm', { type: recordedBlob.type })) ??
        'webm'
    };
  }, [recordedBlob]);

  return (
    <div className='space-y-3'>
      <div className='bg-card flex items-center gap-3 rounded-lg border p-3'>
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-md transition-colors',
            state === 'recording'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'
          )}
        >
          <Icons.music className='size-4' />
        </div>
        <div className='flex-1'>
          <p className='text-sm font-medium'>实时录音</p>
          <p className='text-muted-foreground text-xs'>
            {state === 'idle' && '点击开始录制，建议 10–30 秒清晰人声'}
            {state === 'requesting' && '正在请求麦克风权限…'}
            {state === 'recording' && `录制中 ${formatTime(elapsed)}`}
            {state === 'stopped' && '已停止，可以试听或重录'}
            {state === 'denied' && '麦克风权限被拒绝，请到浏览器设置允许'}
            {state === 'unsupported' && '当前浏览器不支持录音 API'}
          </p>
        </div>
        {state === 'idle' && (
          <Button type='button' size='sm' onClick={startInternal} disabled={Boolean(disabled)}>
            开始录制
          </Button>
        )}
        {state === 'unsupported' && (
          <Button type='button' size='sm' disabled>
            浏览器不支持
          </Button>
        )}
        {state === 'recording' && (
          <Button type='button' size='sm' variant='destructive' onClick={handleStop}>
            <span className='mr-1.5 inline-block size-2 rounded-full bg-white' />
            停止
          </Button>
        )}
        {state === 'requesting' && (
          <Button type='button' size='sm' disabled>
            <Icons.spinner className='size-4 animate-spin' />
          </Button>
        )}
      </div>

      {/* 实时电平条 */}
      {state === 'recording' && <LiveLevelBars level={level} />}

      {recordedBlob && previewUrl && recordedFilePreview && (
        <div className='bg-card flex items-center gap-3 rounded-lg border p-3'>
          <div className='bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md'>
            <Icons.music className='size-4' />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium'>{recordedFilePreview.name}</p>
            <p className='text-muted-foreground text-xs'>
              {(recordedFilePreview.size / 1024).toFixed(1)} KB · 录音 {formatTime(elapsed)}
            </p>
          </div>
          <audio src={previewUrl} controls className='h-8 max-w-40' preload='metadata' />
          <Button type='button' variant='ghost' size='icon' onClick={handleReset} aria-label='重录'>
            <Icons.trash className='size-4' />
          </Button>
        </div>
      )}
    </div>
  );
}

function LiveLevelBars({ level }: { level: number }) {
  // 32 段条，根据 level 着色深度
  const bars = Array.from({ length: 32 }).map((_, i) => i);
  const intensity = Math.min(1, level * 2.4);
  return (
    <div className='bg-card flex items-center justify-center gap-0.5 rounded-lg border px-3 py-4'>
      {bars.map((b) => {
        // 让中间几段比两端更亮
        const dist = Math.abs(b - 16) / 16;
        const fill = Math.max(0.15, intensity - dist * 0.6);
        return (
          <div
            key={b}
            className='rounded-sm transition-all duration-75'
            style={{
              height: 4 + fill * 36,
              width: 4,
              backgroundColor: `oklch(0.62 0.18 250 / ${0.35 + fill * 0.65})`
            }}
          />
        );
      })}
    </div>
  );
}
