import { describe, it, expect } from 'vitest';
import {
  applyFinanceFormToExistingRecord,
  buildFinanceRecordFromForm,
  type FinanceRecordFormValuesLike,
} from './buildFinanceRecordFromForm';
import type { FinanceRecord } from '../types';

const baseForm: FinanceRecordFormValuesLike = {
  amount: 100.5,
  relatedId: '',
  partner: '供应商A',
  note: '关联采购订单 PO-1',
  categoryId: 'cat-1',
  workerId: '',
  productId: 'prod-1',
  paymentAccount: '现金',
  customData: { f1: 'v1' },
  entryTimestamp: '2026-07-27T10:00',
};

describe('buildFinanceRecordFromForm', () => {
  it('组装收款单并写入 sourceDocNo / 扩展字段', () => {
    const rec = buildFinanceRecordFromForm(baseForm, {
      type: 'RECEIPT',
      operator: '张三',
      sourceDocNo: 'SO-001',
      id: 'fin-fixed',
    });
    expect(rec.id).toBe('fin-fixed');
    expect(rec.type).toBe('RECEIPT');
    expect(rec.docNo).toBe('');
    expect(rec.amount).toBe(100.5);
    expect(rec.partner).toBe('供应商A');
    expect(rec.note).toBe('关联采购订单 PO-1');
    expect(rec.operator).toBe('张三');
    expect(rec.status).toBe('COMPLETED');
    expect(rec.sourceDocNo).toBe('SO-001');
    expect(rec.categoryId).toBe('cat-1');
    expect(rec.productId).toBe('prod-1');
    expect(rec.paymentAccount).toBe('现金');
    expect(rec.customData).toEqual({ f1: 'v1' });
    expect(rec.timestamp.length).toBeGreaterThan(0);
  });

  it('非收付款类型不写分类扩展字段', () => {
    const rec = buildFinanceRecordFromForm(baseForm, {
      type: 'SETTLEMENT',
      operator: '李四',
      isReceiptOrPayment: false,
    });
    expect(rec.categoryId).toBeUndefined();
    expect(rec.productId).toBeUndefined();
    expect(rec.paymentAccount).toBeUndefined();
    expect(rec.customData).toBeUndefined();
  });
});

describe('applyFinanceFormToExistingRecord', () => {
  it('覆盖已有记录字段', () => {
    const existing: FinanceRecord = {
      id: 'fin-1',
      type: 'PAYMENT',
      amount: 1,
      partner: '旧',
      operator: '甲',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 'COMPLETED',
      sourceDocNo: 'PO-1',
    };
    const updated = applyFinanceFormToExistingRecord(existing, {
      ...baseForm,
      partner: '新供应商',
      amount: 88,
    });
    expect(updated.id).toBe('fin-1');
    expect(updated.sourceDocNo).toBe('PO-1');
    expect(updated.partner).toBe('新供应商');
    expect(updated.amount).toBe(88);
    expect(updated.operator).toBe('甲');
  });
});
