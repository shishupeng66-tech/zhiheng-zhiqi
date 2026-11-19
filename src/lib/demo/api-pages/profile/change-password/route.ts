import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, SESSION_COOKIE } from '@/lib/auth';
import { findUserById, updatePassword } from '@/services/users';
import { verifyPassword } from '@/lib/auth/password';
import { deleteOtherUserSessions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!current || next.length < 6) {
    return NextResponse.json(
      { error: 'validation', message: '请填写当前密码，且新密码至少 6 位' },
      { status: 400 }
    );
  }

  const dbUser = await findUserById(user.id);
  if (!dbUser) {
    return NextResponse.json({ error: 'not_found', message: '账号不存在' }, { status: 404 });
  }

  const ok = await verifyPassword(current, dbUser.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: 'invalid_current', message: '当前密码错误' },
      { status: 400 }
    );
  }

  await updatePassword(user.id, next);
  await deleteOtherUserSessions(user.id, request.cookies.get(SESSION_COOKIE)?.value);

  return NextResponse.json({ ok: true, redirectTo: '/dashboard' });
}
