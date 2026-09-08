import { NextResponse } from 'next/server';

/** 桌面健康探针（Electron 主进程启动等待用）。 */
export function GET() {
  return NextResponse.json({ ok: true, service: 'zhiheng-next-production', ts: Date.now() });
}
