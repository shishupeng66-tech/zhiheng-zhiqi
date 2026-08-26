// ============================================================
// User Service — Data Access Layer
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
//    → return apiClient<UsersResponse>('/users?...')
//    → Replace mock calls in route handlers (src/app/api/users/) with ORM
//
// 3. BFF — Route Handlers proxy to external backend (Laravel, Go, etc.)
//    → import { apiClient } from '@/lib/api-client'
//    → return apiClient<UsersResponse>('/users?...')
//    → Route handlers proxy requests to your external backend service
//
// 4. Direct external API (frontend-only, no Next.js backend)
//    → const res = await fetch('https://your-api.com/users?...')
//    → return res.json()
//
// Current: Local JSON data through StorageService-backed API
// ============================================================

import type { UserFilters, UsersResponse, UserMutationPayload } from './types';

function toQuery(filters: UserFilters) {
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

export async function getUsers(filters: UserFilters): Promise<UsersResponse> {
  if (typeof window === 'undefined') {
    const { listCustomers } = await import('@/lib/customers/local-store');
    return listCustomers(filters);
  }
  const query = toQuery(filters);
  return requestJson<UsersResponse>(`/api/users${query ? `?${query}` : ''}`);
}

export async function createUser(data: UserMutationPayload) {
  return requestJson('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateUser(id: number, data: UserMutationPayload) {
  return requestJson(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteUser(id: number) {
  return requestJson(`/api/users/${id}`, { method: 'DELETE' });
}
