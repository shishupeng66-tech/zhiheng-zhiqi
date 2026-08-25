/**
 * Phase 3-B 声音复刻 Hero
 *
 * 标题 + 一句话价值主张 + 装饰性波形（纯 SVG，无实时音频分析）
 */
export function VoiceCloneHero() {
  return (
    <div className='from-background via-background to-muted/30 relative overflow-hidden rounded-2xl border bg-gradient-to-br px-8 py-12'>
      <div className='relative z-10 mx-auto max-w-3xl space-y-4 text-center'>
        <div className='text-muted-foreground inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium backdrop-blur'>
          <span className='bg-primary inline-block size-1.5 rounded-full' />
          知衡语音 · 声音复刻 2.0
        </div>
        <h1 className='text-foreground text-3xl font-semibold tracking-tight md:text-4xl'>
          让每一段文案都拥有
          <span className='from-primary to-primary/60 bg-gradient-to-r bg-clip-text text-transparent'>
            {' '}
            你的声音{' '}
          </span>
        </h1>
        <p className='text-muted-foreground mx-auto max-w-2xl text-sm md:text-base'>
          上传 10–30 秒参考音频，即可生成专属克隆音色。无需录音棚，无需专业设备，
          用一段清晰的手机录音，就能为视频解说、广告配音、有声内容带来真实人声。
        </p>
      </div>

      {/* 装饰波形 */}
      <div className='pointer-events-none absolute inset-x-0 bottom-0 z-0 h-24 opacity-50'>
        <WaveformDecor />
      </div>
    </div>
  );
}

/** 装饰性波形（暗色风格，金色高亮，5 段逐个涨幅错开） */
export function WaveformDecor() {
  const bars = Array.from({ length: 64 }).map((_, i) => {
    // 平滑的 sine 风格高低 + 一些抖动
    const t = i / 64;
    const base = 24 + Math.sin(t * Math.PI * 3.2) * 28 + Math.sin(t * Math.PI * 11) * 10;
    return Math.max(8, Math.min(56, base));
  });
  return (
    <svg
      viewBox='0 0 640 96'
      preserveAspectRatio='none'
      className='text-foreground/30 h-full w-full'
      aria-hidden
    >
      {bars.map((h, i) => {
        const x = (i / 64) * 640 + 1;
        const y = (96 - h) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={6}
            height={h}
            rx={2}
            className='fill-current'
            opacity={0.55 + (i % 5) * 0.06}
          />
        );
      })}
    </svg>
  );
}
