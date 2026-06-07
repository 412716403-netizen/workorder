import { describe, it, expect } from 'vitest';
import type { PartnerProductReconRow } from './partnerReconProductLedger';
import { buildSettlementProductLineReconList, toPartnerStyleProductRows } from './settlementReconProductLedger';
import type { SettlementReconRow } from './settlementReconLedger';

describe('buildSettlementProductLineReconList', () => {
  const productMap = new Map([['p1', { id: 'p1', name: '产品A', sku: 'SKU-A' } as never]]);

  it('报工单按 items 展开产品行', () => {
    const docRows: SettlementReconRow[] = [
      {
        source: 'work_report',
        reportNo: 'BG-1',
        timestamp: '2026-05-10T10:00:00',
        workerId: 'w1',
        workerName: '张三',
        amount: 30,
        items: [
          {
            orderNumber: 'WO-1',
            productId: 'p1',
            productName: '产品A',
            milestoneName: '缝制',
            quantity: 3,
            rate: 10,
            amount: 30,
          },
        ],
      },
    ];
    const lines = buildSettlementProductLineReconList({
      documentRows: docRows,
      productMap,
      workerName: '张三',
      openingBalance: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.productName).toBe('产品A');
    expect(lines[0]?.quantity).toBe(3);
    expect(lines[0]?.unitPrice).toBe(10);
    expect(lines[0]?.receivableDec).toBe(30);
    expect(lines[0]?.balance).toBe(-30);
  });

  it('toPartnerStyleProductRows 可复用合作单位按产品表', () => {
    const docRows: SettlementReconRow[] = [
      {
        source: 'work_report',
        reportNo: 'BG-1',
        timestamp: '2026-05-10T10:00:00',
        workerId: 'w1',
        workerName: '张三',
        amount: 10,
        items: [
          {
            orderNumber: 'WO-1',
            productId: 'p1',
            productName: '产品A',
            milestoneName: '缝制',
            quantity: 1,
            rate: 10,
            amount: 10,
          },
        ],
      },
    ];
    const lines = buildSettlementProductLineReconList({
      documentRows: docRows,
      productMap,
      workerName: '张三',
      openingBalance: 0,
    });
    const styled = toPartnerStyleProductRows(lines) as PartnerProductReconRow[];
    expect(styled[0]?.partner).toBe('张三');
    expect(styled[0]?.product?.sku).toBe('SKU-A');
  });
});
