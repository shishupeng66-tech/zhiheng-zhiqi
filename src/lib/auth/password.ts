import bcrypt from 'bcryptjs';

/**
 * 密码哈希方案：bcrypt（bcryptjs 纯 JS 实现，无原生编译，Windows + Next.js 兼容性最稳）
 * - 仅保存哈希结果，禁止明文 / 可逆加密
 * - 盐轮数 10（安全性与性能的平衡，本地单租户部署足够）
 * - 禁止将密码写入日志、localStorage 或提交到 Git
 */
const SALT_ROUNDS = 10;

/** 对明文密码生成 bcrypt 哈希 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 校验明文密码与已存哈希是否匹配 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
