import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createCustomer, listCustomers } from '@/lib/customers/local-store';
import type { UserFilters, UserMutationPayload } from '@/features/users/api/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function filtersFromUrl(request: NextRequest): UserFilters {
  const params = request.nextUrl.searchParams;
  return {
    page: Number(params.get('page') ?? 1),
    limit: Number(params.get('limit') ?? 10),
    status: params.get('status') ?? undefined,
    search: params.get('search') ?? undefined,
    sort: params.get('sort') ?? undefined
  };
}

export async function GET(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const data = await listCustomers(filtersFromUrl(request));
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json()) as UserMutationPayload;
  const data = await createCustomer(body);
  return NextResponse.json(data);
}
