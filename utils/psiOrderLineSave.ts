import { toast } from 'sonner';

export type PsiOrderLineQtyInput = {
  productId?: string;
  quantity?: number;
  variantQuantities?: Record<string, number>;
};

/** 汇总单行明细数量（多规格取 variantQuantities 合计，否则取 quantity） */
export function psiOrderLineTotalQty(line: PsiOrderLineQtyInput): number {
  if (line.variantQuantities && Object.keys(line.variantQuantities).length > 0) {
    return Object.values(line.variantQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return Number(line.quantity) || 0;
}

/** 已选产品但数量无效（0 或订单场景下 ≤0）的首条明细 */
export function findPsiOrderLineWithInvalidQty(
  lines: PsiOrderLineQtyInput[],
  allowNegativeQty: boolean,
): PsiOrderLineQtyInput | undefined {
  return lines.find(i => {
    if (!i.productId) return false;
    const q = psiOrderLineTotalQty(i);
    return allowNegativeQty ? q === 0 : q <= 0;
  });
}

export function hasPsiOrderLineWithNonZeroQty(
  lines: PsiOrderLineQtyInput[],
  allowNegativeQty: boolean,
): boolean {
  return lines.some(i => {
    if (!i.productId) return false;
    const q = psiOrderLineTotalQty(i);
    return allowNegativeQty ? q !== 0 : q > 0;
  });
}

type ValidatePsiOrderSaveOpts = {
  partner?: string;
  partnerRequired?: boolean;
  partnerLabel?: string;
  warehouseId?: string;
  warehouseRequired?: boolean;
  warehouseLabel?: string;
  lines: PsiOrderLineQtyInput[];
  /** 采购入库/销售单等允许负数（退货）；默认 false 即须 > 0 */
  allowNegativeQty?: boolean;
};

/**
 * 进销存四单保存前校验：数量为空或全为 0 时不通过并 toast。
 */
export function validatePsiOrderSave(opts: ValidatePsiOrderSaveOpts): boolean {
  const {
    partner,
    partnerRequired,
    partnerLabel = '往来单位',
    warehouseId,
    warehouseRequired,
    warehouseLabel = '仓库',
    lines,
    allowNegativeQty = false,
  } = opts;

  if (partnerRequired && !partner) {
    toast.warning(`请填写${partnerLabel}`);
    return false;
  }
  if (warehouseRequired && !warehouseId) {
    toast.warning(`请选择${warehouseLabel}`);
    return false;
  }
  if (lines.length === 0) {
    toast.warning('请至少添加一条明细');
    return false;
  }
  const productLines = lines.filter(i => Boolean(i.productId));
  if (productLines.length === 0) {
    toast.warning('请至少添加一条有效明细');
    return false;
  }
  if (findPsiOrderLineWithInvalidQty(lines, allowNegativeQty)) {
    toast.warning(
      allowNegativeQty
        ? '存在明细数量为 0，请填写有效数量后再保存'
        : '存在明细数量须大于 0，请检查后再保存',
    );
    return false;
  }
  if (!hasPsiOrderLineWithNonZeroQty(lines, allowNegativeQty)) {
    toast.warning(
      allowNegativeQty
        ? '明细数量不能为 0，请填写有效数量后再保存'
        : '明细数量须大于 0，请填写后再保存',
    );
    return false;
  }
  return true;
}
