import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteCustomer, updateCustomer } from '@/lib/customers/local-store';
import type { UserMutationPayload } from '@/features/users/api/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as UserMutationPayload;
  const data = await updateCustomer(Number(id), body);
  return NextResponse.json(data, { status: data.success ? 200 : 404 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const data = await deleteCustomer(Number(id));
  return NextResponse.json(data, { status: data.success ? 200 : 404 });
}
