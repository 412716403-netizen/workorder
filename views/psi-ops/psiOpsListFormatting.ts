import type {
  PlanFormFieldConfig,
  Warehouse,
  Product,
} from '../../types';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import { toLocalDateYmd, formatCustomFieldDatetimeForPrint } from '../../utils/localDateTime';

/**
 * PSI 列表显示层纯函数与默认常量
 * =====================================================================
 * 提出的目的是把 PSIOpsView.tsx 的头部噪音剥离：这些函数与 state/hooks
 * 无关，只做"单据号 → 列表显示字符串"的格式化；搬出后主视图少 100+ 行。
 */

/** `UNGROUPED-xxx` → `未分组 xxx`，其他透传 */
export function formatPsiDocNumForList(docNum: string): string {
  return docNum.startsWith('UNGROUPED-') ? docNum.replace('UNGROUPED-', '未分组 ') : docNum;
}

/** 列表备注超长截断（空值显示占位 `—`） */
export function truncatePsiListNote(n: string | undefined | null, max = 30): string {
  if (n == null || n === '') return '—';
  return n.length > max ? `${n.slice(0, max)}…` : n;
}

/** 列表副标题的自定义字段紧凑文案（含空值占位）；附件/日期有特殊格式 */
export function compactPsiListCustomValue(cf: PlanFormFieldConfig, value: unknown): string {
  if (value == null || value === '') return '—';
  const str = String(value);
  const t = effectivePlanFormFieldType(cf);
  if (t === 'file' && str.startsWith('data:')) return '附件';
  if (t === 'date') {
    const printed = formatCustomFieldDatetimeForPrint(value);
    return printed || str.slice(0, 10) || '—';
  }
  return str.length > 40 ? `${str.slice(0, 40)}…` : str;
}

export type PsiDocListMainRow = {
  partner?: string;
  dueDate?: string;
  createdAt?: string;
  note?: string;
  warehouseId?: string;
  customData?: Record<string, unknown>;
};

/**
 * 采购单：按**所有行**的 `customData.relatedProductId` 去重后，顿号连接展示（列表/汇总用）。
 * 无行级关联时回退为 — 。
 */
export function aggregatePurchaseBillRelatedProductListText(
  lineRows: Array<{ customData?: unknown }>,
  productMap?: Map<string, Product>,
): string {
  const ids: string[] = [];
  for (const row of lineRows) {
    const cd = row.customData;
    if (!cd || typeof cd !== 'object' || Array.isArray(cd)) continue;
    const id = String((cd as Record<string, unknown>).relatedProductId ?? '').trim();
    if (id) ids.push(id);
  }
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return '—';
  return unique
    .map((id) => {
      const p = productMap?.get(id);
      if (!p) return id;
      return p.sku ? `${p.name || '—'}（${p.sku}）` : (p.name || id);
    })
    .join('、');
}

/** 采购订单标准字段在列表中的显示文案（按 fieldId 分派） */
export function purchaseOrderStandardListText(
  fieldId: string,
  mainInfo: PsiDocListMainRow,
  docNum: string,
  productMap?: Map<string, Product>,
): string {
  switch (fieldId) {
    case 'docNumber':
      return formatPsiDocNumForList(docNum);
    case 'partner':
      return mainInfo.partner || '—';
    case 'relatedProduct': {
      const id = String(mainInfo.customData?.relatedProductId ?? '').trim();
      if (!id) return '—';
      const p = productMap?.get(id);
      if (!p) return id;
      return p.sku ? `${p.name || '—'}（${p.sku}）` : (p.name || id);
    }
    default:
      return '—';
  }
}

export type PurchaseBillListTextOptions = {
  /** 传入同一单下全部行时，关联产品从各行汇总；不传则回退为单头/首行 `customData.relatedProductId`（旧数据） */
  allLinesForRelatedProduct?: Array<{ customData?: unknown }>;
};

/** 采购单标准字段在列表中的显示文案（按 fieldId 分派，含仓库名查表） */
export function purchaseBillStandardListText(
  fieldId: string,
  mainInfo: PsiDocListMainRow,
  docNum: string,
  warehouseMap: Map<string, Warehouse>,
  productMap?: Map<string, Product>,
  options?: PurchaseBillListTextOptions,
): string {
  switch (fieldId) {
    case 'docNumber':
      return formatPsiDocNumForList(docNum);
    case 'partner':
      return mainInfo.partner || '—';
    case 'relatedProduct': {
      if (options?.allLinesForRelatedProduct && options.allLinesForRelatedProduct.length > 0) {
        return aggregatePurchaseBillRelatedProductListText(options.allLinesForRelatedProduct, productMap);
      }
      const id = String(mainInfo.customData?.relatedProductId ?? '').trim();
      if (!id) return '—';
      const p = productMap?.get(id);
      if (!p) return id;
      return p.sku ? `${p.name || '—'}（${p.sku}）` : (p.name || id);
    }
    case 'warehouse': {
      const wid = mainInfo.warehouseId;
      if (!wid) return '—';
      const w = warehouseMap.get(wid);
      return w?.name || wid;
    }
    case 'createdAt': {
      const y = toLocalDateYmd(mainInfo.createdAt);
      if (y) return y;
      if (typeof mainInfo.createdAt === 'string' && mainInfo.createdAt.trim()) {
        return mainInfo.createdAt.trim().slice(0, 10);
      }
      return '—';
    }
    case 'note':
      return truncatePsiListNote(mainInfo.note, 30);
    default:
      return '—';
  }
}

/* ----------------------------- 默认表单配置 ----------------------------- */
//
// 已移除：DEFAULT_PO/SO/PB/SB_FORM_SETTINGS（4 个空 standardFields 的默认值）。
// 调用方请直接 import AppDataContext 中的正版默认值：
//   - DEFAULT_PURCHASE_ORDER_FORM_SETTINGS
//   - DEFAULT_SALES_ORDER_FORM_SETTINGS
//   - DEFAULT_PURCHASE_BILL_FORM_SETTINGS
//   - DEFAULT_SALES_BILL_FORM_SETTINGS
// 这些版本包含 docNumber/partner 等完整 standardFields，避免初次加载时
// Modal/列表看到的默认字段与全局不一致。
