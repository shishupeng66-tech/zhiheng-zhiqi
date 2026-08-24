import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getDefaultProviderConfig } from './store';

/**
 * 视频引擎状态探测（只读，不改动 CLI 主链）。
 * MPT 通过 CLI 子进程（spawn python cli.py）运行，本模块仅读取运行时状态与统一设置中的少量参数。
 */
const ENGINE_DIR = path.resolve(process.cwd(), 'engines', 'moneyprinterturbo');

export interface VideoEngineStatus {
  mode: 'cli';
  engineDir: string;
  cliExists: boolean;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  outputDir: string | null;
  defaultMaterialSource: string | null;
  concurrency: number | null;
  configTomlPresent: boolean;
  notes: string[];
}

export async function getVideoEngineStatus(): Promise<VideoEngineStatus> {
  const notes: string[] = [];

  const cliExists = fs.existsSync(path.join(ENGINE_DIR, 'cli.py'));

  let pythonAvailable = false;
  let pythonVersion: string | null = null;
  try {
    const out = execFileSync(
      'python',
      ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'],
      { encoding: 'utf-8', timeout: 5000 }
    );
    pythonAvailable = true;
    pythonVersion = out.trim();
  } catch {
    try {
      const out = execFileSync(
        'python3',
        ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'],
        { encoding: 'utf-8', timeout: 5000 }
      );
      pythonAvailable = true;
      pythonVersion = out.trim();
    } catch {
      notes.push('未检测到 Python 运行时；视频生成需在引擎目录具备可执行的 python');
    }
  }

  const tomlPath = path.join(ENGINE_DIR, 'config.toml');
  const configTomlPresent = fs.existsSync(tomlPath);

  let defaultMaterialSource: string | null = null;
  let outputDir: string | null = null;
  let concurrency: number | null = null;
  try {
    const cfg = (await getDefaultProviderConfig('video_engine'))?.config ?? {};
    defaultMaterialSource = cfg['default_material_source'] ?? null;
    outputDir = cfg['output_dir'] ?? null;
    if (cfg['concurrency']) {
      const n = Number(cfg['concurrency']);
      concurrency = Number.isFinite(n) ? n : null;
    }
  } catch {
    notes.push('读取 video_engine 统一设置失败');
  }

  return {
    mode: 'cli',
    engineDir: ENGINE_DIR,
    cliExists,
    pythonAvailable,
    pythonVersion,
    outputDir,
    defaultMaterialSource,
    concurrency,
    configTomlPresent,
    notes
  };
}
