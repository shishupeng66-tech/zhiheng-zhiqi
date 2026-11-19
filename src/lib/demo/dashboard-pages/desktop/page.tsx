'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icons } from '@/components/icons';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------
interface DoctorItem {
  key: string;
  label: string;
  status: 'READY' | 'WARNING' | 'ERROR' | 'NOT_REQUIRED';
  detail: string;
  raw?: unknown;
}

interface DoctorData {
  ok: boolean;
  overall: string;
  items: DoctorItem[];
  env?: Record<string, string>;
}

interface SelfTestResult {
  key: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

interface SelfTestData {
  overall: string;
  ready: boolean;
  results: SelfTestResult[];
}

interface JianyingInfo {
  status: string;
  installRoot: string | null;
  primaryVersion: string | null;
  primaryVerified: boolean;
  videoeditorDll: string | null;
  userDataRoot: string | null;
  draftRoot: string | null;
  cacheRoot: string | null;
  verifiedProfile: string;
  note: string;
}

interface AppInfo {
  appVersion?: string;
  versions?: { electron?: string; node?: string; chrome?: string };
  runtimeManifest?: { appVersion?: string; pjdCommit?: string };
  workerExe?: string;
  dataRoot?: string;
  skillCurrent?: string;
  skillDefault?: string;
  jianying?: JianyingInfo;
  paths?: { logs?: string; data?: string; config?: string; diagnostics?: string };
}

// ---------------------------------------------------------------------------
// 状态中文化
// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<string, string> = {
  READY: '正常',
  PASS: '通过',
  WARNING: '警告',
  WARN: '警告',
  ERROR: '异常',
  FAIL: '失败',
  NOT_REQUIRED: '无需安装'
};

const STATUS_COLOR: Record<string, string> = {
  READY: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PASS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  WARN: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ERROR: 'bg-red-500/15 text-red-400 border-red-500/30',
  FAIL: 'bg-red-500/15 text-red-400 border-red-500/30',
  NOT_REQUIRED: 'bg-slate-500/15 text-slate-400 border-slate-500/30'
};

function statusBadge(s: string) {
  return (
    <Badge variant='outline' className={STATUS_COLOR[s] ?? 'bg-slate-500/15 text-slate-400'}>
      {STATUS_LABEL[s] ?? s}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// 按区域分组 Doctor items
// ---------------------------------------------------------------------------
const LOCAL_RUNTIME_KEYS = [
  'app_runtime',
  'next_runtime',
  'worker',
  'pjd',
  'editing_skill',
  'database',
  'data_root'
];
const BUSINESS_KEYS = ['llm_api', 'tts_api'];
const NOT_REQUIRED_KEYS = ['github', 'git', 'npm_registry', 'pypi', 'ffmpeg'];
// 计入总体验收的关键项（NOT_REQUIRED 不计入）
const CRITICAL_KEYS = [
  'app_runtime',
  'next_runtime',
  'worker',
  'pjd',
  'editing_skill',
  'database',
  'data_root',
  'llm_api',
  'tts_api'
];

function groupItems(items: DoctorItem[]) {
  const local = items.filter((i) => LOCAL_RUNTIME_KEYS.includes(i.key));
  const business = items.filter((i) => BUSINESS_KEYS.includes(i.key));
  const notRequired = items.filter((i) => NOT_REQUIRED_KEYS.includes(i.key));
  return { local, business, notRequired };
}

// ---------------------------------------------------------------------------
// 总体验收状态
// ---------------------------------------------------------------------------
type OverallVerdict = 'READY' | 'WARNING' | 'ERROR';

function computeOverall(
  doctor: DoctorData | null,
  jy: JianyingInfo | null
): {
  verdict: OverallVerdict;
  warnings: string[];
  errors: string[];
} {
  if (!doctor) return { verdict: 'ERROR', warnings: [], errors: ['环境诊断数据加载中'] };
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const item of doctor.items) {
    if (!CRITICAL_KEYS.includes(item.key)) continue;
    if (item.status === 'ERROR') errors.push(`${item.label}：${item.detail.slice(0, 60)}`);
    else if (item.status === 'WARNING') warnings.push(`${item.label}：${item.detail.slice(0, 60)}`);
  }
  // 剪映状态（来自 info.jianying，不在 doctor items 中）
  if (jy) {
    if (jy.status === 'READY') {
      // ok
    } else if (jy.status === 'UNVERIFIED_VERSION') {
      warnings.push(
        `剪映版本未验证：${jy.primaryVersion || '未知'}（VERIFIED=${jy.verifiedProfile}）`
      );
    } else if (jy.status === 'NOT_FOUND') {
      errors.push('剪映未检测到');
    } else {
      errors.push(`剪映状态异常：${jy.status}`);
    }
  } else {
    warnings.push('剪映信息未加载（桌面主进程未连接）');
  }
  if (errors.length > 0) return { verdict: 'ERROR', warnings, errors };
  if (warnings.length > 0) return { verdict: 'WARNING', warnings, errors };
  return { verdict: 'READY', warnings: [], errors: [] };
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------
function CheckRow({ item }: { item: DoctorItem }) {
  return (
    <div className='flex items-start justify-between gap-4 rounded-lg border p-3 text-sm'>
      <div className='min-w-0 flex-1'>
        <div className='font-medium'>{item.label}</div>
        <div className='mt-1 break-all font-mono text-xs text-muted-foreground'>{item.detail}</div>
      </div>
      {statusBadge(item.status)}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = true
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className='flex items-start justify-between gap-4 rounded-lg border p-3 text-sm'>
      <div className='font-medium'>{label}</div>
      <div
        className={`text-right text-xs text-muted-foreground ${mono ? 'font-mono break-all' : ''}`}
      >
        {value || '—'}
      </div>
    </div>
  );
}

// ---- TTS 自定义行：区分本地桥和实际业务服务 ----
function TtsRow({ item }: { item: DoctorItem }) {
  const raw = (item.raw as { bridgeUrl?: string; provider?: string; ok?: boolean }) || {};
  return (
    <div className='rounded-lg border p-3 text-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='font-medium'>{item.label}</div>
          <div className='mt-1 space-y-0.5 text-xs text-muted-foreground'>
            <div>调用方式：桌面桥接 → 豆包 TTS</div>
            <div className='font-mono break-all'>本地桥：{raw.bridgeUrl || '—'}</div>
            <div>Provider：{raw.provider || 'Doubao / Volcengine'}</div>
          </div>
        </div>
        {statusBadge(item.status)}
      </div>
    </div>
  );
}

// ---- Editing Skill 自定义行：显示加载来源 + 热更新提示 ----
function SkillRow({ item }: { item: DoctorItem }) {
  const raw = (item.raw as { path?: string; source?: string; count?: number }) || {};
  const isExternal = raw.source === 'EXTERNAL_CURRENT';
  return (
    <div className='rounded-lg border p-3 text-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='font-medium'>{item.label}</div>
          <div className='mt-1 space-y-0.5 text-xs text-muted-foreground'>
            <div>
              当前加载来源：
              <span className={isExternal ? 'text-amber-400' : 'text-emerald-400'}>
                {isExternal ? '外置热更新版' : '内置默认版'}
              </span>
            </div>
            <div className='font-mono break-all'>实际路径：{raw.path || item.detail}</div>
            {typeof raw.count === 'number' && <div>技能定义：{raw.count} 个</div>}
          </div>
        </div>
        {statusBadge(item.status)}
      </div>
      <div className='mt-2 border-t pt-2 text-xs text-muted-foreground'>
        {isExternal
          ? '修改外置 current Skill 后，下一次剪辑任务直接生效，无需重新安装软件。'
          : '当前使用安装包内置 Skill；可在外置 current 目录创建覆盖版本进行现场调试。'}
      </div>
    </div>
  );
}

// ---- 总体验收状态卡 ----
function OverallCard({
  verdict,
  warnings,
  errors
}: {
  verdict: OverallVerdict;
  warnings: string[];
  errors: string[];
}) {
  const config = {
    READY: {
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-500/5',
      icon: <Icons.check className='h-5 w-5 text-emerald-400' />,
      title: '当前电脑已满足知衡智企自动剪辑运行条件',
      subtitle: '可以开始现场剪辑测试。',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    },
    WARNING: {
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/5',
      icon: <Icons.warning className='h-5 w-5 text-amber-400' />,
      title: '运行环境基本可用，但有警告',
      subtitle: '以下项目建议确认，但不阻塞基本剪辑：',
      badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    },
    ERROR: {
      border: 'border-red-500/40',
      bg: 'bg-red-500/5',
      icon: <Icons.close className='h-5 w-5 text-red-400' />,
      title: '当前电脑暂不满足自动剪辑运行条件',
      subtitle: '以下项目需要处理：',
      badge: 'bg-red-500/15 text-red-400 border-red-500/30'
    }
  }[verdict];

  return (
    <Card className={`border-l-4 ${config.border} ${config.bg}`}>
      <CardContent className='flex items-start gap-4 pt-5'>
        <div className='mt-0.5 shrink-0'>{config.icon}</div>
        <div className='min-w-0 flex-1 space-y-2'>
          <div className='flex items-center gap-3'>
            <span className='text-base font-semibold'>{config.title}</span>
            <Badge variant='outline' className={config.badge}>
              {verdict === 'READY' ? '正常' : verdict === 'WARNING' ? '警告' : '异常'}
            </Badge>
          </div>
          <p className='text-sm text-muted-foreground'>{config.subtitle}</p>
          {verdict === 'WARNING' && warnings.length > 0 && (
            <ul className='list-inside list-disc space-y-1 text-xs text-amber-300/90'>
              {warnings.slice(0, 3).map((w, i) => (
                <li key={i} className='break-all'>
                  {w}
                </li>
              ))}
            </ul>
          )}
          {verdict === 'ERROR' && errors.length > 0 && (
            <ul className='list-inside list-disc space-y-1 text-xs text-red-300/90'>
              {errors.slice(0, 3).map((e, i) => (
                <li key={i} className='break-all'>
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DesktopDiagnosticsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [selftest, setSelftest] = useState<SelfTestData | null>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [golden, setGolden] = useState<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // 首次初始化表单（高级功能）
  const [adminForm, setAdminForm] = useState({
    username: 'admin',
    password: '',
    name: '系统管理员',
    materialRoot: '',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: ''
  });
  const [initResult, setInitResult] = useState<any>(null);
  const [tts, setTts] = useState<any>(null);
  const [ttsForm, setTtsForm] = useState<Record<string, string>>({});

  const push = useCallback((m: string) => {
    setLog((prev) => [...prev.slice(-200), m]);
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      // @ts-expect-error preload
      const d = await window.desktop?.getInfo?.();
      setInfo(d || null);
    } catch {
      setInfo(null);
    }
  }, []);

  const loadDoctor = useCallback(async () => {
    setBusy('doctor');
    try {
      const res = await fetch('/api/desktop/runtime');
      const data = (await res.json()) as DoctorData;
      setDoctor(data);
    } catch {
      setDoctor({ ok: false, overall: 'ERROR', items: [] });
    } finally {
      setBusy('');
    }
  }, []);

  const loadTts = useCallback(async () => {
    try {
      // @ts-expect-error preload
      const d = await window.desktop?.getTtsConfig?.();
      setTts(d || null);
      setTtsForm({
        doubaoSpeechApiKey: '',
        doubaoSpeechResourceId: d?.doubaoSpeechResourceId || '',
        doubaoSpeechWsEndpoint: d?.doubaoSpeechWsEndpoint || '',
        doubaoSpeechDefaultVoice: d?.doubaoSpeechDefaultVoice || '',
        doubaoSpeechUserId: d?.doubaoSpeechUserId || ''
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadInfo();
    loadDoctor();
    loadTts();
  }, [loadInfo, loadDoctor, loadTts]);

  // ---- 操作 ----
  const runSelfTest = async () => {
    setBusy('selftest');
    setSelftest(null);
    try {
      const res = await fetch('/api/desktop/selftest', { method: 'POST' });
      const data = (await res.json()) as SelfTestData;
      setSelftest(data);
    } catch (err) {
      setSelftest({
        overall: 'FAIL',
        ready: false,
        results: [
          { key: 'request', label: '自检请求', status: 'FAIL', detail: (err as Error).message }
        ]
      });
    } finally {
      setBusy('');
    }
  };

  const exportDiagnostics = async () => {
    setBusy('diagnostics');
    try {
      const res = await fetch('/api/desktop/diagnostics', { method: 'POST' });
      const data = await res.json();
      setDiagnostic(data);
      if (data.ok) {
        // @ts-expect-error preload
        await window.desktop?.openPath?.(data.zipPath);
      }
    } catch (err) {
      setDiagnostic({ ok: false, error: (err as Error).message });
    } finally {
      setBusy('');
    }
  };

  const runGolden = async () => {
    setBusy('golden');
    setGolden(null);
    setLog([]);
    push('提交黄金链路测试…');
    try {
      const res = await fetch('/api/desktop/golden-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assembly: true })
      });
      const data = await res.json();
      setGolden(data);
      if (Array.isArray(data.log)) setLog((prev) => [...prev, ...data.log]);
    } catch (err) {
      push(`请求失败: ${(err as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const chooseMaterialDir = async () => {
    // @ts-expect-error preload
    const r = await window.desktop?.chooseMaterialDir?.();
    if (r?.ok) setAdminForm((f) => ({ ...f, materialRoot: r.path }));
  };

  const runInit = async () => {
    setBusy('init');
    try {
      const body = {
        username: adminForm.username,
        password: adminForm.password,
        name: adminForm.name,
        materialRoot: adminForm.materialRoot,
        llmConfig:
          adminForm.llmBaseUrl && adminForm.llmApiKey && adminForm.llmModel
            ? {
                baseUrl: adminForm.llmBaseUrl,
                apiKey: adminForm.llmApiKey,
                model: adminForm.llmModel
              }
            : undefined
      };
      const res = await fetch('/api/desktop/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setInitResult(data);
      if (data.ok) {
        push('首次初始化完成');
        await loadDoctor();
      }
    } catch (err) {
      setInitResult({ ok: false, error: (err as Error).message });
    } finally {
      setBusy('');
    }
  };

  const saveTts = async () => {
    setBusy('tts');
    try {
      // @ts-expect-error preload
      const r = await window.desktop?.setTtsConfig?.(ttsForm);
      push(`TTS 配置保存 ${r?.ok ? 'OK' : 'FAILED'}`);
      await loadTts();
    } finally {
      setBusy('');
    }
  };

  // ---- 派生数据 ----
  const { local, business, notRequired } = doctor
    ? groupItems(doctor.items)
    : { local: [], business: [], notRequired: [] };
  const jy = info?.jianying;
  const selfTestFailCount = selftest
    ? selftest.results.filter((r) => r.status === 'FAIL').length
    : 0;
  const selfTestWarnCount = selftest
    ? selftest.results.filter((r) => r.status === 'WARN').length
    : 0;
  const overall = computeOverall(doctor, jy ?? null);

  return (
    <div className='container mx-auto max-w-5xl space-y-6 p-6'>
      {/* 页头 */}
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>环境诊断</h1>
          <p className='mt-1 text-sm text-muted-foreground'>检查剪映、运行环境和业务服务状态</p>
        </div>
        <Badge variant='outline' className='border-indigo-500/30 bg-indigo-500/10 text-indigo-400'>
          {info?.runtimeManifest?.appVersion || info?.appVersion || 'desktop'}
        </Badge>
      </div>

      {/* 操作栏 */}
      <div className='flex flex-wrap items-center gap-3'>
        <Button onClick={runSelfTest} disabled={busy === 'selftest'}>
          {busy === 'selftest' ? (
            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Icons.activity className='mr-2 h-4 w-4' />
          )}
          运行环境自检
        </Button>
        <Button onClick={exportDiagnostics} disabled={busy === 'diagnostics'} variant='outline'>
          {busy === 'diagnostics' ? (
            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Icons.download className='mr-2 h-4 w-4' />
          )}
          导出诊断包
        </Button>
        <Button onClick={loadDoctor} disabled={busy === 'doctor'} variant='ghost' size='sm'>
          <Icons.refresh className='mr-2 h-4 w-4' />
          刷新
        </Button>
        {doctor && (
          <div className='ml-auto flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground'>总体状态</span>
            {statusBadge(doctor.overall)}
          </div>
        )}
      </div>

      {/* 总体验收状态 */}
      {doctor && (
        <OverallCard
          verdict={overall.verdict}
          warnings={overall.warnings}
          errors={overall.errors}
        />
      )}

      {/* 自检结果 */}
      {selftest && (
        <Card className='border-l-4 border-l-emerald-500'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Icons.check className='h-4 w-4 text-emerald-400' />
              运行环境自检结果
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-center gap-3'>
              {selftest.ready ? (
                <Badge
                  variant='outline'
                  className='bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                >
                  运行环境正常
                </Badge>
              ) : (
                <Badge variant='outline' className='bg-red-500/15 text-red-400 border-red-500/30'>
                  发现 {selfTestFailCount} 个问题
                  {selfTestWarnCount > 0 ? `，${selfTestWarnCount} 个警告` : ''}
                </Badge>
              )}
              <span className='text-xs text-muted-foreground'>
                共 {selftest.results.length} 项检查
              </span>
            </div>
            <div className='space-y-2'>
              {selftest.results.map((r) => (
                <div
                  key={r.key}
                  className='flex items-start justify-between gap-4 rounded-lg border p-3 text-sm'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='font-medium'>{r.label}</div>
                    {(r.status === 'FAIL' || r.status === 'WARN') && (
                      <div className='mt-1 break-all font-mono text-xs text-red-400'>
                        {r.detail}
                      </div>
                    )}
                    {r.status === 'PASS' && (
                      <div className='mt-1 break-all font-mono text-xs text-muted-foreground'>
                        {r.detail}
                      </div>
                    )}
                  </div>
                  {statusBadge(r.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 诊断包导出结果 */}
      {diagnostic && (
        <Card>
          <CardContent className='pt-4 font-mono text-xs'>
            {diagnostic.ok ? (
              <div className='space-y-1'>
                <div className='text-emerald-400'>诊断包已生成</div>
                <div>
                  {diagnostic.fileName}（{Math.round(diagnostic.size / 1024)} KB）
                </div>
                <div className='text-muted-foreground'>{diagnostic.zipPath}</div>
              </div>
            ) : (
              <div className='text-red-400'>导出失败: {diagnostic.error}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 本地运行环境 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>本地运行环境</CardTitle>
          <CardDescription>
            程序自带的自包含运行时，客户机无需安装 Node / Python / Git
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {local.map((item) =>
            item.key === 'editing_skill' ? (
              <SkillRow key={item.key} item={item} />
            ) : (
              <CheckRow key={item.key} item={item} />
            )
          )}
          {!doctor && <div className='text-sm text-muted-foreground'>加载中…</div>}
        </CardContent>
      </Card>

      {/* 剪映环境 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>剪映环境</CardTitle>
          <CardDescription>自动检测客户机已安装的剪映，不重新分发剪映内部二进制</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {jy ? (
            <>
              <div className='flex items-start justify-between gap-4 rounded-lg border p-3 text-sm'>
                <div className='font-medium'>剪映状态</div>
                <div className='flex items-center gap-2'>
                  {statusBadge(
                    jy.status === 'READY'
                      ? 'READY'
                      : jy.status === 'UNVERIFIED_VERSION'
                        ? 'WARNING'
                        : 'ERROR'
                  )}
                  <span className='text-xs text-muted-foreground'>{jy.note}</span>
                </div>
              </div>
              <InfoRow label='剪映版本' value={jy.primaryVersion} mono={false} />
              <InfoRow label='VERIFIED 版本' value={jy.verifiedProfile} mono={false} />
              <InfoRow label='安装路径' value={jy.installRoot} />
              <InfoRow label='草稿目录' value={jy.draftRoot} />
              <InfoRow label='Cache 目录' value={jy.cacheRoot} />
              <InfoRow label='videoeditor.dll' value={jy.videoeditorDll} />
            </>
          ) : (
            <div className='text-sm text-muted-foreground'>未检测到剪映（桌面主进程未连接）</div>
          )}
        </CardContent>
      </Card>

      {/* 业务服务 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>业务服务</CardTitle>
          <CardDescription>
            LLM / TTS 为外部业务 API，凭据存于本机安全存储，不写入安装包
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {business.map((item) =>
            item.key === 'tts_api' ? (
              <TtsRow key={item.key} item={item} />
            ) : (
              <CheckRow key={item.key} item={item} />
            )
          )}
        </CardContent>
      </Card>

      {/* 无需安装 */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>无需安装</CardTitle>
          <CardDescription>以下依赖在客户运行时已全部剔除，安装包自包含</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-2 md:grid-cols-2'>
          {notRequired.map((item) => (
            <CheckRow key={item.key} item={item} />
          ))}
          {/* 补充 Node / Bun / Python（runtime 接口未单独列，这里明确标注） */}
          <CheckRow
            item={{
              key: 'node',
              label: 'Node.js（系统级）',
              status: 'NOT_REQUIRED',
              detail: 'Electron 内置 Node Runtime，客户机无需系统 Node'
            }}
          />
          <CheckRow
            item={{
              key: 'bun',
              label: 'Bun',
              status: 'NOT_REQUIRED',
              detail: '仅开发构建期使用，客户运行时不依赖'
            }}
          />
          <CheckRow
            item={{
              key: 'python',
              label: 'Python（系统级）',
              status: 'NOT_REQUIRED',
              detail: 'Worker 已打包为自包含 EXE（PyInstaller），客户机无需 Python'
            }}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* 高级功能（折叠） */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className='flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'>
          <span>高级功能（黄金链路 / 首次初始化 / TTS 配置）</span>
          <Icons.chevronDown
            className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-4 pt-4'>
          {/* 黄金链路 */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>黄金链路测试</CardTitle>
              <CardDescription>
                固定 7 句饮料文案，验证 Agent-native Editing 全链路（约 1-3 分钟）
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center gap-3'>
                <Button onClick={runGolden} disabled={busy === 'golden'}>
                  {busy === 'golden' ? (
                    <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Icons.play className='mr-2 h-4 w-4' />
                  )}
                  运行固定黄金脚本（饮料 7 句）
                </Button>
                {golden && (
                  <Badge
                    variant='outline'
                    className={
                      golden.ok
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/15 text-red-400 border-red-500/30'
                    }
                  >
                    {golden.ok ? '通过' : '失败'}
                  </Badge>
                )}
              </div>
              {golden && (
                <div className='space-y-1 rounded-lg border p-3 font-mono text-xs'>
                  <div>
                    stage={golden.stage} taskId={golden.taskId}
                  </div>
                  <div>
                    字幕={golden.timelineStats?.subtitleTrack} 包装=
                    {golden.timelineStats?.textOverlayTrack}
                  </div>
                  {golden.assembly && (
                    <div>
                      草稿={golden.assembly.draftName} 时长={golden.assembly.duration}s
                    </div>
                  )}
                  {golden.assembly?.draftPath && (
                    <div className='break-all'>{golden.assembly.draftPath}</div>
                  )}
                  {golden.error && <div className='text-red-400'>{golden.error}</div>}
                </div>
              )}
              <pre className='max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed'>
                {log.length ? log.join('\n') : '等待运行…'}
              </pre>
            </CardContent>
          </Card>

          {/* 首次初始化 */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>首次初始化</CardTitle>
              <CardDescription>
                创建超级管理员 + 种子工作空间 + 配置素材根目录（幂等，可重复执行）
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>管理员用户名</Label>
                  <Input
                    value={adminForm.username}
                    onChange={(e) => setAdminForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>初始密码（≥8 位）</Label>
                  <Input
                    type='password'
                    value={adminForm.password}
                    onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>姓名</Label>
                  <Input
                    value={adminForm.name}
                    onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>素材根目录</Label>
                  <div className='flex gap-2'>
                    <Input
                      value={adminForm.materialRoot}
                      onChange={(e) =>
                        setAdminForm((f) => ({ ...f, materialRoot: e.target.value }))
                      }
                      placeholder='例如 D:\客户项目\素材'
                    />
                    <Button variant='outline' onClick={chooseMaterialDir}>
                      选择…
                    </Button>
                  </div>
                </div>
                <div className='space-y-2'>
                  <Label>LLM Base URL</Label>
                  <Input
                    value={adminForm.llmBaseUrl}
                    onChange={(e) => setAdminForm((f) => ({ ...f, llmBaseUrl: e.target.value }))}
                    placeholder='留空则跳过'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>LLM API Key</Label>
                  <Input
                    type='password'
                    value={adminForm.llmApiKey}
                    onChange={(e) => setAdminForm((f) => ({ ...f, llmApiKey: e.target.value }))}
                    placeholder='留空则跳过'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>LLM 模型</Label>
                  <Input
                    value={adminForm.llmModel}
                    onChange={(e) => setAdminForm((f) => ({ ...f, llmModel: e.target.value }))}
                  />
                </div>
              </div>
              <Button onClick={runInit} disabled={busy === 'init'}>
                执行首次初始化
              </Button>
              {initResult && (
                <div className='space-y-1 rounded-lg border p-3 font-mono text-xs'>
                  <div>ok={String(initResult.ok)}</div>
                  {initResult.steps?.map((s: { key: string; ok: boolean; detail: string }) => (
                    <div key={s.key} className={s.ok ? 'text-emerald-400' : 'text-red-400'}>
                      {s.ok ? '✓' : '✗'} {s.key}: {s.detail}
                    </div>
                  ))}
                  {initResult.error && <div className='text-red-400'>{initResult.error}</div>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* TTS 配置 */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>TTS 业务 API 配置</CardTitle>
              <CardDescription>
                凭据经 Windows safeStorage（DPAPI）加密存储，不写入安装包 / 日志
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>API Key {tts?.hasApiKey ? '（已配置）' : '（未配置）'}</Label>
                  <Input
                    type='password'
                    value={ttsForm.doubaoSpeechApiKey || ''}
                    onChange={(e) =>
                      setTtsForm((f) => ({ ...f, doubaoSpeechApiKey: e.target.value }))
                    }
                    placeholder='仅修改时填写'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Resource ID</Label>
                  <Input
                    value={ttsForm.doubaoSpeechResourceId || ''}
                    onChange={(e) =>
                      setTtsForm((f) => ({ ...f, doubaoSpeechResourceId: e.target.value }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>WS Endpoint</Label>
                  <Input
                    value={ttsForm.doubaoSpeechWsEndpoint || ''}
                    onChange={(e) =>
                      setTtsForm((f) => ({ ...f, doubaoSpeechWsEndpoint: e.target.value }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>默认音色</Label>
                  <Input
                    value={ttsForm.doubaoSpeechDefaultVoice || ''}
                    onChange={(e) =>
                      setTtsForm((f) => ({ ...f, doubaoSpeechDefaultVoice: e.target.value }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>User ID</Label>
                  <Input
                    value={ttsForm.doubaoSpeechUserId || ''}
                    onChange={(e) =>
                      setTtsForm((f) => ({ ...f, doubaoSpeechUserId: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button onClick={saveTts} disabled={busy === 'tts'}>
                保存 TTS 配置
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Separator />
      <p className='text-xs text-muted-foreground'>
        运行数据目录：{info?.dataRoot || '—'} · 日志：{info?.paths?.logs || '—'} · 诊断包：
        {info?.paths?.diagnostics || '—'}
      </p>
    </div>
  );
}
