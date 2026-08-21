import { NextResponse } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * 将服务层抛出的业务错误统一映射为 HTTP 响应。仅在 Route Handler 中调用。
 * - ForbiddenError → 403
 * - NotFoundError → 404
 * - ConflictError → 409（error 字段携带冲突 code）
 * - ValidationError → 400
 * - 未知错误 → 500（不泄露内部堆栈）
 */
export function serviceErrorResponse(e: unknown): NextResponse {
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: 'forbidden', message: e.message }, { status: 403 });
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json({ error: 'not_found', message: e.message }, { status: 404 });
  }
  if (e instanceof ConflictError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: 409 });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: 'validation', message: e.message }, { status: 400 });
  }
  const message = e instanceof Error ? e.message : '服务器内部错误';
  return NextResponse.json({ error: 'internal', message }, { status: 500 });
}
