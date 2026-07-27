import { AppError } from '../middleware/errorHandler.js';
import { isTenantElevatedRole, hasSubPermission } from '../types/index.js';
import * as settingsService from './settings.service.js';
import {
  DASHBOARD_SETTING_KEYS,
  parseFeaturePlugins,
  type FeaturePluginsConfig,
} from '../../../shared/workbench.js';
import { applyTraceabilityLabelPrintDefaults } from '../../../shared/traceabilityLabelPrintDefaults.js';

export async function getFeaturePlugins(tenantId: string) {
  const config = await settingsService.getConfig(tenantId);
  return parseFeaturePlugins(config[DASHBOARD_SETTING_KEYS.featurePlugins]);
}

export async function updateFeaturePlugins(tenantId: string, body: unknown) {
  const current = await getFeaturePlugins(tenantId);
  if (!body || typeof body !== 'object') {
    throw new AppError(400, '无效的功能插件配置');
  }
  const patch = body as FeaturePluginsConfig;
  const next = { ...current, ...patch };
  await settingsService.updateConfig(tenantId, DASHBOARD_SETTING_KEYS.featurePlugins, next);

  if (patch.traceability === true && current.traceability === false) {
    const config = await settingsService.getConfig(tenantId);
    const printTemplates = Array.isArray(config.printTemplates)
      ? (config.printTemplates as Array<{ id: string | number; printTemplateManageScope?: string | null }>)
      : [];
    const rawPlan = (config.planFormSettings ?? {}) as Record<string, unknown>;
    const updatedPlan = applyTraceabilityLabelPrintDefaults(rawPlan, printTemplates, {
      forceEnableTraceSection: true,
    });
    if (JSON.stringify(updatedPlan.labelPrint) !== JSON.stringify(rawPlan.labelPrint)) {
      await settingsService.updateConfig(tenantId, 'planFormSettings', updatedPlan);
    }
  }

  return next;
}

export async function assertCanManageFeaturePlugins(
  tenantRole: string | undefined,
  permissions: string[],
  userRole?: string,
) {
  if (userRole === 'admin') return;
  if (isTenantElevatedRole(tenantRole)) return;
  if (hasSubPermission(permissions, 'settings:config:edit')) return;
  throw new AppError(403, '仅管理员可操作');
}
