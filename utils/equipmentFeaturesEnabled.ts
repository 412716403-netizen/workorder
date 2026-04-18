/**
 * 构建级总开关：设为 false 时，任何企业都不显示设备相关能力（紧急下线用）。
 * @see equipmentFeaturesEffective 结合企业「账号管理 → 企业管理」中的开关。
 */
export function equipmentFeaturesAllowedByEnv(): boolean {
  const raw = import.meta.env.VITE_ENABLE_EQUIPMENT_FEATURES;
  return raw !== 'false' && raw !== '0';
}

/**
 * @param tenantEnabled 来自当前登录企业的 `equipmentFeaturesEnabled`；undefined 视为开启（兼容旧会话）
 */
export function equipmentFeaturesEffective(tenantEnabled: boolean | undefined): boolean {
  if (!equipmentFeaturesAllowedByEnv()) return false;
  if (tenantEnabled === false) return false;
  return true;
}
