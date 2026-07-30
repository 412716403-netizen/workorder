/**
 * 四类单据编辑页的「收付款」入口（对齐 Web PsiDocFinanceSummarySlot）。
 *
 * 页面只需：
 * 1. `data` 展开 `emptyPsiDocFinancePanelState()`
 * 2. `onLoad` 调 `initPsiDocFinancePanel(this, PSI_TYPE)`
 * 3. 页脚合计区展示 `showFinanceAmount / financeShortLabel / financeAmountText`
 * 4. 页脚按钮 `wx:if="{{showFinanceEntry}}"` + `bindtap="onFinanceEntryTap"` → `openPsiDocFinanceEntryFromPage`
 * 5. PSI 保存成功后 `await flushPsiDocFinanceDrafts(page, docNumber)` 再跳列表
 *
 * 新建态收付款先暂存在页面上，随单据保存一并落库；编辑态单号已存在，登记即写库。
 */

const { readTenantCtx } = require('../../utils/session.js');
const { formatMoney } = require('../../utils/financeRecordForm.js');
const {
  psiDocFinanceMeta,
  canCreatePsiDocFinance,
  sumFinanceRecordAmount,
  fetchPsiDocLinkedFinanceAmount,
  flushStagedPsiDocFinance,
} = require('../../utils/psiDocFinance.js');
const { openPsiDocFinanceEntry } = require('./psiDocFinanceEntry.js');

/** 页面 data 初值，展开进 Page({ data }) */
function emptyPsiDocFinancePanelState() {
  return {
    /** 有 create 权限时展示合计区右侧登记图标 */
    showFinanceEntry: false,
    financeEntryLabel: '',
    financeEntryIcon: '/assets/icons/wallet.png',
    /** 已付/已收合计 > 0 时在页脚合计区展示 */
    showFinanceAmount: false,
    financeShortLabel: '',
    financeAmountText: '',
  };
}

function financeEntryIconFor(meta) {
  return meta && meta.financeType === 'RECEIPT'
    ? '/assets/icons/receipt.png'
    : '/assets/icons/wallet.png';
}

/**
 * @param {object} page Page 实例
 * @param {string} psiType PURCHASE_ORDER | PURCHASE_BILL | SALES_ORDER | SALES_BILL
 */
function initPsiDocFinancePanel(page, psiType) {
  const ctx = readTenantCtx();
  const permissions = (ctx && ctx.permissions) || [];
  const meta = psiDocFinanceMeta(psiType);
  page._psiFinanceType = psiType;
  page._psiFinanceMeta = meta;
  page._psiFinanceDrafts = [];
  page._psiFinanceSavedAmount = 0;
  page.setData({
    showFinanceEntry: canCreatePsiDocFinance(psiType, permissions),
    financeEntryLabel: meta.entryLabel,
    financeEntryIcon: financeEntryIconFor(meta),
    showFinanceAmount: false,
    financeShortLabel: meta.shortLabel,
    financeAmountText: '',
  });
}

function refreshPsiDocFinancePanel(page) {
  const meta = page._psiFinanceMeta;
  if (!meta) return;
  const total =
    (page._psiFinanceSavedAmount || 0) + sumFinanceRecordAmount(page._psiFinanceDrafts || []);
  const hasAmount = total > 0;
  page.setData({
    showFinanceAmount: hasAmount,
    financeShortLabel: meta.shortLabel,
    financeAmountText: hasAmount ? formatMoney(total) : '',
    financeEntryLabel: meta.entryLabel,
  });
}

/** 编辑态：按已落库单号反查已收/付合计。无权限或失败按 0 处理。 */
function loadPsiDocFinanceSavedAmount(page, docNumber) {
  if (!page._psiFinanceType) return Promise.resolve(0);
  const ctx = readTenantCtx();
  return fetchPsiDocLinkedFinanceAmount(page._psiFinanceType, docNumber, {
    tenantRole: ctx && ctx.tenantRole,
    permissions: (ctx && ctx.permissions) || [],
  }).then((amount) => {
    page._psiFinanceSavedAmount = amount;
    refreshPsiDocFinancePanel(page);
    return amount;
  });
}

/**
 * 打开登记页。未选合作单位时按 Web 一样拦下（备注与后续对账都依赖合作单位）。
 * @param {object} page
 * @param {{ partner: string, docNumber?: string, saved?: boolean }} doc
 *   `saved` 为 true 表示单据已落库（编辑态），登记即写库
 */
function openPsiDocFinanceEntryFromPage(page, doc) {
  const meta = page._psiFinanceMeta;
  if (!meta) return;
  const partner = String((doc && doc.partner) || '').trim();
  if (!partner) {
    wx.showToast({ title: `请先选择${meta.partnerLabel}`, icon: 'none' });
    return;
  }
  const saved = Boolean(doc && doc.saved);
  openPsiDocFinanceEntry({
    psiType: page._psiFinanceType,
    docNumber: (doc && doc.docNumber) || '',
    partner,
    staged: !saved,
    onStage(payload) {
      if (!payload) return;
      page._psiFinanceDrafts = [...(page._psiFinanceDrafts || []), payload];
      refreshPsiDocFinancePanel(page);
    },
    onSaved() {
      loadPsiDocFinanceSavedAmount(page, (doc && doc.docNumber) || '');
    },
  });
}

/**
 * PSI 保存成功后补写暂存的收/付款。失败不回滚单据，只提示去财务模块补登。
 * @returns {Promise<{ ok: number, fail: number }>}
 */
function flushPsiDocFinanceDrafts(page, docNumber) {
  const drafts = page._psiFinanceDrafts || [];
  if (!drafts.length) return Promise.resolve({ ok: 0, fail: 0 });
  page._psiFinanceDrafts = [];
  return flushStagedPsiDocFinance(drafts, page._psiFinanceType, docNumber).then((result) => {
    // 用 showModal 而非 toast：紧随其后的「保存成功」toast 会把提示顶掉
    if (result.fail > 0) {
      wx.showModal({
        title: '收付款登记未完成',
        content: `单据已保存，但有 ${result.fail} 笔${page._psiFinanceMeta.financeDocLabel}登记失败，请到财务模块补登。`,
        showCancel: false,
      });
    }
    return result;
  });
}

module.exports = {
  emptyPsiDocFinancePanelState,
  initPsiDocFinancePanel,
  refreshPsiDocFinancePanel,
  loadPsiDocFinanceSavedAmount,
  openPsiDocFinanceEntryFromPage,
  flushPsiDocFinanceDrafts,
};
