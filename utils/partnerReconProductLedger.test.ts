import { describe, it, expect } from 'vitest';
import {
  buildPartnerProductLineReconList,
  lineDeltaFromFinance,
  lineDeltaFromOutsource,
  lineDeltaFromPsi,
  summarizePartnerProductRowsByProductAndPrice,
  type PartnerProductReconRow,
} from './partnerReconProductLedger';
import type { FinanceRecord, ProductionOpRecord, PsiRecord } from '../types';
import type { PartnerReconRow } from './partnerReconLedger';

const productMap = new Map([
  ['p1', { id: 'p1', name: '产品A', sku: 'SKU-A', imageUrl: 'http://img/a.png' } as never],
  ['p2', { id: 'p2', name: '产品B', sku: 'SKU-B' } as never],
]);

const psi = (overrides: Partial<PsiRecord> & Pick<PsiRecord, 'type' | 'productId'>): PsiRecord => ({
  id: `psi-${Math.random()}`,
  type: overrides.type,
  productId: overrides.productId,
  partner: '万新',
  partnerId: 'partner-1',
  docNumber: overrides.docNumber ?? 'PB-001',
  timestamp: overrides.timestamp ?? '2026-05-10T10:00:00',
  createdAt: overrides.createdAt ?? '2026-05-10T10:00:00',
  amount: overrides.amount ?? 100,
  ...overrides,
});

describe('lineDeltaFromPsi', () => {
  it('采购入库行减少应收', () => {
    expect(lineDeltaFromPsi(psi({ type: 'PURCHASE_BILL', productId: 'p1', amount: 50 }))).toEqual({ inc: 0, dec: 50 });
  });

  it('销售单行增加应收', () => {
    expect(lineDeltaFromPsi(psi({ type: 'SALES_BILL', productId: 'p1', amount: 200 }))).toEqual({ inc: 200, dec: 0 });
  });
});

describe('buildPartnerProductLineReconList', () => {
  it('按单据顺序展开采购入库多行，余额逐行累计', () => {
    const docRows: PartnerReconRow[] = [
      {
        source: 'psi',
        docType: '采购入库',
        docNo: 'PB-1',
        timestamp: '2026-05-10T12:00:00',
        partner: '万新',
        amount: 34.4,
      },
    ];
    const lines = buildPartnerProductLineReconList({
      documentRows: docRows,
      psiRecords: [
        psi({ type: 'PURCHASE_BILL', productId: 'p1', amount: 24.4, docNumber: 'PB-1', createdAt: '2026-05-10T10:00:00' }),
        psi({ type: 'PURCHASE_BILL', productId: 'p2', amount: 10, docNumber: 'PB-1', createdAt: '2026-05-10T11:00:00' }),
      ],
      prodRecords: [],
      productMap,
      partnerName: '万新',
      partnerId: 'partner-1',
      partnerOpeningBalance: -100,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.productName).toBe('产品A');
    expect(lines[0]?.product).toEqual({ name: '产品A', sku: 'SKU-A', imageUrl: 'http://img/a.png' });
    expect(lines[1]?.product).toEqual({ name: '产品B', sku: 'SKU-B', imageUrl: null });
    expect(lines[0]?.quantity).toBeNull();
    expect(lines[0]?.unitPrice).toBeNull();
    expect(lines[0]?.receivableDec).toBe(24.4);
    expect(lines[0]?.balance).toBe(-124.4);
    expect(lines[1]?.productName).toBe('产品B');
    expect(lines[1]?.receivableDec).toBe(10);
    expect(lines[1]?.balance).toBe(-134.4);
    expect(lines[0]?.detailTarget).toEqual(docRows[0]);
  });

  it('采购入库行带出数量与采购单价', () => {
    const docRows: PartnerReconRow[] = [
      {
        source: 'psi',
        docType: '采购入库',
        docNo: 'PB-Q',
        timestamp: '2026-05-10T12:00:00',
        partner: '万新',
        amount: 24,
      },
    ];
    const lines = buildPartnerProductLineReconList({
      documentRows: docRows,
      psiRecords: [
        psi({
          type: 'PURCHASE_BILL',
          productId: 'p1',
          docNumber: 'PB-Q',
          quantity: 2,
          purchasePrice: 12,
          amount: 24,
        }),
      ],
      prodRecords: [],
      productMap,
      partnerName: '万新',
      partnerId: 'partner-1',
      partnerOpeningBalance: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(2);
    expect(lines[0]?.unitPrice).toBe(12);
  });

  it('收付款保持单据级一行', () => {
    const fin: FinanceRecord = {
      id: 'f1',
      type: 'RECEIPT',
      amount: 500,
      partner: '万新',
      operator: '财务',
      timestamp: '2026-05-15T10:00:00',
      status: 'COMPLETED',
    };
    const docRows: PartnerReconRow[] = [{ source: 'finance', rec: fin }];
    const lines = buildPartnerProductLineReconList({
      documentRows: docRows,
      psiRecords: [],
      prodRecords: [],
      productMap,
      partnerName: '万新',
      partnerId: 'partner-1',
      partnerOpeningBalance: -1000,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.receivableDec).toBe(500);
    expect(lines[0]?.balance).toBe(-1500);
    expect(lines[0]?.quantity).toBeNull();
    expect(lines[0]?.unitPrice).toBeNull();
    expect(lines[0]?.detailTarget).toBe(fin);
  });

  it('外协收回按生产行展开', () => {
    const docRows: PartnerReconRow[] = [
      {
        source: 'psi',
        docType: '外协收回',
        docNo: 'OS-1',
        timestamp: '2026-05-08T12:00:00',
        partner: '万新',
        amount: 380,
      },
    ];
    const prod1: ProductionOpRecord = {
      id: 'prod-1',
      type: 'OUTSOURCE',
      docNo: 'OS-1',
      productId: 'p2',
      quantity: 10,
      unitPrice: 30,
      amount: 300,
      partner: '万新',
      operator: '操作员',
      timestamp: '2026-05-08T10:00:00',
      status: '已收回',
    };
    const prod2: ProductionOpRecord = {
      id: 'prod-2',
      type: 'OUTSOURCE',
      docNo: 'OS-1',
      productId: 'p1',
      quantity: 8,
      unitPrice: 10,
      amount: 80,
      partner: '万新',
      operator: '操作员',
      timestamp: '2026-05-08T11:00:00',
      status: '已收回',
    };
    const lines = buildPartnerProductLineReconList({
      documentRows: docRows,
      psiRecords: [],
      prodRecords: [prod2, prod1],
      productMap,
      partnerName: '万新',
      partnerId: 'partner-1',
      partnerOpeningBalance: 0,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.productName).toBe('产品B');
    expect(lines[0]?.quantity).toBe(10);
    expect(lines[0]?.unitPrice).toBe(30);
    expect(lines[0]?.receivableDec).toBe(300);
    expect(lines[0]?.balance).toBe(-300);
    expect(lines[1]?.productName).toBe('产品A');
    expect(lines[1]?.quantity).toBe(8);
    expect(lines[1]?.unitPrice).toBe(10);
    expect(lines[1]?.receivableDec).toBe(80);
    expect(lines[1]?.balance).toBe(-380);
  });

  it('无匹配 PSI 行时回退为整单 delta', () => {
    const docRows: PartnerReconRow[] = [
      {
        source: 'psi',
        docType: '采购入库',
        docNo: 'PB-X',
        timestamp: '2026-05-10T12:00:00',
        partner: '万新',
        amount: 99,
      },
    ];
    const lines = buildPartnerProductLineReconList({
      documentRows: docRows,
      psiRecords: [],
      prodRecords: [],
      productMap,
      partnerName: '万新',
      partnerId: 'partner-1',
      partnerOpeningBalance: 10,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.productName).toBe('—');
    expect(lines[0]?.product).toBeNull();
    expect(lines[0]?.receivableDec).toBe(99);
    expect(lines[0]?.balance).toBe(-89);
  });
});

describe('summarizePartnerProductRowsByProductAndPrice', () => {
  const line = (over: Partial<PartnerProductReconRow> & Pick<PartnerProductReconRow, 'productName'>): PartnerProductReconRow => ({
    kind: 'line',
    timestamp: '2026-01-01',
    docNo: 'D1',
    docType: '采购入库',
    partner: '万新',
    productName: over.productName,
    product: over.product ?? null,
    quantity: over.quantity ?? null,
    unitPrice: over.unitPrice ?? null,
    receivableInc: over.receivableInc ?? 0,
    receivableDec: over.receivableDec ?? 0,
    balance: over.balance ?? 0,
    detailTarget: { source: 'psi', docType: '采购入库', docNo: 'D1', timestamp: '', partner: '', amount: 0 },
  });

  it('同产品两种单价拆成两行', () => {
    const rows = [
      line({ productName: '羊毛衫', quantity: 10, unitPrice: 160, receivableDec: 1600 }),
      line({ productName: '羊毛衫', quantity: 5, unitPrice: 130, receivableDec: 650 }),
    ];
    const sum = summarizePartnerProductRowsByProductAndPrice(rows);
    expect(sum).toHaveLength(2);
    const byPrice = new Map(sum.map(s => [s.unitPrice, s]));
    expect(byPrice.get(160)?.quantity).toBe(10);
    expect(byPrice.get(160)?.amount).toBe(1600);
    expect(byPrice.get(130)?.quantity).toBe(5);
    expect(byPrice.get(130)?.amount).toBe(650);
  });

  it('同产品同单价合并数量与金额', () => {
    const rows = [
      line({ productName: '羊毛衫', quantity: 3, unitPrice: 100, receivableDec: 300 }),
      line({ productName: '羊毛衫', quantity: 2, unitPrice: 100, receivableDec: 200 }),
    ];
    const sum = summarizePartnerProductRowsByProductAndPrice(rows);
    expect(sum).toHaveLength(1);
    expect(sum[0]?.quantity).toBe(5);
    expect(sum[0]?.amount).toBe(500);
  });

  it('无数量时 quantity 为 null 仍累计金额', () => {
    const rows = [
      line({ productName: 'X', quantity: null, unitPrice: null, receivableDec: 100, receivableInc: 0 }),
    ];
    const sum = summarizePartnerProductRowsByProductAndPrice(rows);
    expect(sum).toHaveLength(1);
    expect(sum[0]?.quantity).toBeNull();
    expect(sum[0]?.amount).toBe(100);
  });
});

describe('lineDeltaFromOutsource / lineDeltaFromFinance', () => {
  it('外协收回减少应收', () => {
    expect(
      lineDeltaFromOutsource({
        id: 'x',
        type: 'OUTSOURCE',
        productId: 'p1',
        quantity: 1,
        operator: 'o',
        timestamp: '',
        amount: 80,
      }),
    ).toEqual({ inc: 0, dec: 80 });
  });

  it('付款增加应收', () => {
    expect(
      lineDeltaFromFinance({
        id: 'x',
        type: 'PAYMENT',
        amount: 20,
        partner: '万新',
        operator: 'o',
        timestamp: '',
        status: 'COMPLETED',
      }),
    ).toEqual({ inc: 20, dec: 0 });
  });
});
