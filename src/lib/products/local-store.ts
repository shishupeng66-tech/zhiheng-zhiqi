import fs from 'node:fs/promises';
import path from 'node:path';
import { matchSorter } from 'match-sorter';
import { ensureDir, getPath } from '@/lib/storage';
import type {
  Product,
  ProductByIdResponse,
  ProductFilters,
  ProductMutationPayload,
  ProductsResponse
} from '@/features/products/api/types';

type ProductFile = {
  schemaVersion: number;
  storageKey: 'products';
  demo: boolean;
  updatedAt: string;
  records: Product[];
};

const FILE_NAME = 'products.json';

function now() {
  return new Date().toISOString();
}

async function filePath() {
  const dir = await getPath('products');
  return path.join(dir, FILE_NAME);
}

async function readFile(): Promise<ProductFile> {
  const target = await filePath();
  try {
    const raw = (await fs.readFile(target, 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<ProductFile>;
    return {
      schemaVersion: Number(parsed.schemaVersion ?? 1),
      storageKey: 'products',
      demo: Boolean(parsed.demo),
      updatedAt: String(parsed.updatedAt ?? now()),
      records: Array.isArray(parsed.records) ? (parsed.records as Product[]) : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        schemaVersion: 1,
        storageKey: 'products',
        demo: false,
        updatedAt: now(),
        records: []
      };
    }
    throw error;
  }
}

async function writeFile(data: ProductFile) {
  const dir = await ensureDir('products');
  const target = path.join(dir, FILE_NAME);
  const payload: ProductFile = { ...data, updatedAt: now() };
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sortProducts(records: Product[], sort?: string) {
  if (!sort) return records;
  try {
    const sortItems = JSON.parse(sort) as { id: string; desc: boolean }[];
    const first = sortItems[0];
    if (!first) return records;
    const { id, desc } = first;
    records.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[id];
      const bVal = (b as Record<string, unknown>)[id];
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

export async function listProducts({
  page = 1,
  limit = 10,
  categories,
  search,
  sort
}: ProductFilters): Promise<ProductsResponse> {
  const data = await readFile();
  let records = [...data.records];

  const categoryList = categories
    ? Array.isArray(categories)
      ? categories
      : String(categories).split(/[.,]/)
    : [];
  if (categoryList.length > 0) {
    records = records.filter((item) => categoryList.includes(item.category));
  }

  if (search) {
    records = matchSorter(records, search, {
      keys: ['name', 'description', 'category']
    });
  }

  records = sortProducts(records, sort);

  const offset = (Number(page) - 1) * Number(limit);
  const products = records.slice(offset, offset + Number(limit));

  return {
    success: true,
    time: now(),
    message: '产品资料来自本地数据目录',
    total_products: records.length,
    offset,
    limit: Number(limit),
    products
  };
}

export async function getLocalProductById(id: number): Promise<ProductByIdResponse> {
  const data = await readFile();
  const product = data.records.find((item) => item.id === id);
  if (!product) {
    return { success: false, message: `未找到 ID 为 ${id} 的产品` };
  }
  return { success: true, time: now(), message: '产品读取成功', product };
}

export async function createLocalProduct(input: ProductMutationPayload) {
  const data = await readFile();
  const maxId = data.records.reduce((max, item) => Math.max(max, item.id), 0);
  const product: Product = {
    ...input,
    id: maxId + 1,
    photo_url: '/zhiheng-product-placeholder.svg',
    created_at: now(),
    updated_at: now()
  };
  data.records.push(product);
  await writeFile(data);
  return { success: true, message: '产品创建成功', product };
}

export async function updateLocalProduct(id: number, input: ProductMutationPayload) {
  const data = await readFile();
  const index = data.records.findIndex((item) => item.id === id);
  if (index === -1) {
    return { success: false, message: `未找到 ID 为 ${id} 的产品` };
  }
  data.records[index] = {
    ...data.records[index],
    ...input,
    updated_at: now()
  };
  await writeFile(data);
  return { success: true, message: '产品更新成功', product: data.records[index] };
}

export async function deleteLocalProduct(id: number) {
  const data = await readFile();
  const next = data.records.filter((item) => item.id !== id);
  if (next.length === data.records.length) {
    return { success: false, message: `未找到 ID 为 ${id} 的产品` };
  }
  data.records = next;
  await writeFile(data);
  return { success: true, message: '产品删除成功' };
}
