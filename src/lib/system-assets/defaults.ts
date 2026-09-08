/**
 * System Asset Registry —— 统一默认路径
 *
 * 只在此处生成默认路径，禁止在多个文件重复写 `D:\知衡智企数据库\...`。
 *
 * 布局（2026-09-07 调整）：
 * - 默认根 = 环境 ZHI_HENG_SYSTEM_ASSET_ROOT 或 `D:\知衡智企数据库\知识库`（Obsidian 企业知识库）。
 *   原「模板库（研究仓库）」与「系统资产」已于 2026-09-07 删除/并入知识库：
 *   - 模板库（729套第三方研究 + visual-resource-registry 花字研究）→ 已删除，无生产价值
 *   - 系统资产\剪映模板库 → 迁移至 知识库\05_模板\剪映模板库（Production Template Library）
 * - jianyingTemplateRoot = Production Template Library（正式模板库）。
 * - RESEARCH_TEMPLATE_ROOT 已随研究仓库删除，不再使用。
 */
import path from 'node:path';
import type { SystemAssetKey } from './types';

/** 系统资产根（环境可覆盖；默认 Obsidian 企业知识库）。 */
export function getSystemAssetRoot(): string {
  return process.env.ZHI_HENG_SYSTEM_ASSET_ROOT || 'D:\\知衡智企数据库\\知识库';
}

/**
 * Research Template Library —— 已于 2026-09-07 删除（研究仓库整体移除）。
 * 保留常量仅用于诊断显示"已移除"，不再指向任何真实路径。
 */
export const RESEARCH_TEMPLATE_ROOT = ''; // 已删除：D:\知衡智企数据库\模板库\jianying-template-registry

/** 规格建议布局（D:\知衡智企数据库\知识库\...）。 */
export function getDefaultSystemAssetPaths(): Record<SystemAssetKey, string> {
  const root = getSystemAssetRoot();
  return {
    styleKnowledgeRoot: path.join(root, '05_视频剪辑知识'),
    jianyingTemplateRoot: path.join(root, '05_模板', '剪映模板库'),
    visualResourceRegistryRoot: path.join(root, '30_素材资源', '视觉资源库'),
    resourceCalibrationRoot: path.join(root, '30_素材资源', '视觉资源库', 'calibration'),
    resourceIndexRoot: path.join(root, '30_素材资源', '视觉资源库', 'indexes'),
    editingSkillRoot: path.join(root, '06_Video_Editing_Skills')
  };
}

/**
 * Legacy 现有实际布局（D:\知衡智企数据库\知识库）——
 * 当默认布局目录尚不存在时 fallback，保证解析结果直接可用且不移动数据。
 *
 * 注意：jianyingTemplateRoot 的 legacy 也指向 Production 路径，
 * 绝不 fallback 到 Research Template Library（已删除）。
 */
export function getLegacySystemAssetPaths(): Record<SystemAssetKey, string> {
  const root = getSystemAssetRoot();
  return {
    styleKnowledgeRoot: path.join(root, '05_视频剪辑知识'),
    jianyingTemplateRoot: path.join(root, '05_模板', '剪映模板库'),
    visualResourceRegistryRoot: path.join(root, '30_素材资源', '视觉资源库'),
    resourceCalibrationRoot: path.join(root, '30_素材资源', '视觉资源库', 'calibration'),
    resourceIndexRoot: path.join(root, '30_素材资源', '视觉资源库', 'indexes'),
    editingSkillRoot: path.join(root, '06_Video_Editing_Skills')
  };
}

/** 系统资产 key 元数据（供诊断/前端摘要）。 */
export const SYSTEM_ASSET_KEY_META: Record<SystemAssetKey, { label: string; description: string }> =
  {
    styleKnowledgeRoot: {
      label: '剪辑风格知识',
      description: '内容类型、镜头策略、节奏策略、包装策略等知识文件（Obsidian/Markdown）'
    },
    jianyingTemplateRoot: {
      label: '剪映模板库',
      description: '知衡智企自制/测试/验收过的剪映模板（Template Registry，位于知识库05_模板）'
    },
    visualResourceRegistryRoot: {
      label: '视觉资源库',
      description: '花字/文字模板/贴纸/动画/音效/资源ID/语义标签/Agent可用状态'
    },
    resourceCalibrationRoot: {
      label: '视觉资源校准',
      description: 'scale/x/y/slot layout/bbox/Golden Reference/Calibration Preview'
    },
    resourceIndexRoot: {
      label: '资源检索索引',
      description: '系统资源检索索引、增量索引、缓存元数据'
    },
    editingSkillRoot: {
      label: 'Editing Skill',
      description: '全局 Editing Skill 根目录（Agent-native）'
    }
  };
