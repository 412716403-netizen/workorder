/**
 * 财务对账（对齐 Web useFinanceReconciliation / partnerReconLedger / settlementReconLedger）
 * 支持按单据 / 按产品；不实现导出 Excel。
 */

const { formatLocalDateTimeZh } = require('./flowDocSortLite.js');
const { listProductThumbFromProduct } = require('./listProductThumb.js');

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalDateYmd(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PSI_PURCHASE_BILL_LABEL = '采购入库';
const PSI_PURCHASE_BILL_LABEL_LEGACY = '采购单';
const PARTNER_RECON_DOC_OUTSOURCE_RECEIVE = '外协收回';
const PARTNER_RECON_DOC_REWORK_RECEIVE = '返工收回';
const PSI_TYPES = ['PURCHASE_BILL', 'SALES_BILL'];
const PSI_LABEL = { PURCHASE_BILL: PSI_PURCHASE_BILL_LABEL, SALES_BILL: '销售单' };

function isPurchaseBillDocType(docType) {
  return docType === PSI_PURCHASE_BILL_LABEL || docType === PSI_PURCHASE_BILL_LABEL_LEGACY;
}

function isPartnerReconOutsourceReceiveDocType(docType) {
  return docType === PARTNER_RECON_DOC_OUTSOURCE_RECEIVE || docType === PARTNER_RECON_DOC_REWORK_RECEIVE;
}

function partnerReconOutsourceReceiveDocType(hasReworkSource) {
  return hasReworkSource ? PARTNER_RECON_DOC_REWORK_RECEIVE : PARTNER_RECON_DOC_OUTSOURCE_RECEIVE;
}

function outsourceReceiveRecordMatchesReconDocType(rec, docType) {
  if (!rec || rec.type !== 'OUTSOURCE' || rec.status !== '已收回') return false;
  if (docType === PARTNER_RECON_DOC_REWORK_RECEIVE) return !!rec.sourceReworkId;
  if (docType === PARTNER_RECON_DOC_OUTSOURCE_RECEIVE) return !rec.sourceReworkId;
  return false;
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '¥0.00';
  return `¥${v.toFixed(2)}`;
}

function formatMoneyOrDash(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  return formatMoney(v);
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  return formatLocalDateTimeZh(d);
}

function inDateRange(dateStr, from, to, beforeExclusive) {
  if (beforeExclusive && dateStr >= beforeExclusive) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function inFinanceDateRange(ts, from, to) {
  const d = toLocalDateYmd(ts);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function reportWorkerId(r) {
  return (r && (r.workerId || (r.customData && r.customData.workerId) || '')) || '';
}

function computePartnerReconRowDelta(row) {
  let inc = 0;
  let dec = 0;
  if (row.source === 'finance') {
    if (row.rec.type === 'RECEIPT') dec = Number(row.rec.amount) || 0;
    else if (row.rec.type === 'PAYMENT') inc = Number(row.rec.amount) || 0;
  } else if (row.source === 'psi') {
    if (isPurchaseBillDocType(row.docType) || row.docType === '采购退货') {
      if (row.amount >= 0) dec = Math.abs(row.amount);
      else inc = Math.abs(row.amount);
    } else if (isPartnerReconOutsourceReceiveDocType(row.docType)) {
      dec = Math.abs(row.amount);
    } else if (row.docType === '销售单' || row.docType === '销售退货') {
      if (row.amount >= 0) inc = row.amount;
      else dec = Math.abs(row.amount);
    }
  } else if (row.source === 'prod') {
    dec = Number(row.rec.amount) || 0;
  }
  return { inc, dec };
}

function buildPartnerReconBalances(rows, openingBalance) {
  let running = Number(openingBalance) || 0;
  return (rows || []).map((row) => {
    const { inc, dec } = computePartnerReconRowDelta(row);
    running += inc - dec;
    return { row, receivableInc: inc, receivableDec: dec, balance: running };
  });
}

function summarizePartnerReconBalances(rows, openingBalance) {
  let periodInc = 0;
  let periodDec = 0;
  (rows || []).forEach((row) => {
    const { inc, dec } = computePartnerReconRowDelta(row);
    periodInc += inc;
    periodDec += dec;
  });
  const opening = Number(openingBalance) || 0;
  return {
    openingBalance: opening,
    periodInc,
    periodDec,
    closingBalance: opening + periodInc - periodDec,
  };
}

function buildPartnerReconList(input) {
  const {
    partnerId = '',
    partnerName = '',
    dateFrom = '',
    dateTo = '',
    psiRecords = [],
    prodRecords = [],
    financeRecords = [],
  } = input || {};
  if (!partnerId && !partnerName) return [];

  const rows = [];
  const psiFiltered = (psiRecords || []).filter(
    (r) =>
      PSI_TYPES.indexOf(r.type) >= 0 &&
      (r.partner === partnerName || r.partnerId === partnerId),
  );
  const psiByDoc = new Map();
  psiFiltered.forEach((r) => {
    const dateStr =
      (r.createdAt ? toLocalDateYmd(r.createdAt) : '') ||
      (r.timestamp ? toLocalDateYmd(r.timestamp) : '') ||
      '';
    if (dateFrom && dateStr < dateFrom) return;
    if (dateTo && dateStr > dateTo) return;
    const docKey = `${r.type}|${r.docNumber || r.id}`;
    const cur = psiByDoc.get(docKey);
    const amt = Number(r.amount) || 0;
    if (!cur) {
      psiByDoc.set(docKey, {
        type: r.type,
        timestamp: r.timestamp || '',
        partner: r.partner || '',
        amount: amt,
        operator: r.operator || '',
        note: r.note || '',
      });
    } else {
      cur.amount += amt;
    }
  });
  psiByDoc.forEach((v, docKey) => {
    const docNo = docKey.split('|')[1] || '';
    let docType = PSI_LABEL[v.type] || v.type;
    if (v.type === 'SALES_BILL' && v.amount < 0) docType = '销售退货';
    else if (v.type === 'PURCHASE_BILL' && v.amount < 0) docType = '采购退货';
    rows.push({
      source: 'psi',
      docType,
      docNo,
      timestamp: v.timestamp,
      partner: v.partner,
      amount: v.amount,
      operator: v.operator,
      note: v.note,
      psiType: v.type,
    });
  });

  const prodByDoc = new Map();
  (prodRecords || [])
    .filter((rec) => rec.type === 'OUTSOURCE' && rec.status === '已收回' && rec.partner === partnerName)
    .forEach((rec) => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (dateFrom && d < dateFrom) return;
      if (dateTo && d > dateTo) return;
      const docKey = rec.docNo || rec.id;
      const cur = prodByDoc.get(docKey);
      const amt = Number(rec.amount) || 0;
      const rework = !!rec.sourceReworkId;
      if (!cur) {
        prodByDoc.set(docKey, {
          timestamp: rec.timestamp || '',
          partner: rec.partner || '',
          amount: amt,
          operator: rec.operator || '',
          hasReworkSource: rework,
        });
      } else {
        cur.amount += amt;
        if (rework) cur.hasReworkSource = true;
      }
    });
  prodByDoc.forEach((v, docNo) => {
    rows.push({
      source: 'psi',
      docType: partnerReconOutsourceReceiveDocType(v.hasReworkSource),
      docNo,
      timestamp: v.timestamp,
      partner: v.partner,
      amount: v.amount,
      operator: v.operator,
      psiType: 'OUTSOURCE',
    });
  });

  const finByDoc = new Map();
  (financeRecords || [])
    .filter(
      (rec) =>
        (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') &&
        rec.partner === partnerName &&
        inFinanceDateRange(rec.timestamp, dateFrom, dateTo),
    )
    .forEach((rec) => {
      const docKey = rec.docNo || rec.id;
      const cur = finByDoc.get(docKey);
      const amt = Number(rec.amount) || 0;
      if (!cur) finByDoc.set(docKey, { rec: Object.assign({}, rec), amount: amt });
      else {
        cur.amount += amt;
        cur.rec = Object.assign({}, cur.rec, { amount: cur.amount });
      }
    });
  finByDoc.forEach((v) => {
    rows.push({ source: 'finance', rec: v.rec });
  });

  rows.sort((a, b) => {
    const ta = a.source === 'finance' ? a.rec.timestamp : a.timestamp;
    const tb = b.source === 'finance' ? b.rec.timestamp : b.timestamp;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });
  return rows;
}

function filterPartnerReconList(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) => {
    const parts = [];
    if (row.source === 'finance') {
      const r = row.rec;
      parts.push(r.docNo || '', r.id, r.partner || '', r.note || '', r.type, String(r.amount));
    } else {
      parts.push(row.docNo || '', row.docType || '', row.partner || '', row.operator || '', row.note || '', String(row.amount));
    }
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

function computeSettlementReconRowDelta(row) {
  if (row.source === 'work_report') return { inc: 0, dec: Number(row.amount) || 0 };
  if (row.source === 'rework_report') return { inc: 0, dec: Math.abs(Number(row.rec.amount) || 0) };
  if (row.source === 'settlement_finance') {
    if (row.rec.type === 'RECEIPT') return { inc: 0, dec: Number(row.rec.amount) || 0 };
    if (row.rec.type === 'PAYMENT') return { inc: Number(row.rec.amount) || 0, dec: 0 };
  }
  return { inc: 0, dec: 0 };
}

function buildSettlementReconBalances(rows, openingBalance) {
  let running = Number(openingBalance) || 0;
  return (rows || []).map((row) => {
    const { inc, dec } = computeSettlementReconRowDelta(row);
    running += inc - dec;
    return { row, receivableInc: inc, receivableDec: dec, balance: running };
  });
}

function summarizeSettlementReconBalances(rows, openingBalance) {
  let periodInc = 0;
  let periodDec = 0;
  (rows || []).forEach((row) => {
    const { inc, dec } = computeSettlementReconRowDelta(row);
    periodInc += inc;
    periodDec += dec;
  });
  const opening = Number(openingBalance) || 0;
  return {
    openingBalance: opening,
    periodInc,
    periodDec,
    closingBalance: opening + periodInc - periodDec,
  };
}

function buildWorkReportRowsFromHistory(input) {
  const {
    workerId = '',
    workerName = '',
    dateFrom = '',
    dateTo = '',
    dateBeforeExclusive = '',
    orderReports = [],
    productReports = [],
  } = input || {};
  if (!workerId) return [];

  const groups = new Map();

  function consumeReport(r, itemBuilder) {
    const wid = reportWorkerId(r);
    if (wid !== workerId) return;
    const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
    if (!inDateRange(dateStr, dateFrom, dateTo, dateBeforeExclusive)) return;
    const qty = Number(r.quantity) || 0;
    const unitRate = r.rate != null ? Number(r.rate) : 0;
    const amt = qty * unitRate;
    const key = r.reportNo || r.reportBatchId || r.reportId || r.id;
    const existing = groups.get(key);
    const item = itemBuilder(r, qty, unitRate, amt);
    if (!existing) {
      groups.set(key, {
        timestamp: r.timestamp || '',
        workerId: wid,
        workerName,
        amount: amt,
        items: [item],
      });
    } else {
      existing.amount += amt;
      existing.items.push(item);
    }
  }

  (orderReports || []).forEach((r) => {
    consumeReport(r, (rec, qty, rate, amt) => ({
      orderNumber: rec.orderNumber || '',
      productId: rec.productId || '',
      productName: rec.productName || '',
      milestoneName: rec.milestoneName || '',
      quantity: qty,
      rate,
      amount: amt,
    }));
  });

  (productReports || []).forEach((r) => {
    consumeReport(r, (rec, qty, rate, amt) => ({
      orderNumber: '关联产品',
      productId: rec.productId || (rec.progress && rec.progress.productId) || '',
      productName: rec.productName || '',
      milestoneName: rec.milestoneName || '',
      quantity: qty,
      rate,
      amount: amt,
    }));
  });

  const rows = [];
  groups.forEach((v, reportNo) => {
    rows.push({
      source: 'work_report',
      reportNo: reportNo || '—',
      timestamp: v.timestamp,
      workerId: v.workerId,
      workerName: v.workerName,
      amount: v.amount,
      items: v.items,
    });
  });
  return rows;
}

function buildSettlementReconList(input) {
  const {
    workerId = '',
    workerName = '',
    dateFrom = '',
    dateTo = '',
    dateBeforeExclusive = '',
    orderReports = [],
    productReports = [],
    workerProdRecords = [],
    workerFinanceRecords = [],
  } = input || {};
  if (!workerId) return [];

  const rows = buildWorkReportRowsFromHistory({
    workerId,
    workerName,
    dateFrom,
    dateTo,
    dateBeforeExclusive,
    orderReports,
    productReports,
  });

  (workerProdRecords || [])
    .filter((r) => r.type === 'REWORK_REPORT' && r.workerId === workerId)
    .forEach((rec) => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (!inDateRange(d, dateFrom, dateTo, dateBeforeExclusive)) return;
      rows.push({ source: 'rework_report', rec });
    });

  (workerFinanceRecords || [])
    .filter((rec) => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.workerId === workerId)
    .forEach((rec) => {
      const d = toLocalDateYmd(rec.timestamp);
      if (!inDateRange(d, dateFrom, dateTo, dateBeforeExclusive)) return;
      rows.push({ source: 'settlement_finance', rec });
    });

  rows.sort((a, b) => {
    const ta =
      a.source === 'settlement_finance' || a.source === 'rework_report'
        ? a.rec.timestamp
        : a.timestamp;
    const tb =
      b.source === 'settlement_finance' || b.source === 'rework_report'
        ? b.rec.timestamp
        : b.timestamp;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });
  return rows;
}

function computeSettlementOpeningBalance(input) {
  if (!input || !String(input.dateFrom || '').trim()) return 0;
  const beforeRows = buildSettlementReconList(
    Object.assign({}, input, {
      dateFrom: '',
      dateTo: '',
      dateBeforeExclusive: String(input.dateFrom).trim(),
      orderReports: input.openingOrderReports || input.orderReports || [],
      productReports: input.openingProductReports || input.productReports || [],
      workerProdRecords: input.openingWorkerProdRecords || input.workerProdRecords || [],
      workerFinanceRecords: input.openingWorkerFinanceRecords || input.workerFinanceRecords || [],
    }),
  );
  return summarizeSettlementReconBalances(beforeRows, 0).closingBalance;
}

function filterSettlementReconList(rows, query, workerMap) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows || [];
  const map = workerMap || new Map();
  return (rows || []).filter((row) => {
    const parts = [];
    if (row.source === 'work_report') {
      parts.push(row.reportNo, row.workerName, String(row.amount));
      (row.items || []).forEach((i) => {
        parts.push(i.orderNumber, i.productName, i.milestoneName, String(i.quantity), String(i.amount));
      });
    } else if (row.source === 'rework_report') {
      const r = row.rec;
      parts.push(
        r.docNo || '',
        r.id,
        String(r.amount),
        r.workerId || '',
        (map.get(r.workerId || '') || {}).name || '',
      );
    } else {
      const r = row.rec;
      parts.push(
        r.docNo || '',
        r.id,
        r.partner || '',
        r.note || '',
        r.type,
        String(r.amount),
        (map.get(r.workerId || '') || {}).name || '',
      );
    }
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

function partnerDocTypeLabel(row) {
  if (row.source === 'finance') {
    return row.rec.type === 'RECEIPT' ? '收款单' : row.rec.type === 'PAYMENT' ? '付款单' : row.rec.type;
  }
  return row.docType || '—';
}

function partnerDocNo(row) {
  if (row.source === 'finance') return row.rec.docNo || row.rec.id || '—';
  return row.docNo || '—';
}

function partnerTimestamp(row) {
  if (row.source === 'finance') return row.rec.timestamp;
  return row.timestamp;
}

function partnerParty(row) {
  if (row.source === 'finance') return row.rec.partner || '—';
  return row.partner || '—';
}

function mapPartnerBalancedCard(balanced, index) {
  const { row, receivableInc, receivableDec, balance } = balanced;
  const docType = partnerDocTypeLabel(row);
  const docNo = partnerDocNo(row);
  let navType = '';
  let navId = '';
  let navDocNo = '';
  if (row.source === 'finance') {
    navType = row.rec.type === 'RECEIPT' ? 'receipt' : row.rec.type === 'PAYMENT' ? 'payment' : '';
    navId = row.rec.id || '';
  } else if (row.source === 'psi') {
    if (row.psiType === 'PURCHASE_BILL' || isPurchaseBillDocType(row.docType) || row.docType === '采购退货') {
      navType = 'purchase_bill';
      navDocNo = row.docNo;
    } else if (row.psiType === 'SALES_BILL' || row.docType === '销售单' || row.docType === '销售退货') {
      navType = 'sales_bill';
      navDocNo = row.docNo;
    } else if (isPartnerReconOutsourceReceiveDocType(row.docType)) {
      navType = 'outsource';
      navDocNo = row.docNo;
    }
  }
  return {
    key: `p-${index}-${docType}-${docNo}`,
    timestampText: formatTimestamp(partnerTimestamp(row)),
    docNo,
    docType,
    partyName: partnerParty(row),
    incText: formatMoneyOrDash(receivableInc),
    decText: formatMoneyOrDash(receivableDec),
    balanceText: formatMoney(balance),
    hasInc: receivableInc > 0,
    hasDec: receivableDec > 0,
    navType,
    navId,
    navDocNo,
    canNavigate: !!navType,
  };
}

function mapSettlementBalancedCard(balanced, index, workerMap) {
  const { row, receivableInc, receivableDec, balance } = balanced;
  const map = workerMap || new Map();
  let docType = '—';
  let docNo = '—';
  let partyName = '—';
  let timestamp = '';
  let navType = '';
  let navId = '';
  let navDocNo = '';
  let workDetail = null;

  if (row.source === 'work_report') {
    docType = '报工单';
    docNo = row.reportNo || '—';
    partyName = row.workerName || '—';
    timestamp = row.timestamp;
    navType = 'work_report';
    workDetail = {
      reportNo: row.reportNo,
      timestamp: row.timestamp,
      workerName: row.workerName,
      amount: row.amount,
      items: row.items || [],
    };
  } else if (row.source === 'rework_report') {
    docType = '返工报工';
    docNo = row.rec.docNo || row.rec.id || '—';
    partyName = (map.get(row.rec.workerId || '') || {}).name || row.rec.workerId || '—';
    timestamp = row.rec.timestamp;
    navType = 'rework_report';
    navDocNo = row.rec.docNo || '';
  } else {
    docType = row.rec.type === 'RECEIPT' ? '收款单' : row.rec.type === 'PAYMENT' ? '付款单' : row.rec.type;
    docNo = row.rec.docNo || row.rec.id || '—';
    partyName = (map.get(row.rec.workerId || '') || {}).name || row.rec.partner || '—';
    timestamp = row.rec.timestamp;
    navType = row.rec.type === 'RECEIPT' ? 'receipt' : row.rec.type === 'PAYMENT' ? 'payment' : '';
    navId = row.rec.id || '';
  }

  return {
    key: `s-${index}-${docType}-${docNo}`,
    timestampText: formatTimestamp(timestamp),
    docNo,
    docType,
    partyName,
    incText: formatMoneyOrDash(receivableInc),
    decText: formatMoneyOrDash(receivableDec),
    balanceText: formatMoney(balance),
    hasInc: receivableInc > 0,
    hasDec: receivableDec > 0,
    navType,
    navId,
    navDocNo,
    canNavigate: !!navType,
    workDetail,
  };
}

function mapSummaryView(summary) {
  if (!summary) return null;
  return {
    openingBalanceText: formatMoney(summary.openingBalance),
    periodIncText: summary.periodInc > 0 ? formatMoney(summary.periodInc) : '—',
    periodDecText: summary.periodDec > 0 ? formatMoney(summary.periodDec) : '—',
    closingBalanceText: formatMoney(summary.closingBalance),
  };
}

function dateRangeToQuery(dateFrom, dateTo) {
  const out = {};
  if (dateFrom) out.startDate = `${dateFrom}T00:00:00.000Z`;
  if (dateTo) out.endDate = `${dateTo}T23:59:59.999Z`;
  return out;
}

function dateToEndExclusiveIso(ymd) {
  if (!ymd) return '';
  return `${ymd}T00:00:00.000Z`;
}

const UNKNOWN_PRODUCT_ID = '__unknown__';

function resolveProductId(productId) {
  const id = String(productId || '').trim();
  return id || UNKNOWN_PRODUCT_ID;
}

function resolveProductName(productId, productMap, fallback) {
  if (productId === UNKNOWN_PRODUCT_ID) return (fallback && String(fallback).trim()) || '—';
  const p = productMap && productMap.get(productId);
  return (p && p.name) || (fallback && String(fallback).trim()) || productId;
}

function resolveProductMeta(productId, productMap, fallback) {
  const p = productId === UNKNOWN_PRODUCT_ID ? undefined : productMap && productMap.get(productId);
  return {
    name: resolveProductName(productId, productMap, fallback),
    sku: (p && p.sku && String(p.sku).trim()) || null,
    imageUrl: (p && ((p.imageThumb && String(p.imageThumb).trim()) || (p.imageUrl && String(p.imageUrl).trim()))) || null,
  };
}

function lineAmount(r) {
  const direct = Number(r.amount);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const qty = Number(r.quantity) || 0;
  const price = Number(r.purchasePrice != null ? r.purchasePrice : r.salesPrice) || 0;
  return qty * price;
}

function parsePositiveQty(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-12) return null;
  return n;
}

function psiLineQtyPrice(r) {
  const qty = parsePositiveQty(r.quantity);
  if (r.type === 'PURCHASE_BILL') {
    const p = r.purchasePrice;
    if (p !== null && p !== undefined && p !== '') {
      const n = Number(p);
      if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
    }
  } else if (r.type === 'SALES_BILL') {
    const s = r.salesPrice;
    if (s !== null && s !== undefined && s !== '') {
      const n = Number(s);
      if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
    }
  }
  const amt = lineAmount(r);
  if (qty !== null) return { quantity: qty, unitPrice: amt / qty };
  return { quantity: null, unitPrice: null };
}

function outsourceLineQtyPrice(rec) {
  const qty = parsePositiveQty(rec.quantity);
  if (rec.unitPrice !== undefined && rec.unitPrice !== null) {
    const n = Number(rec.unitPrice);
    if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
  }
  const amt = Number(rec.amount) || 0;
  if (qty !== null && Math.abs(qty) > 1e-12) return { quantity: qty, unitPrice: amt / qty };
  return { quantity: qty, unitPrice: null };
}

function lineDeltaFromPsi(r) {
  const amount = lineAmount(r);
  if (r.type === 'PURCHASE_BILL') {
    if (amount >= 0) return { inc: 0, dec: Math.abs(amount) };
    return { inc: Math.abs(amount), dec: 0 };
  }
  if (r.type === 'SALES_BILL') {
    if (amount >= 0) return { inc: amount, dec: 0 };
    return { inc: 0, dec: Math.abs(amount) };
  }
  return { inc: 0, dec: 0 };
}

function lineDeltaFromOutsource(r) {
  return { inc: 0, dec: Math.abs(Number(r.amount) || 0) };
}

function lineDeltaFromFinance(r) {
  if (r.type === 'RECEIPT') return { inc: 0, dec: Math.abs(r.amount) };
  if (r.type === 'PAYMENT') return { inc: Math.abs(r.amount), dec: 0 };
  return { inc: 0, dec: 0 };
}

function lineDocTypeLabel(r) {
  if (r.type === 'SALES_BILL' && lineAmount(r) < 0) return '销售退货';
  if (r.type === 'PURCHASE_BILL' && lineAmount(r) < 0) return '采购退货';
  return PSI_LABEL[r.type] || r.type;
}

function sortPsiLines(lines) {
  return (lines || []).slice().sort((a, b) => {
    const ta = Date.parse(String(a.createdAt || a.timestamp || '')) || 0;
    const tb = Date.parse(String(b.createdAt || b.timestamp || '')) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function resolveBillType(docRow) {
  if (docRow.psiType === 'PURCHASE_BILL' || isPurchaseBillDocType(docRow.docType) || docRow.docType === '采购退货') {
    return 'PURCHASE_BILL';
  }
  return 'SALES_BILL';
}

/** 合作单位：按单据顺序展开产品级明细 */
function buildPartnerProductLineReconList(input) {
  const {
    documentRows = [],
    psiRecords = [],
    prodRecords = [],
    productMap,
    partnerName = '',
    partnerId = '',
    partnerOpeningBalance = 0,
  } = input || {};
  const map = productMap || new Map();
  const out = [];
  let running = Number(partnerOpeningBalance) || 0;

  const psiPartner = (r) => r.partner === partnerName || r.partnerId === partnerId;
  const prodPartner = (r) => r.partner === partnerName;

  (documentRows || []).forEach((docRow) => {
    if (docRow.source === 'finance') {
      const { inc, dec } = computePartnerReconRowDelta(docRow);
      running += inc - dec;
      const rec = docRow.rec;
      const meta = rec.productId ? resolveProductMeta(rec.productId, map) : null;
      out.push({
        kind: 'line',
        timestamp: rec.timestamp,
        docNo: rec.docNo || rec.id,
        docType: rec.type === 'RECEIPT' ? '收款单' : '付款单',
        partner: rec.partner || partnerName,
        productName: (meta && meta.name) || '—',
        product: meta,
        quantity: null,
        unitPrice: null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: rec,
        detailKind: 'finance',
      });
      return;
    }

    if (docRow.source !== 'psi') return;

    if (isPartnerReconOutsourceReceiveDocType(docRow.docType)) {
      const lines = (prodRecords || [])
        .filter((r) => prodPartner(r) && outsourceReceiveRecordMatchesReconDocType(r, docRow.docType))
        .filter((r) => (r.docNo || r.id) === docRow.docNo)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (!lines.length) {
        const { inc, dec } = computePartnerReconRowDelta(docRow);
        running += inc - dec;
        out.push({
          kind: 'line',
          timestamp: docRow.timestamp,
          docNo: docRow.docNo,
          docType: docRow.docType,
          partner: docRow.partner || partnerName,
          productName: '—',
          product: null,
          quantity: null,
          unitPrice: null,
          receivableInc: inc,
          receivableDec: dec,
          balance: running,
          detailTarget: docRow,
          detailKind: 'psi_doc',
        });
      } else {
        lines.forEach((rec) => {
          const { inc, dec } = lineDeltaFromOutsource(rec);
          running += inc - dec;
          const qp = outsourceLineQtyPrice(rec);
          out.push({
            kind: 'line',
            timestamp: rec.timestamp,
            docNo: docRow.docNo,
            docType: docRow.docType,
            partner: docRow.partner || partnerName,
            productName: resolveProductName(rec.productId, map),
            product: resolveProductMeta(rec.productId, map),
            quantity: qp.quantity,
            unitPrice: qp.unitPrice,
            receivableInc: inc,
            receivableDec: dec,
            balance: running,
            detailTarget: rec,
            detailKind: 'prod',
          });
        });
      }
      return;
    }

    const billType = resolveBillType(docRow);
    const lines = sortPsiLines(
      (psiRecords || []).filter(
        (r) =>
          r.type === billType &&
          psiPartner(r) &&
          (r.docNumber || r.docNo || r.id) === docRow.docNo,
      ),
    );

    if (!lines.length) {
      const { inc, dec } = computePartnerReconRowDelta(docRow);
      running += inc - dec;
      out.push({
        kind: 'line',
        timestamp: docRow.timestamp,
        docNo: docRow.docNo,
        docType: docRow.docType,
        partner: docRow.partner || partnerName,
        productName: '—',
        product: null,
        quantity: null,
        unitPrice: null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: docRow,
        detailKind: 'psi_doc',
      });
    } else {
      lines.forEach((r) => {
        const { inc, dec } = lineDeltaFromPsi(r);
        running += inc - dec;
        const ts = r.timestamp || (r.createdAt ? String(r.createdAt) : '') || docRow.timestamp;
        const qp = psiLineQtyPrice(r);
        const pid = resolveProductId(r.productId);
        out.push({
          kind: 'line',
          timestamp: ts,
          docNo: docRow.docNo,
          docType: lineDocTypeLabel(r),
          partner: docRow.partner || partnerName,
          productName: resolveProductName(pid, map, r.productName),
          product: resolveProductMeta(pid, map, r.productName),
          quantity: qp.quantity,
          unitPrice: qp.unitPrice,
          receivableInc: inc,
          receivableDec: dec,
          balance: running,
          detailTarget: docRow,
          detailKind: 'psi_doc',
        });
      });
    }
  });

  return out;
}

function filterPartnerProductReconList(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) => {
    const parts = [
      row.docNo,
      row.docType,
      row.partner,
      row.productName,
      row.quantity != null ? String(row.quantity) : '',
      row.unitPrice != null ? String(row.unitPrice) : '',
      String(row.receivableInc),
      String(row.receivableDec),
      String(row.balance),
    ];
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

function buildSettlementProductLineReconList(input) {
  const { documentRows = [], productMap, workerName = '', openingBalance = 0 } = input || {};
  const map = productMap || new Map();
  const out = [];
  let running = Number(openingBalance) || 0;

  (documentRows || []).forEach((docRow) => {
    if (docRow.source === 'work_report') {
      if (!docRow.items || !docRow.items.length) {
        const { inc, dec } = computeSettlementReconRowDelta(docRow);
        running += inc - dec;
        out.push({
          kind: 'line',
          timestamp: docRow.timestamp,
          docNo: docRow.reportNo,
          docType: '报工单',
          workerName: docRow.workerName || workerName,
          productName: '—',
          product: null,
          quantity: null,
          unitPrice: null,
          receivableInc: inc,
          receivableDec: dec,
          balance: running,
          detailTarget: docRow,
          detailKind: 'work_report',
        });
      } else {
        docRow.items.forEach((item) => {
          const inc = 0;
          const dec = Math.abs(item.amount);
          running += inc - dec;
          const meta = resolveProductMeta(item.productId, map, item.productName);
          out.push({
            kind: 'line',
            timestamp: docRow.timestamp,
            docNo: docRow.reportNo,
            docType: item.milestoneName ? `报工单 · ${item.milestoneName}` : '报工单',
            workerName: docRow.workerName || workerName,
            productName: meta.name,
            product: meta,
            quantity: item.quantity,
            unitPrice: item.rate,
            receivableInc: inc,
            receivableDec: dec,
            balance: running,
            detailTarget: docRow,
            detailKind: 'work_report',
          });
        });
      }
      return;
    }

    if (docRow.source === 'rework_report') {
      const rec = docRow.rec;
      const inc = 0;
      const dec = Math.abs(Number(rec.amount) || 0);
      running += inc - dec;
      const meta = rec.productId ? resolveProductMeta(rec.productId, map) : null;
      out.push({
        kind: 'line',
        timestamp: rec.timestamp,
        docNo: rec.docNo || rec.id,
        docType: '返工报工',
        workerName,
        productName: (meta && meta.name) || '—',
        product: meta,
        quantity: rec.quantity != null ? Number(rec.quantity) : null,
        unitPrice: rec.unitPrice != null ? Number(rec.unitPrice) : null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: docRow,
        detailKind: 'rework_report',
      });
      return;
    }

    const rec = docRow.rec;
    const { inc, dec } = lineDeltaFromFinance(rec);
    running += inc - dec;
    const meta = rec.productId ? resolveProductMeta(rec.productId, map) : null;
    out.push({
      kind: 'line',
      timestamp: rec.timestamp,
      docNo: rec.docNo || rec.id,
      docType: rec.type === 'RECEIPT' ? '收款单' : '付款单',
      workerName,
      productName: (meta && meta.name) || '—',
      product: meta,
      quantity: null,
      unitPrice: null,
      receivableInc: inc,
      receivableDec: dec,
      balance: running,
      detailTarget: rec,
      detailKind: 'finance',
    });
  });

  return out;
}

function filterSettlementProductReconList(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) => {
    const parts = [
      row.docNo,
      row.docType,
      row.workerName,
      row.productName,
      row.quantity != null ? String(row.quantity) : '',
      row.unitPrice != null ? String(row.unitPrice) : '',
      String(row.receivableInc),
      String(row.receivableDec),
      String(row.balance),
    ];
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

function formatQtyOrDash(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 1000) / 1000);
}

function mapProductLineCard(row, index, opts) {
  const partyMode = (opts && opts.partyMode) || 'partner';
  const partyName = partyMode === 'worker' ? row.workerName || '—' : row.partner || '—';
  const product = row.product;
  let showProduct = false;
  let showProductImage = false;
  let productImageUrl = '';
  let placeholderIconSrc = '/assets/icons/package.png';
  if (product && product.name && product.name !== '—') {
    showProduct = true;
    const thumb = listProductThumbFromProduct({
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl,
    });
    showProductImage = !!thumb.showProductImage;
    productImageUrl = thumb.productImageUrl || '';
    placeholderIconSrc = thumb.placeholderIconSrc || placeholderIconSrc;
  }

  let navType = '';
  let navId = '';
  let navDocNo = '';
  let workDetail = null;
  const kind = row.detailKind;
  const target = row.detailTarget;

  if (kind === 'finance' && target) {
    navType = target.type === 'RECEIPT' ? 'receipt' : target.type === 'PAYMENT' ? 'payment' : '';
    navId = target.id || '';
  } else if (kind === 'psi_doc' && target) {
    if (
      target.psiType === 'PURCHASE_BILL' ||
      isPurchaseBillDocType(target.docType) ||
      target.docType === '采购退货'
    ) {
      navType = 'purchase_bill';
      navDocNo = target.docNo || '';
    } else if (
      target.psiType === 'SALES_BILL' ||
      target.docType === '销售单' ||
      target.docType === '销售退货'
    ) {
      navType = 'sales_bill';
      navDocNo = target.docNo || '';
    } else if (isPartnerReconOutsourceReceiveDocType(target.docType)) {
      navType = 'outsource';
      navDocNo = target.docNo || '';
    }
  } else if (kind === 'prod' && target) {
    navType = 'outsource';
    navDocNo = target.docNo || row.docNo || '';
  } else if (kind === 'work_report' && target) {
    navType = 'work_report';
    workDetail = {
      reportNo: target.reportNo,
      timestamp: target.timestamp,
      workerName: target.workerName,
      amount: target.amount,
      items: target.items || [],
    };
  } else if (kind === 'rework_report' && target && target.rec) {
    navType = 'rework_report';
    navDocNo = target.rec.docNo || '';
  }

  return {
    key: `prod-${index}-${row.docType}-${row.docNo}-${row.productName}`,
    timestampText: formatTimestamp(row.timestamp),
    docNo: row.docNo || '—',
    docType: row.docType || '—',
    partyName,
    productName: row.productName || '—',
    showProduct,
    showProductImage,
    productImageUrl,
    placeholderIconSrc,
    quantityText: formatQtyOrDash(row.quantity),
    unitPriceText: row.unitPrice != null && Number.isFinite(Number(row.unitPrice))
      ? formatMoney(row.unitPrice)
      : '—',
    hasQtyPrice: row.quantity != null || row.unitPrice != null,
    incText: formatMoneyOrDash(row.receivableInc),
    decText: formatMoneyOrDash(row.receivableDec),
    balanceText: formatMoney(row.balance),
    hasInc: row.receivableInc > 0,
    hasDec: row.receivableDec > 0,
    navType,
    navId,
    navDocNo,
    canNavigate: !!navType,
    workDetail,
    isProductView: true,
  };
}

module.exports = {
  formatMoney,
  buildPartnerReconList,
  buildPartnerReconBalances,
  summarizePartnerReconBalances,
  filterPartnerReconList,
  buildSettlementReconList,
  buildSettlementReconBalances,
  summarizeSettlementReconBalances,
  computeSettlementOpeningBalance,
  filterSettlementReconList,
  buildPartnerProductLineReconList,
  filterPartnerProductReconList,
  buildSettlementProductLineReconList,
  filterSettlementProductReconList,
  mapPartnerBalancedCard,
  mapSettlementBalancedCard,
  mapProductLineCard,
  mapSummaryView,
  dateRangeToQuery,
  dateToEndExclusiveIso,
  isPartnerReconOutsourceReceiveDocType,
};
