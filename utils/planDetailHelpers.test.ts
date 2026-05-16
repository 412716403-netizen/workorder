import { describe, it, expect } from 'vitest';
import {
  formatPlanCreatedDateList,
  effectiveSupplierIdFromProduct,
  purchaseOrderRecordMatchesPlanPanel,
} from './planDetailHelpers';
import {
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
} from '../types';
import type { Product, Partner } from '../types';

describe('formatPlanCreatedDateList', () => {
  it('null / undefined / 空 → 空字符串', () => {
    expect(formatPlanCreatedDateList(undefined)).toBe('');
    expect(formatPlanCreatedDateList(null)).toBe('');
    expect(formatPlanCreatedDateList('')).toBe('');
  });
  it('ISO 字符串 → yyyy-mm-dd', () => {
    // toLocalDateYmd 会按本地时区取日期，2026-05-16T10:00 在亚洲时区是 16
    const out = formatPlanCreatedDateList('2026-05-16T10:00:00');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

const mkPartner = (id: string): Partner => ({ id, name: id } as unknown as Partner);
const mkProduct = (supplierId?: string | null): Product => ({ supplierId } as unknown as Product);

describe('effectiveSupplierIdFromProduct', () => {
  it('无 product / 无 supplierId → null', () => {
    expect(effectiveSupplierIdFromProduct(undefined, [])).toBeNull();
    expect(effectiveSupplierIdFromProduct(mkProduct(undefined), [mkPartner('s1')])).toBeNull();
    expect(effectiveSupplierIdFromProduct(mkProduct(''), [mkPartner('s1')])).toBeNull();
    expect(effectiveSupplierIdFromProduct(mkProduct(null), [mkPartner('s1')])).toBeNull();
  });
  it('supplierId 不在 partners → null', () => {
    expect(effectiveSupplierIdFromProduct(mkProduct('sX'), [mkPartner('s1')])).toBeNull();
  });
  it('命中 → 返回 supplierId', () => {
    expect(effectiveSupplierIdFromProduct(mkProduct('s1'), [mkPartner('s1'), mkPartner('s2')])).toBe('s1');
  });
});

describe('purchaseOrderRecordMatchesPlanPanel', () => {
  const viewPlan = { id: 'plan-1', planNumber: 'P001' };
  const baseR = {
    type: 'PURCHASE_ORDER',
    productId: 'p-1',
    note: '',
    customData: {} as Record<string, unknown>,
  };

  it('记录不是 PURCHASE_ORDER / 无 productId / 无 viewPlan → false', () => {
    expect(purchaseOrderRecordMatchesPlanPanel(null, [], viewPlan)).toBe(false);
    expect(purchaseOrderRecordMatchesPlanPanel({ ...baseR, type: 'SALES_ORDER' }, [], viewPlan)).toBe(false);
    expect(purchaseOrderRecordMatchesPlanPanel({ ...baseR, productId: undefined }, [], viewPlan)).toBe(false);
    expect(purchaseOrderRecordMatchesPlanPanel(baseR, [], null)).toBe(false);
  });

  it('customData 中 sourcePlanId 匹配 → true', () => {
    const r = { ...baseR, customData: { [PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID]: 'plan-1' } };
    expect(purchaseOrderRecordMatchesPlanPanel(r, [], viewPlan)).toBe(true);
  });

  it('customData 中 sourcePlanNumber 在 planNumbersForPO 内 → true', () => {
    const r = { ...baseR, customData: { [PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER]: 'P001' } };
    expect(purchaseOrderRecordMatchesPlanPanel(r, ['P001', 'P002'], viewPlan)).toBe(true);
  });

  it('回退到 note 包含 "计划单[P001]" → true', () => {
    const r = { ...baseR, note: '原计划单[P001] 补料' };
    expect(purchaseOrderRecordMatchesPlanPanel(r, ['P001'], viewPlan)).toBe(true);
  });

  it('什么都没匹配上 → false', () => {
    const r = { ...baseR, note: '随便备注', customData: { other: 'x' } };
    expect(purchaseOrderRecordMatchesPlanPanel(r, ['P001'], viewPlan)).toBe(false);
  });
});
