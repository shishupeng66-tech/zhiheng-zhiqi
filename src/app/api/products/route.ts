import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createLocalProduct, listProducts } from '@/lib/products/local-store';
import type { ProductFilters, ProductMutationPayload } from '@/features/products/api/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function filtersFromUrl(request: NextRequest): ProductFilters {
  const params = request.nextUrl.searchParams;
  return {
    page: Number(params.get('page') ?? 1),
    limit: Number(params.get('limit') ?? 10),
    categories: params.get('categories') ?? undefined,
    search: params.get('search') ?? undefined,
    sort: params.get('sort') ?? undefined
  };
}

export async function GET(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const data = await listProducts(filtersFromUrl(request));
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json()) as ProductMutationPayload;
  const data = await createLocalProduct(body);
  return NextResponse.json(data);
}
