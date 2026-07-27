import type { FinanceOpType, FinanceRecord } from '../types';
import { entryDatetimeLocalToTimestamp } from './docEntryTime';

/** 与 FinanceRecordFormModal 表单值同形，供财务页与 PSI 快捷登记共用 */
export interface FinanceRecordFormValuesLike {
  amount: number;
  relatedId: string;
  partner: string;
  note: string;
  categoryId: string;
  workerId: string;
  productId: string;
  paymentAccount: string;
  customData: Record<string, unknown>;
  entryTimestamp: string;
}

export interface BuildFinanceRecordFromFormOpts {
  type: FinanceOpType;
  operator: string;
  /** 是否收款单/付款单（写入分类/工人/产品/账户等扩展字段） */
  isReceiptOrPayment?: boolean;
  /** PSI 来源单据号 */
  sourceDocNo?: string;
  /** 覆盖前端临时 id；默认随机生成 */
  id?: string;
}

/**
 * 由表单值组装新建 FinanceRecord。
 * 单号 docNo 留空，由后端 createRecord 取号。
 */
export function buildFinanceRecordFromForm(
  form: FinanceRecordFormValuesLike,
  opts: BuildFinanceRecordFromFormOpts,
): FinanceRecord {
  const isReceiptOrPayment = opts.isReceiptOrPayment ?? (opts.type === 'RECEIPT' || opts.type === 'PAYMENT');
  const rec: FinanceRecord = {
    id: opts.id ?? `fin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type,
    // 单号不再由前端预生成：view_own 成员的 today-count 只统计本人单会重号；后端 createRecord 带 advisory lock 全表取号
    docNo: '',
    timestamp: entryDatetimeLocalToTimestamp(form.entryTimestamp),
    amount: form.amount,
    relatedId: form.relatedId || undefined,
    partner: form.partner,
    note: form.note,
    operator: opts.operator,
    status: 'COMPLETED',
  };
  if (opts.sourceDocNo) rec.sourceDocNo = opts.sourceDocNo;
  if (isReceiptOrPayment) {
    rec.categoryId = form.categoryId || undefined;
    rec.workerId = form.workerId || undefined;
    rec.productId = form.productId || undefined;
    rec.paymentAccount = form.paymentAccount || undefined;
    if (Object.keys(form.customData).length) rec.customData = { ...form.customData };
  }
  return rec;
}

/** 用表单值覆盖已有记录（编辑保存） */
export function applyFinanceFormToExistingRecord(
  existing: FinanceRecord,
  form: FinanceRecordFormValuesLike,
): FinanceRecord {
  return {
    ...existing,
    amount: form.amount,
    relatedId: form.relatedId || undefined,
    partner: form.partner,
    note: form.note,
    categoryId: form.categoryId || undefined,
    workerId: form.workerId || undefined,
    productId: form.productId || undefined,
    paymentAccount: form.paymentAccount || undefined,
    customData: Object.keys(form.customData).length ? { ...form.customData } : undefined,
    timestamp: entryDatetimeLocalToTimestamp(form.entryTimestamp),
  };
}
