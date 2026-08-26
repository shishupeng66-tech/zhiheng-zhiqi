import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { matchSorter } from 'match-sorter';
import { ensureDir, getPath } from '@/lib/storage';
import type {
  User,
  UserFilters,
  UserMutationPayload,
  UsersResponse
} from '@/features/users/api/types';

type CustomerFile = {
  schemaVersion: number;
  storageKey: 'customers';
  demo: boolean;
  updatedAt: string;
  records: User[];
};

const FILE_NAME = 'customers.json';

function now() {
  return new Date().toISOString();
}

async function filePath() {
  const dir = await getPath('customers');
  return path.join(dir, FILE_NAME);
}

async function readFile(): Promise<CustomerFile> {
  const target = await filePath();
  try {
    const raw = (await fs.readFile(target, 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<CustomerFile>;
    return {
      schemaVersion: Number(parsed.schemaVersion ?? 1),
      storageKey: 'customers',
      demo: Boolean(parsed.demo),
      updatedAt: String(parsed.updatedAt ?? now()),
      records: Array.isArray(parsed.records) ? (parsed.records as User[]) : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        schemaVersion: 1,
        storageKey: 'customers',
        demo: false,
        updatedAt: now(),
        records: []
      };
    }
    throw error;
  }
}

async function writeFile(data: CustomerFile) {
  const dir = await ensureDir('customers');
  const target = path.join(dir, FILE_NAME);
  const payload: CustomerFile = { ...data, updatedAt: now() };
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sortCustomers(records: User[], sort?: string) {
  if (!sort) return records;
  try {
    const sortItems = JSON.parse(sort) as { id: string; desc: boolean }[];
    const first = sortItems[0];
    if (!first) return records;
    const { id, desc } = first;
    records.sort((a, b) => {
      const key = id === 'name' ? 'customer_name' : id;
      const aVal = (a as Record<string, unknown>)[key];
      const bVal = (b as Record<string, unknown>)[key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return desc ? bVal - aVal : aVal - bVal;
      }
      return desc
        ? String(bVal ?? '').localeCompare(String(aVal ?? ''), 'zh-CN')
        : String(aVal ?? '').localeCompare(String(bVal ?? ''), 'zh-CN');
    });
  } catch {
    return records;
  }
  return records;
}

export async function listCustomers({
  page = 1,
  limit = 10,
  status,
  search,
  sort
}: UserFilters): Promise<UsersResponse> {
  const data = await readFile();
  let records = [...data.records];

  if (status) {
    const statusList = String(status).split(/[.,]/);
    records = records.filter((item) => statusList.includes(item.status));
  }

  if (search) {
    records = matchSorter(records, search, {
      keys: ['customer_name', 'contact', 'email', 'industry', 'owner']
    });
  }

  records = sortCustomers(records, sort);

  const offset = (Number(page) - 1) * Number(limit);
  const users = records.slice(offset, offset + Number(limit));

  return {
    success: true,
    time: now(),
    message: '客户资料来自本地数据目录',
    total_users: records.length,
    offset,
    limit: Number(limit),
    users
  };
}

export async function createCustomer(input: UserMutationPayload) {
  const data = await readFile();
  const maxId = data.records.reduce((max, item) => Math.max(max, item.id), 0);
  const record: User = {
    ...input,
    id: maxId + 1,
    created_at: now(),
    updated_at: now()
  };
  data.records.push(record);
  await writeFile(data);
  return { success: true, message: '客户创建成功', user: record };
}

export async function updateCustomer(id: number, input: UserMutationPayload) {
  const data = await readFile();
  const index = data.records.findIndex((item) => item.id === id);
  if (index === -1) {
    return { success: false, message: `未找到 ID 为 ${id} 的客户` };
  }
  data.records[index] = {
    ...data.records[index],
    ...input,
    updated_at: now()
  };
  await writeFile(data);
  return { success: true, message: '客户更新成功', user: data.records[index] };
}

export async function deleteCustomer(id: number) {
  const data = await readFile();
  const next = data.records.filter((item) => item.id !== id);
  if (next.length === data.records.length) {
    return { success: false, message: `未找到 ID 为 ${id} 的客户` };
  }
  data.records = next;
  await writeFile(data);
  return { success: true, message: '客户删除成功' };
}

export function createDemoCustomerId(prefix = 'demo') {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
