/**
 * 自动剪辑 —— 脚本风格注册表（SCRIPT STYLE / STRATEGY，不是最终脚本）。
 *
 * 四种风格：知识科普型 / 工厂实力展示型 / 老板观点型 / 产品案例型。
 *
 * 概念边界（任务收口）：
 * - 风格只规定「开场方式 / 内容结构 / 叙事角度 / 重点信息 / CTA 方式」。
 * - 最终完整脚本文案必须由 Agent 结合「用户需求 + 当前企业知识/素材库 + 脚本风格」生成，
 *   绝不能用这里的描述当脚本。
 *
 * 页面与 script-draft API 共用本注册表，避免两套数据漂移。
 */

export type VideoScriptStyle = {
  /** 风格 ID（稳定标识，用于 API） */
  id: string;
  /** 风格名称（页面小标签展示） */
  name: string;
  /** 一句话说明（次要展示 / tooltip） */
  description: string;
  /** 关键词（用于素材匹配提示与展示） */
  keywords: string[];
  /** 生成脚本时的策略指令：开场 / 结构 / 视角 / 重点 / CTA */
  strategy: string;
};

export const VIDEO_SCRIPT_STYLES: VideoScriptStyle[] = [
  {
    id: 'knowledge',
    name: '知识科普型',
    description: '解释工艺、原理和客户关心的问题。',
    keywords: ['知识科普', '生产流程', '质检节点', '交付标准'],
    strategy:
      '以一个客户常见疑问或行业知识点开场；正文按「问题→原因→解决方式」结构展开，讲解生产工艺、原理、质检节点与交付标准；结尾给出明确结论或行动建议。'
  },
  {
    id: 'factory',
    name: '工厂实力展示型',
    description: '突出设备、产线、工艺、质检与交付能力。',
    keywords: ['工厂实力', '生产线', '工艺流程', '质量控制'],
    strategy:
      '开场先展示生产现场与设备；正文按「产线→工艺→质检→交付」顺序呈现企业硬实力；结尾落到稳定交付与客户信任。'
  },
  {
    id: 'boss-ip',
    name: '老板观点型',
    description: '用负责人视角表达行业判断和经营理念。',
    keywords: ['老板观点', '行业判断', '企业经营', '客户信任'],
    strategy:
      '以负责人第一视角从一个行业判断或经营理念开场；正文结合真实生产或服务场景说明企业为什么重视长期稳定的内容与品质；结尾给出态度式观点与信任主张。'
  },
  {
    id: 'case',
    name: '产品案例型',
    description: '围绕产品、应用场景和客户需求组织内容。',
    keywords: ['产品案例', '应用场景', '客户需求', '产品展示'],
    strategy:
      '从产品应用场景切入；正文按「客户需求→产品特点→落地过程/成果」组织内容；结尾引导行动（咨询、试用或合作）。'
  }
];

/** 按 ID 查找风格；找不到返回 null。 */
export function findVideoScriptStyle(styleId: string): VideoScriptStyle | null {
  return VIDEO_SCRIPT_STYLES.find((style) => style.id === styleId) ?? null;
}
