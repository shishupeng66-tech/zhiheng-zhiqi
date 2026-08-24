import type { SettingModule } from '@/lib/db/schema';

/** 保存设置时，单个字段的输入。 */
export interface SettingFieldInput {
  key: string;
  value: string | null;
  isSecret: boolean;
  /**
   * secret 字段是否已变更：
   * - true：用新明文重新加密（value 为空表示清空该 secret）
   * - false / 未提供：沿用库中已有密文，不重新加密
   */
  changed?: boolean;
}

/** 保存设置时，单个 Provider 的配置。 */
export interface ProviderConfigInput {
  provider: string;
  enabled?: boolean;
  isDefault?: boolean;
  fields: SettingFieldInput[];
}

/** 返回给前端（GET）的单个字段：secret 永不返回明文。 */
export interface SettingFieldOutput {
  key: string;
  value: string | null;
  isSecret: boolean;
  masked: boolean;
  displayValue: string | null;
}

export interface ProviderProfileOutput {
  id: string;
  module: SettingModule;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  fields: SettingFieldOutput[];
}

export interface ModuleSettingsOutput {
  module: SettingModule;
  providers: ProviderProfileOutput[];
}
