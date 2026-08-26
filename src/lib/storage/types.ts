/**
 * 数据存储 —— 统一业务文件目录常量
 *
 * 知衡智企未来定位为「企业 AI 工作台」，所有业务模块产生的实际文件资产
 * （客户附件/产品图片/素材/视频/音频/知识文件/AI 生成文件）统一通过
 * StorageService 获取目录，禁止业务代码写死路径。
 *
 * 与 SQLite 数据库（data/zhiheng*.db）完全解耦 —— 本阶段不迁移数据库路径。
 */

/** 业务目录 key（storage_configs.storage_key 的合法值），root 为保留的根目录 key */
export const STORAGE_KEYS = [
  'root',
  'customers',
  'products',
  'assets',
  'videos',
  'voices',
  'knowledge'
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

export interface StorageKeyMeta {
  key: StorageKey;
  /** 中文展示名 */
  label: string;
  /** 业务说明 */
  description: string;
  /** 默认子目录名（相对根目录），root 为 null */
  defaultSubdir: string | null;
}

export const STORAGE_KEY_META: Record<StorageKey, StorageKeyMeta> = {
  root: {
    key: 'root',
    label: '默认数据根目录',
    description: '企业本地数据根目录，业务子目录默认继承',
    defaultSubdir: null
  },
  customers: {
    key: 'customers',
    label: '客户资料',
    description: '客户附件、联系人资料文件',
    defaultSubdir: '客户资料'
  },
  products: {
    key: 'products',
    label: '产品资料',
    description: '产品图片、规格书、说明文件',
    defaultSubdir: '产品资料'
  },
  assets: {
    key: 'assets',
    label: '素材资源',
    description: '视频生产用素材（Pexels 等来源的本地副本）',
    defaultSubdir: '素材资源'
  },
  videos: {
    key: 'videos',
    label: '视频文件',
    description: 'AI 生成 / 生产的视频成品',
    defaultSubdir: '视频文件'
  },
  voices: {
    key: 'voices',
    label: '音频文件',
    description: '音色库试听、声音复刻训练素材与成品',
    defaultSubdir: '声音资产'
  },
  knowledge: {
    key: 'knowledge',
    label: '知识文件',
    description: '企业知识库、文档、检索语料',
    defaultSubdir: '知识文件'
  }
};

/** 根目录 key */
export const STORAGE_ROOT_KEY: StorageKey = 'root';

/** 业务子目录 key（不含 root） */
export const BUSINESS_STORAGE_KEYS = STORAGE_KEYS.filter(
  (k): k is Exclude<StorageKey, 'root'> => k !== 'root'
);
