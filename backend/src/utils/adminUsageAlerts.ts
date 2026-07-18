/** 平台用量异常告警阈值（看板红标；非硬拦截） */
export const ADMIN_USAGE_ALERT_THRESHOLDS = {
  itemCodeTotal: 50_000,
  itemCodeRecent: 5_000,
  knowledgeAssetBytes: 100 * 1024 * 1024,
  productImageBytes: 50 * 1024 * 1024,
  reportCountRecent: 5_000,
  storageBytesTotal: 200 * 1024 * 1024,
} as const;

export type AdminUsageAlertKind =
  | 'item_code_total'
  | 'item_code_recent'
  | 'knowledge_bytes'
  | 'product_image_bytes'
  | 'report_recent'
  | 'storage_total';

export type AdminUsageAlert = {
  kind: AdminUsageAlertKind;
  tenantId: string;
  tenantName: string;
  value: number;
  threshold: number;
  message: string;
};

export type AdminUsageAlertInput = {
  tenantId: string;
  name: string;
  itemCodeCount: number;
  itemCodeCountRecent: number;
  knowledgeAssetBytes: number;
  productImageBytes: number;
  reportCountRecent: number;
  storageBytesTotal: number;
};

export function buildTenantUsageAlerts(rows: AdminUsageAlertInput[]): AdminUsageAlert[] {
  const t = ADMIN_USAGE_ALERT_THRESHOLDS;
  const out: AdminUsageAlert[] = [];
  for (const r of rows) {
    if (r.itemCodeCount >= t.itemCodeTotal) {
      out.push({
        kind: 'item_code_total',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.itemCodeCount,
        threshold: t.itemCodeTotal,
        message: `单品码总量 ${r.itemCodeCount.toLocaleString('zh-CN')} ≥ ${t.itemCodeTotal.toLocaleString('zh-CN')}`,
      });
    }
    if (r.itemCodeCountRecent >= t.itemCodeRecent) {
      out.push({
        kind: 'item_code_recent',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.itemCodeCountRecent,
        threshold: t.itemCodeRecent,
        message: `近窗单品码新增 ${r.itemCodeCountRecent.toLocaleString('zh-CN')} ≥ ${t.itemCodeRecent.toLocaleString('zh-CN')}`,
      });
    }
    if (r.knowledgeAssetBytes >= t.knowledgeAssetBytes) {
      out.push({
        kind: 'knowledge_bytes',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.knowledgeAssetBytes,
        threshold: t.knowledgeAssetBytes,
        message: '资料库资产体积偏大',
      });
    }
    if (r.productImageBytes >= t.productImageBytes) {
      out.push({
        kind: 'product_image_bytes',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.productImageBytes,
        threshold: t.productImageBytes,
        message: '产品原图占用偏大',
      });
    }
    if (r.reportCountRecent >= t.reportCountRecent) {
      out.push({
        kind: 'report_recent',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.reportCountRecent,
        threshold: t.reportCountRecent,
        message: `近窗报工 ${r.reportCountRecent.toLocaleString('zh-CN')} ≥ ${t.reportCountRecent.toLocaleString('zh-CN')}`,
      });
    }
    if (r.storageBytesTotal >= t.storageBytesTotal) {
      out.push({
        kind: 'storage_total',
        tenantId: r.tenantId,
        tenantName: r.name,
        value: r.storageBytesTotal,
        threshold: t.storageBytesTotal,
        message: '存储合计（资料库+产品图+开发附件）偏大',
      });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}
