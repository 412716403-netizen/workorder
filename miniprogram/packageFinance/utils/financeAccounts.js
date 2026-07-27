/**
 * 资金账户（对齐 Web views/finance/AccountBalancesTab + AccountTransferModal）
 * 余额 = 期初 + 累计收 − 累计付，由后端 /finance/account-balances 实时聚合。
 */

const { formatMoney, formatFinanceTimestamp } = require('./financeRecords.js');
const { buildAccountSelectRows } = require('../../utils/financeRecordForm.js');

/** 与 shared/types.ts FINANCE_UNASSIGNED_ACCOUNT_KEY 一致（小程序无法直接引 TS） */
const UNASSIGNED_ACCOUNT_KEY = '__unassigned__';

/** 转账自动备注前缀（与后端 finance.service createTransfer 默认 note 一致） */
const TRANSFER_NOTE_PREFIX = '账户转账：';

const PERIODS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

/** 期间枚举 → ISO 时间范围；「全部」返回空对象。周以周一为起点（与 Web 一致）。 */
function periodRange(period) {
  if (!period || period === 'all') return {};
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  } else if (period === 'month') {
    start.setDate(1);
  }
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

/**
 * 资金账户 Tab 可见性 — 对齐 Web FinanceView canViewAccountTab：
 * 模块级 finance 授权仅在「无任何 finance:* 细粒度」时放行；
 * 一旦配置了细粒度，必须显式勾选 finance:account:view。owner 恒可见。
 */
function canViewFundsAccount(tenantRole, permissions) {
  if (tenantRole === 'owner') return true;
  const perms = Array.isArray(permissions) ? permissions : [];
  if (!perms.length) return true;
  if (perms.includes('finance:account:view')) return true;
  const hasModuleGrant = perms.includes('finance');
  const hasFineGrained = perms.some((p) => String(p).indexOf('finance:') === 0);
  return hasModuleGrant && !hasFineGrained;
}

/** 收支账户类型维护权限 — 对齐 Web FinanceView hasSettingsPerm（owner 全开） */
function hasAccountTypePerm(tenantRole, permissions, action) {
  if (tenantRole === 'owner') return true;
  if (!permissions) return true;
  const perm = `settings:finance_account_types:${action}`;
  if (permissions.includes(perm)) return true;
  return permissions.includes('settings');
}

/** 余额列表 UI 模型：账户行 + 合计 + 未归账行 */
function mapBalancesResult(data, period) {
  const accounts = (data && data.accounts) || [];
  const totals = (data && data.totals) || null;
  const unassigned = (data && data.unassigned) || null;
  const isAll = !period || period === 'all';

  const rows = accounts.map((acc) => ({
    accountTypeId: acc.accountTypeId,
    name: acc.name,
    accountKind: acc.accountKind || '',
    showKind: Boolean(acc.accountKind),
    metaText: `期初 ${formatMoney(acc.openingBalance)} · 流入 ${formatMoney(acc.inflow)} · 流出 ${formatMoney(acc.outflow)}`,
    balanceText: formatMoney(acc.balance),
    balanceNegative: Number(acc.balance) < 0,
  }));

  const hasUnassigned = Boolean(
    unassigned && (Number(unassigned.inflow) !== 0 || Number(unassigned.outflow) !== 0)
  );
  const unassignedRow = hasUnassigned
    ? {
        accountTypeId: UNASSIGNED_ACCOUNT_KEY,
        name: '未归账',
        accountKind: '未选账户',
        showKind: true,
        metaText: `流入 ${formatMoney(unassigned.inflow)} · 流出 ${formatMoney(unassigned.outflow)} · 未计入账户余额`,
        balanceText: formatMoney(Number(unassigned.inflow) - Number(unassigned.outflow)),
        balanceLabel: '净额',
        balanceNegative: Number(unassigned.inflow) - Number(unassigned.outflow) < 0,
      }
    : null;

  const totalsView = totals
    ? [
        { key: 'opening', label: isAll ? '期初合计' : '期初余额', value: formatMoney(totals.openingBalance), tone: 'plain' },
        { key: 'inflow', label: isAll ? '累计流入' : '本期流入', value: formatMoney(totals.inflow), tone: 'in' },
        { key: 'outflow', label: isAll ? '累计流出' : '本期流出', value: formatMoney(totals.outflow), tone: 'out' },
        { key: 'balance', label: '当前余额合计', value: formatMoney(totals.balance), tone: 'primary' },
      ]
    : [];

  return { rows, unassignedRow, hasUnassigned, totalsView };
}

/** 从流水 customData 读取转账信息（与 Web readTransfer 一致） */
function readTransferInfo(rec) {
  const cd = rec && rec.customData && typeof rec.customData === 'object' ? rec.customData : {};
  return {
    transfer: cd.transfer === true,
    counterpart: cd.counterpartAccountName || '',
    direction: cd.direction || '',
    transferGroupId: cd.transferGroupId || (rec && rec.relatedId) || '',
    counterpartAccountId: cd.counterpartAccountId || '',
  };
}

/** 账户流水行 UI 模型 */
function mapAccountFlowCard(rec, ctx) {
  const categoryMap = (ctx && ctx.categoryMap) || new Map();
  const t = readTransferInfo(rec);
  const isReceipt = rec.type === 'RECEIPT';
  const cat = rec.categoryId ? categoryMap.get(rec.categoryId) : null;
  const typeLabel = t.transfer
    ? `账户转账（${t.direction === 'in' ? '转入' : '转出'}）`
    : (cat && cat.name) || (isReceipt ? '收款单' : '付款单');
  const amount = Number(rec.amount) || 0;

  return {
    id: rec.id,
    recType: rec.type,
    docNo: rec.docNo || rec.id || '',
    timestampText: formatFinanceTimestamp(rec.timestamp),
    typeLabel,
    counterparty: t.transfer ? t.counterpart || '—' : (rec.partner || '').trim() || '—',
    amountText: `${isReceipt ? '+' : '-'}${formatMoney(amount)}`,
    isReceipt,
    isTransfer: t.transfer,
    transferGroupId: t.transferGroupId,
    note: (rec.note || '').trim(),
    showNote: Boolean((rec.note || '').trim()) && !t.transfer,
  };
}

/**
 * 从转账流水还原编辑入参（与 Web handleEditTransfer 一致）：
 * out 腿 self=转出、对方=转入；in 腿相反。信息不全返回 null。
 */
function buildTransferEditParams(rec) {
  const t = readTransferInfo(rec);
  const selfAcc = rec && rec.accountTypeId;
  if (!t.transfer || !t.transferGroupId || !selfAcc || !t.counterpartAccountId) return null;
  const isOut = t.direction === 'out';
  const rawNote = (rec.note || '').trim();
  return {
    transferGroupId: t.transferGroupId,
    fromAccountId: isOut ? selfAcc : t.counterpartAccountId,
    toAccountId: isOut ? t.counterpartAccountId : selfAcc,
    amount: Number(rec.amount) || 0,
    // 自动生成的「账户转账：X → Y」默认备注视为空，避免编辑时回填冗余文案
    note: rawNote && rawNote.indexOf(TRANSFER_NOTE_PREFIX) !== 0 ? rawNote : '',
  };
}

/** 转账表单校验：返回错误文案，空串表示通过 */
function validateTransferForm(form) {
  if (!form.fromAccountId || !form.toAccountId) return '请选择转出与转入账户';
  if (form.fromAccountId === form.toAccountId) return '转出与转入账户不能相同';
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return '转账金额必须大于 0';
  return '';
}

/** 转出/转入账户 picker 选项（复用收付款排序口径） */
function buildTransferAccountOptions(accountTypes) {
  const list = (accountTypes || []).filter((a) => a && a.id && a.active !== false);
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return {
    names: ['请选择账户…', ...list.map((a) => a.name)],
    ids: ['', ...list.map((a) => a.id)],
  };
}

/** ISO/时间戳 → yyyy-MM-dd（账户类型期初日期展示与 picker 值） */
function toDateYmd(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const m = `0${d.getMonth() + 1}`.slice(-2);
  const day = `0${d.getDate()}`.slice(-2);
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 账户类型行 UI 模型 */
function mapAccountTypeRow(acc) {
  const openingDateText = toDateYmd(acc.openingDate);
  return {
    id: acc.id,
    name: acc.name,
    accountKind: acc.accountKind || '',
    showKind: Boolean(acc.accountKind),
    metaText: `期初 ${formatMoney(acc.initialBalance)}${openingDateText ? ` · ${openingDateText}` : ''}`,
  };
}

/** 账户类型表单校验（名称必填 + 租户内不重名） */
function validateAccountTypeForm(form, accountTypes, excludeId) {
  const name = (form.name || '').trim();
  if (!name) return '请填写账户名称';
  const conflict = (accountTypes || []).some(
    (a) => a && a.id !== excludeId && (a.name || '').trim() === name
  );
  if (conflict) return `账户类型"${name}"已存在`;
  if ((form.initialBalance || '').trim() !== '' && !Number.isFinite(Number(form.initialBalance))) {
    return '期初余额格式不正确';
  }
  return '';
}

/** 账户类型保存 payload（与 Web AccountTypesModal 口径一致） */
function buildAccountTypePayload(form) {
  return {
    name: (form.name || '').trim(),
    initialBalance: (form.initialBalance || '').trim() === '' ? 0 : Number(form.initialBalance),
    openingDate: form.openingDate || null,
    accountKind: (form.accountKind || '').trim() || null,
  };
}

module.exports = {
  UNASSIGNED_ACCOUNT_KEY,
  TRANSFER_NOTE_PREFIX,
  PERIODS,
  periodRange,
  canViewFundsAccount,
  hasAccountTypePerm,
  mapBalancesResult,
  buildAccountSelectRows,
  readTransferInfo,
  mapAccountFlowCard,
  buildTransferEditParams,
  validateTransferForm,
  buildTransferAccountOptions,
  toDateYmd,
  mapAccountTypeRow,
  validateAccountTypeForm,
  buildAccountTypePayload,
};
