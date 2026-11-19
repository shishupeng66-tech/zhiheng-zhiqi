import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { selectDirectory, isLocalHost } from '@/lib/storage/directory-picker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/system/storage/select-directory
 * 弹起 Windows 原生文件夹选择器，返回用户选择的真实绝对路径。
 *
 * 安全：
 * - super_admin 权限校验（否则 403）
 * - 仅本机回环地址可调用（否则 403）—— 防远程发起弹窗
 * - 服务端固定 PowerShell 脚本，不接受任何前端 shell 命令 / 路径拼接
 *
 * 返回：
 *   { ok: true,  path: "D:\\企业资料\\客户资料" }        —— 已选择
 *   { ok: false, cancelled: true }                        —— 用户取消（不报错，不清空原路径）
 *   { ok: false, error: "..." }                           —— 桥接失败
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== 'super_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 仅本机可调用
  const host = request.headers.get('host') ?? '';
  const remoteIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '';
  if (!isLocalHost(host) && remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
    return NextResponse.json({ error: 'local_only' }, { status: 403 });
  }

  const result = await selectDirectory();
  if (result.ok) {
    return NextResponse.json({ ok: true, path: result.path });
  }
  if (result.cancelled) {
    return NextResponse.json({ ok: false, cancelled: true });
  }
  return NextResponse.json({ ok: false, error: result.error ?? '目录选择失败' }, { status: 500 });
}
