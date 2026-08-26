import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  deleteLocalProduct,
  getLocalProductById,
  updateLocalProduct
} from '@/lib/products/local-store';
import type { ProductMutationPayload } from '@/features/products/api/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const data = await getLocalProductById(Number(id));
  return NextResponse.json(data, { status: data.success ? 200 : 404 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as ProductMutationPayload;
  const data = await updateLocalProduct(Number(id), body);
  return NextResponse.json(data, { status: data.success ? 200 : 404 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const data = await deleteLocalProduct(Number(id));
  return NextResponse.json(data, { status: data.success ? 200 : 404 });
}
