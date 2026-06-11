import { describe, expect, it, vi, beforeEach } from 'vitest';
import { psiOrderLineTotalQty, validatePsiOrderSave } from './psiOrderLineSave';

vi.mock('sonner', () => ({
  toast: { warning: vi.fn() },
}));

import { toast } from 'sonner';

describe('psiOrderLineTotalQty', () => {
  it('汇总 variantQuantities', () => {
    expect(
      psiOrderLineTotalQty({
        productId: 'p1',
        variantQuantities: { v1: 2, v2: 3 },
      }),
    ).toBe(5);
  });

  it('无规格时用 quantity', () => {
    expect(psiOrderLineTotalQty({ productId: 'p1', quantity: 10 })).toBe(10);
  });
});

describe('validatePsiOrderSave', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear();
  });

  it('数量为 0 时不通过并提示', () => {
    const ok = validatePsiOrderSave({
      partner: '供应商A',
      partnerRequired: true,
      lines: [{ productId: 'p1', quantity: 0 }],
    });
    expect(ok).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith('存在明细数量须大于 0，请检查后再保存');
  });

  it('重新编辑时部分行数量为 0 也不允许保存', () => {
    const ok = validatePsiOrderSave({
      partner: '供应商A',
      partnerRequired: true,
      lines: [
        { productId: 'p1', quantity: 10 },
        { productId: 'p2', quantity: 0 },
      ],
    });
    expect(ok).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith('存在明细数量须大于 0，请检查后再保存');
  });

  it('存在大于 0 的明细时通过', () => {
    const ok = validatePsiOrderSave({
      partner: '供应商A',
      partnerRequired: true,
      lines: [{ productId: 'p1', quantity: 5 }],
    });
    expect(ok).toBe(true);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('采购入库允许负数但不允许 0', () => {
    const okZero = validatePsiOrderSave({
      partner: '供应商A',
      partnerRequired: true,
      warehouseId: 'w1',
      warehouseRequired: true,
      lines: [{ productId: 'p1', quantity: 0 }],
      allowNegativeQty: true,
    });
    expect(okZero).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith('存在明细数量为 0，请填写有效数量后再保存');

    vi.mocked(toast.warning).mockClear();
    const okNeg = validatePsiOrderSave({
      partner: '供应商A',
      partnerRequired: true,
      warehouseId: 'w1',
      warehouseRequired: true,
      lines: [{ productId: 'p1', quantity: -2 }],
      allowNegativeQty: true,
    });
    expect(okNeg).toBe(true);
  });
});
