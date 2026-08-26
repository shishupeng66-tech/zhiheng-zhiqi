// ============================================================
// Product Service — Data Access Layer
// ============================================================
// This is the ONLY file you modify when connecting to your backend.
// Queries (queries.ts) and components import from here — they never change.
//
// Pick your pattern and replace the function bodies below:
//
// 1. Server Actions + ORM (Prisma / Drizzle / Supabase)
//    → Add 'use server' at the top of this file
//    → Call your ORM directly in each function
//
// 2. Route Handlers + ORM
//    → import { apiClient } from '@/lib/api-client'
//    → return apiClient<ProductsResponse>('/products?...')
//    → Replace mock calls in route handlers (src/app/api/products/) with ORM
//
// 3. BFF — Route Handlers proxy to external backend (Laravel, Go, etc.)
//    → import { apiClient } from '@/lib/api-client'
//    → return apiClient<ProductsResponse>('/products?...')
//    → Route handlers proxy requests to your external backend service
//
// 4. Direct external API (frontend-only, no Next.js backend)
//    → const res = await fetch('https://your-api.com/products?...')
//    → return res.json()
//
// Current: Local JSON data through StorageService-backed API
// ============================================================

import type {
  ProductFilters,
  ProductsResponse,
  ProductByIdResponse,
  ProductMutationPayload
} from './types';

function toQuery(filters: ProductFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getProducts(filters: ProductFilters): Promise<ProductsResponse> {
  if (typeof window === 'undefined') {
    const { listProducts } = await import('@/lib/products/local-store');
    return listProducts(filters);
  }
  const query = toQuery(filters);
  return requestJson<ProductsResponse>(`/api/products${query ? `?${query}` : ''}`);
}

export async function getProductById(id: number): Promise<ProductByIdResponse> {
  if (typeof window === 'undefined') {
    const { getLocalProductById } = await import('@/lib/products/local-store');
    return getLocalProductById(id);
  }
  return requestJson<ProductByIdResponse>(`/api/products/${id}`);
}

export async function createProduct(data: ProductMutationPayload) {
  return requestJson('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateProduct(id: number, data: ProductMutationPayload) {
  return requestJson(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteProduct(id: number) {
  return requestJson(`/api/products/${id}`, { method: 'DELETE' });
}
