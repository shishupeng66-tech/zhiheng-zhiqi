/**
 * Template Library —— 统一入口
 *
 * 正式剪映模板库。Agent 只能在有可用企业模板时执行自动剪辑，
 * 没有合适模板时提示先选择或蒸馏模板。
 *
 * 双轨：
 * - System 模板库（registry.json，产品级 Production Template Library）
 * - 企业模板资产（template-asset.json，客户 Obsidian，通过 workspace templateRoot 解析）
 */
export * from './types';
export * from './repository';
export * from './asset-schema';
export * from './template-asset-store';
