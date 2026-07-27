/**
 * PSI 四单（采购订单 / 采购入库 / 销售订单 / 销售单）↔ 收付款联动。
 * 对齐 Web utils/psiDocFinanceNote.ts + views/psi-ops/PsiDocFinanceSummarySlot.tsx。
 *
 * 口径：
 * - 采购侧登记**付款单**，销售侧登记**收款单**；
 * - 财务记录以 `sourceDocNo = PSI 单号` 关联，一单可多笔，表单/详情展示的是**合计金额**；
 * - 新建单据时单号尚未落库，收付款先暂存，PSI 保存成功后按真实单号补写（见 flushStagedPsiDocFinance）。
 */

const { canViewDocList, isTenantElevatedRole, hasPermission } = require('./permissions.js');

/** 与 shared/types.ts PSI_DOC_FINANCE_OP_TYPE 一致 */
const PSI_DOC_FINANCE_OP_TYPE = {
  PURCHASE_ORDER: 'PAYMENT',
  PURCHASE_BILL: 'PAYMENT',
  SALES_ORDER: 'RECEIPT',
  SALES_BILL: 'RECEIPT',
};

/** 与 shared/types.ts PSI_ORDER_BILL_DOC_LABEL 一致 */
const PSI_ORDER_BILL_DOC_LABEL = {
  PURCHASE_ORDER: '采购订单',
  PURCHASE_BILL: '采购入库',
  SALES_ORDER: '销售订单',
  SALES_BILL: '销售单',
};

const FINANCE_OP_META = {
  PAYMENT: {
    financeType: 'PAYMENT',
    financeDocLabel: '付款单',
    entryLabel: '登记付款单',
    shortLabel: '已付款',
    amountLabel: '已付款金额',
    partnerLabel: '供应商',
    permBase: 'finance:payment',
  },
  RECEIPT: {
    financeType: 'RECEIPT',
    financeDocLabel: '收款单',
    entryLabel: '登记收款单',
    shortLabel: '已收款',
    amountLabel: '已收款金额',
    partnerLabel: '客户',
    permBase: 'finance:receipt',
  },
};

/**
 * 单据类型 → 收付款展示口径。
 * @param {string} psiType PURCHASE_ORDER | PURCHASE_BILL | SALES_ORDER | SALES_BILL
 */
function psiDocFinanceMeta(psiType) {
  const opType = PSI_DOC_FINANCE_OP_TYPE[psiType] || 'RECEIPT';
  const meta = FINANCE_OP_META[opType];
  return {
    ...meta,
    docTypeLabel: PSI_ORDER_BILL_DOC_LABEL[psiType] || '单据',
    createPermission: `${meta.permBase}:create`,
  };
}

/** 备注默认文案：关联{单据类型} {单号}；无单号时仅写关联{单据类型} */
function buildPsiDocFinanceNote(psiType, docNumber) {
  const label = PSI_ORDER_BILL_DOC_LABEL[psiType] || '单据';
  const no = String(docNumber == null ? '' : docNumber).trim();
  return no ? `关联${label} ${no}` : `关联${label}`;
}

/** 能否登记收/付款（与 packageFinance 收付款登记页同一口径） */
function canCreatePsiDocFinance(psiType, permissions) {
  return hasPermission(permissions || [], psiDocFinanceMeta(psiType).createPermission);
}

/**
 * 能否按 sourceDocNo 反查关联收/付款。
 * 无对应财务查看权限时不应发起请求（列表接口要求 finance 下任一权限，否则 403）。
 */
function canReadPsiDocLinkedFinance(psiType, tenantRole, permissions) {
  if (isTenantElevatedRole(tenantRole)) return true;
  return canViewDocList(permissions, psiDocFinanceMeta(psiType).permBase);
}

function sumFinanceRecordAmount(records) {
  return (records || []).reduce((sum, rec) => sum + (Number(rec && rec.amount) || 0), 0);
}

/**
 * 详情页「基础信息」里的已收款/已付款行。金额为 0 时返回空数组，便于直接展开。
 * 与 Web 一致：只受财务查看权限约束，不受 PSI 金额权限（psi:*:amount）约束。
 */
function psiDocLinkedFinanceRows(psiType, amount) {
  const value = Number(amount) || 0;
  if (value <= 0) return [];
  const { formatMoney } = require('./financeRecordForm.js');
  return [{ label: psiDocFinanceMeta(psiType).amountLabel, value: formatMoney(value) }];
}

/**
 * 拉取该单据已关联的收/付款合计金额。无权限 / 无单号 / 请求失败均返回 0，
 * 让调用方无需分支处理（金额为 0 时界面不展示该项，与 Web 一致）。
 * @returns {Promise<number>}
 */
function fetchPsiDocLinkedFinanceAmount(psiType, docNumber, ctx) {
  const docNo = String(docNumber || '').trim();
  if (!docNo) return Promise.resolve(0);
  const tenantRole = ctx && ctx.tenantRole;
  const permissions = (ctx && ctx.permissions) || [];
  if (!canReadPsiDocLinkedFinance(psiType, tenantRole, permissions)) return Promise.resolve(0);
  const { fetchAllFinanceRecords } = require('./financeApi.js');
  return fetchAllFinanceRecords({
    sourceDocNo: docNo,
    type: psiDocFinanceMeta(psiType).financeType,
  })
    .then((records) => sumFinanceRecordAmount(records))
    .catch(() => 0);
}

/**
 * 暂存草稿落库前的重写：换成真实单号，备注仍是默认文案时一并跟上。
 * 暂存时用的是预览单号（`draft.sourceDocNo`），可能与最终落库单号不一致。
 */
function retargetStagedPsiDocFinance(draft, psiType, docNo) {
  const note = (draft.note || '').trim();
  const wasDefaultNote =
    !note ||
    note === buildPsiDocFinanceNote(psiType, '') ||
    note === buildPsiDocFinanceNote(psiType, draft.sourceDocNo);
  return {
    ...draft,
    sourceDocNo: docNo,
    note: wasDefaultNote ? buildPsiDocFinanceNote(psiType, docNo) : note,
  };
}

/**
 * 保存 PSI 单据后补写暂存的收/付款（对齐 Web flushStagedFinanceDrafts）。
 * 单笔失败不阻断其余，返回 `{ ok, fail }` 由调用方提示。
 * @param {Array<object>} drafts buildFinanceSavePayload 的产出
 * @param {string} psiType 用于生成备注文案
 * @param {string} docNumber PSI 单据实际落库单号
 * @returns {Promise<{ ok: number, fail: number }>}
 */
function flushStagedPsiDocFinance(drafts, psiType, docNumber) {
  const list = (drafts || []).filter(Boolean);
  const docNo = String(docNumber || '').trim();
  if (!list.length || !docNo) return Promise.resolve({ ok: 0, fail: 0 });
  const { createFinanceRecord } = require('./financeApi.js');
  const result = { ok: 0, fail: 0 };
  return list
    .reduce(
      (chain, draft) =>
        chain.then(() =>
          createFinanceRecord(retargetStagedPsiDocFinance(draft, psiType, docNo))
            .then(() => {
              result.ok += 1;
            })
            .catch(() => {
              result.fail += 1;
            }),
        ),
      Promise.resolve(),
    )
    .then(() => result);
}

module.exports = {
  PSI_DOC_FINANCE_OP_TYPE,
  PSI_ORDER_BILL_DOC_LABEL,
  psiDocFinanceMeta,
  buildPsiDocFinanceNote,
  canCreatePsiDocFinance,
  canReadPsiDocLinkedFinance,
  sumFinanceRecordAmount,
  psiDocLinkedFinanceRows,
  fetchPsiDocLinkedFinanceAmount,
  retargetStagedPsiDocFinance,
  flushStagedPsiDocFinance,
};
