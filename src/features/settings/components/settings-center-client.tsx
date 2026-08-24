'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { SettingModule } from '@/lib/db/schema';
import type {
  ProviderProfileOutput,
  ProviderConfigInput,
  SettingFieldInput
} from '@/lib/settings/types';
import type { TestResult } from '@/lib/settings/test';

interface EditableField extends SettingFieldInput {
  displayValue?: string | null;
}
interface EditableProvider extends Omit<ProviderConfigInput, 'fields'> {
  fields: EditableField[];
}

const MODULES: SettingModule[] = ['llm', 'voice', 'material', 'video_engine'];
const MODULE_LABELS: Record<SettingModule, string> = {
  llm: '大模型',
  voice: '语音服务',
  material: '素材服务',
  video_engine: '视频引擎'
};

const FIELD_LABELS: Record<string, string> = {
  base_url: 'Base URL',
  api_key: 'API Key',
  model: '模型 (Model)',
  output_dir: '输出目录',
  default_material_source: '默认素材来源',
  concurrency: '并发数',
  DOUBAO_SPEECH_API_KEY: 'API Key',
  DOUBAO_SPEECH_RESOURCE_ID: 'Resource ID',
  DOUBAO_SPEECH_WS_ENDPOINT: 'WS 端点',
  DOUBAO_SPEECH_DEFAULT_VOICE: '默认音色',
  DOUBAO_SPEECH_ENDPOINT: '单向端点',
  DOUBAO_SPEECH_APP_ID: 'App ID',
  DOUBAO_SPEECH_APP_KEY: 'App Key'
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function profilesToEditable(providers: ProviderProfileOutput[]): EditableProvider[] {
  return providers.map((p) => ({
    provider: p.provider,
    enabled: p.enabled,
    isDefault: p.isDefault,
    fields: p.fields.map((f) => ({
      key: f.key,
      value: f.isSecret ? '' : (f.value ?? ''),
      isSecret: f.isSecret,
      changed: false,
      displayValue: f.displayValue
    }))
  }));
}

function seedModule(module: SettingModule): EditableProvider[] {
  if (module === 'material') {
    return (['pexels', 'pixabay', 'coverr'] as const).map((provider, i) => ({
      provider,
      enabled: false,
      isDefault: i === 0,
      fields: [{ key: 'api_key', value: '', isSecret: true, changed: false }]
    }));
  }
  if (module === 'voice') {
    return [
      {
        provider: 'doubao',
        enabled: true,
        isDefault: true,
        fields: [
          { key: 'DOUBAO_SPEECH_API_KEY', value: '', isSecret: true, changed: false },
          {
            key: 'DOUBAO_SPEECH_RESOURCE_ID',
            value: 'seed-tts-2.0',
            isSecret: false,
            changed: false
          },
          { key: 'DOUBAO_SPEECH_WS_ENDPOINT', value: '', isSecret: false, changed: false },
          { key: 'DOUBAO_SPEECH_DEFAULT_VOICE', value: '', isSecret: false, changed: false }
        ]
      }
    ];
  }
  if (module === 'video_engine') {
    return [
      {
        provider: 'mpt',
        enabled: true,
        isDefault: true,
        fields: [
          { key: 'output_dir', value: '', isSecret: false, changed: false },
          { key: 'default_material_source', value: 'pexels', isSecret: false, changed: false },
          { key: 'concurrency', value: '2', isSecret: false, changed: false }
        ]
      }
    ];
  }
  return [
    {
      provider: 'openai-compatible',
      enabled: true,
      isDefault: true,
      fields: [
        { key: 'base_url', value: 'https://api.openai.com/v1', isSecret: false, changed: false },
        { key: 'api_key', value: '', isSecret: true, changed: false },
        { key: 'model', value: 'gpt-4o-mini', isSecret: false, changed: false }
      ]
    }
  ];
}

export default function SettingsCenterClient() {
  const [modules, setModules] = useState<Record<SettingModule, EditableProvider[]>>({
    llm: [],
    voice: [],
    material: [],
    video_engine: []
  });
  const [videoEngine, setVideoEngine] = useState<{
    mode: string;
    engineDir: string;
    cliExists: boolean;
    pythonAvailable: boolean;
    pythonVersion: string | null;
    outputDir: string | null;
    defaultMaterialSource: string | null;
    concurrency: number | null;
    configTomlPresent: boolean;
    notes: string[];
  } | null>(null);
  const [tab, setTab] = useState<SettingModule>('llm');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testState, setTestState] = useState<
    Record<string, { running: boolean; result?: TestResult }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/settings', { cache: 'no-store' });
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      const next = {} as Record<SettingModule, EditableProvider[]>;
      for (const m of MODULES) {
        const providers: ProviderProfileOutput[] = data.modules?.[m] ?? [];
        next[m] = providers.length > 0 ? profilesToEditable(providers) : seedModule(m);
      }
      setModules(next);
      setVideoEngine(data.videoEngine ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setFieldValue = useCallback(
    (module: SettingModule, pi: number, fi: number, value: string) => {
      setModules((prev) => ({
        ...prev,
        [module]: prev[module].map((p, i) =>
          i !== pi
            ? p
            : {
                ...p,
                fields: p.fields.map((f, j) =>
                  j !== fi ? f : { ...f, value, changed: f.isSecret ? true : f.changed }
                )
              }
        )
      }));
    },
    []
  );

  const toggleEnabled = useCallback((module: SettingModule, pi: number, enabled: boolean) => {
    setModules((prev) => ({
      ...prev,
      [module]: prev[module].map((p, i) => (i !== pi ? p : { ...p, enabled }))
    }));
  }, []);

  const setDefault = useCallback((module: SettingModule, pi: number) => {
    setModules((prev) => ({
      ...prev,
      [module]: prev[module].map((p, i) => ({ ...p, isDefault: i === pi }))
    }));
  }, []);

  const saveModule = useCallback(
    async (module: SettingModule) => {
      setSaving((s) => ({ ...s, [module]: true }));
      try {
        const providers = modules[module].map((p) => ({
          provider: p.provider,
          enabled: p.enabled,
          isDefault: p.isDefault,
          fields: p.fields.map((f) => ({
            key: f.key,
            value: f.value || null,
            isSecret: f.isSecret,
            changed: f.changed
          }))
        }));
        const res = await fetch(`/api/system/settings/${module}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(providers)
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || '保存失败');
        }
        const data = (await res.json()) as ProviderProfileOutput[];
        setModules((prev) => ({ ...prev, [module]: profilesToEditable(data) }));
        toast.success('已保存');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSaving((s) => ({ ...s, [module]: false }));
      }
    },
    [modules]
  );

  const testModule = useCallback(
    async (module: SettingModule) => {
      setTestState((s) => ({ ...s, [module]: { running: true } }));
      try {
        const body: Record<string, unknown> = { action: 'test', module };
        if (module === 'llm') {
          const p = modules.llm[0];
          const get = (k: string) => p?.fields.find((f) => f.key === k)?.value ?? '';
          body.config = {
            provider: p?.provider,
            baseUrl: get('base_url'),
            apiKey: get('api_key'),
            model: get('model')
          };
        } else if (module === 'material') {
          const p = modules.material.find((x) => x.isDefault) ?? modules.material[0];
          body.provider = p?.provider ?? '';
          body.apiKey = p?.fields.find((f) => f.key === 'api_key')?.value ?? '';
        }
        const res = await fetch('/api/system/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = (await res.json()) as TestResult;
        setTestState((s) => ({ ...s, [module]: { running: false, result: data } }));
        if (data.ok) toast.success(`测试通过：${data.message}（${data.latencyMs}ms）`);
        else toast.error(`测试失败：${data.message}`);
      } catch (e) {
        setTestState((s) => ({
          ...s,
          [module]: { running: false, result: { ok: false, message: String(e), latencyMs: 0 } }
        }));
        toast.error('测试请求异常');
      }
    },
    [modules]
  );

  if (loading) {
    return <div className='p-6 text-sm text-muted-foreground'>加载中…</div>;
  }

  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold'>模型与接口设置</h1>
        <p className='text-sm text-muted-foreground'>
          统一管理知衡智企所有外部能力（大模型 / 语音 / 素材 /
          视频引擎）的配置入口。仅超级管理员可访问； secret 类密钥加密存储，列表中始终脱敏展示。
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingModule)}>
        <TabsList>
          {MODULES.map((m) => (
            <TabsTrigger key={m} value={m}>
              {MODULE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>

        {MODULES.map((module) => (
          <TabsContent key={module} value={module} className='space-y-4'>
            {module === 'video_engine' && videoEngine ? (
              <Alert>
                <AlertTitle>视频引擎运行状态（只读）</AlertTitle>
                <AlertDescription className='space-y-1'>
                  <div>
                    运行模式：{videoEngine.mode.toUpperCase()} · 引擎目录：{videoEngine.engineDir}
                  </div>
                  <div>
                    CLI 脚本：{videoEngine.cliExists ? '存在' : '缺失'} · Python：
                    {videoEngine.pythonAvailable
                      ? (videoEngine.pythonVersion ?? '可用')
                      : '不可用'}{' '}
                    · config.toml：{videoEngine.configTomlPresent ? '存在' : '缺失'}
                  </div>
                  {videoEngine.notes.length > 0 && (
                    <div className='text-destructive/90'>提示：{videoEngine.notes.join('；')}</div>
                  )}
                  <div className='text-xs text-muted-foreground'>
                    视频生成仍走 CLI 主链（spawn python
                    cli.py），本页不改动主链；技术路径收纳于下方高级区。
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {modules[module].map((provider, pi) => (
              <Card key={provider.provider}>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <CardTitle className='text-base'>{provider.provider}</CardTitle>
                      {provider.isDefault ? <Badge>默认</Badge> : null}
                      {provider.enabled ? (
                        <Badge variant='secondary'>已启用</Badge>
                      ) : (
                        <Badge variant='outline'>已停用</Badge>
                      )}
                    </div>
                    <div className='flex items-center gap-4'>
                      <label className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <Switch
                          checked={provider.enabled}
                          onCheckedChange={(c) => toggleEnabled(module, pi, c)}
                        />
                        启用
                      </label>
                      <button
                        type='button'
                        className='text-sm text-primary hover:underline'
                        onClick={() => setDefault(module, pi)}
                      >
                        设为默认
                      </button>
                    </div>
                  </div>
                  <CardDescription>
                    {module === 'voice'
                      ? '豆包语音合成（WS V3）。保存后自动同步至 Voice Service 桥接文件。'
                      : module === 'llm'
                        ? 'OpenAI 兼容网关（OpenAI / DeepSeek / VolcEngine Ark 等仅需切换 Base URL 与模型）。'
                        : module === 'material'
                          ? '素材来源（Pexels / Pixabay / Coverr）。启用并设置 API Key 后作为视频素材来源。'
                          : 'MPT 视频引擎运行参数（CLI 模式）。'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {provider.fields.map((field, fi) => (
                    <div key={field.key} className='space-y-1.5'>
                      <Label className='text-sm'>{fieldLabel(field.key)}</Label>
                      <Input
                        type={field.isSecret ? 'password' : 'text'}
                        value={field.value ?? ''}
                        placeholder={
                          field.isSecret && !field.value
                            ? (field.displayValue ?? '未设置')
                            : undefined
                        }
                        autoComplete='off'
                        onChange={(e) => setFieldValue(module, pi, fi, e.target.value)}
                      />
                      {field.isSecret && field.displayValue ? (
                        <p className='text-xs text-muted-foreground'>
                          当前值已脱敏：{field.displayValue}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </CardContent>
                <CardFooter className='justify-between'>
                  <div>
                    {testState[module]?.result ? (
                      <span
                        className={
                          testState[module].result.ok
                            ? 'text-sm text-emerald-600 dark:text-emerald-400'
                            : 'text-sm text-destructive'
                        }
                      >
                        {testState[module].result.ok ? '✓ ' : '✗ '}
                        {testState[module].result.message}
                        {testState[module].result.latencyMs
                          ? `（${testState[module].result.latencyMs}ms）`
                          : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={testState[module]?.running}
                      onClick={() => testModule(module)}
                    >
                      {testState[module]?.running ? '测试中…' : '测试连接'}
                    </Button>
                    <Button size='sm' disabled={saving[module]} onClick={() => saveModule(module)}>
                      {saving[module] ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
