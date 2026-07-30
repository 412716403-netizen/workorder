/**
 * PSI 单据 →「登记收/付款单」页的打开与回传（四类单据编辑页共用）。
 *
 * 用独立页面而非页内底栏：登记表单本身还要弹分类 / 账户 / 产品选择器，
 * 底栏的 transform 会让内层 `position: fixed` 弹层失去视口定位。
 */

const PSI_DOC_FINANCE_ENTRY_PATH = '/packagePsi/psi-doc-finance-entry/psi-doc-finance-entry';
const PSI_DOC_FINANCE_INIT_EVENT = 'psiDocFinanceInit';

/**
 * 打开登记页。
 * @param {object} opts
 * @param {string} opts.psiType PURCHASE_ORDER | PURCHASE_BILL | SALES_ORDER | SALES_BILL
 * @param {string} opts.docNumber 单号（新建态可传预览单号，仅用于备注）
 * @param {string} opts.partner 合作单位名（登记页只读展示）
 * @param {boolean} opts.staged true=单据未落库，登记页只回传 payload 不写库
 * @param {(payload: object) => void} opts.onStage 暂存回调（staged 时触发）
 * @param {() => void} [opts.onSaved] 已落库回调（非 staged 时触发）
 */
function openPsiDocFinanceEntry(opts) {
  const options = opts || {};
  wx.navigateTo({
    url: PSI_DOC_FINANCE_ENTRY_PATH,
    events: {
      psiDocFinanceStaged(detail) {
        if (typeof options.onStage === 'function') {
          options.onStage((detail && detail.payload) || null);
        }
      },
      psiDocFinanceSaved() {
        if (typeof options.onSaved === 'function') options.onSaved();
      },
    },
    success(res) {
      if (res.eventChannel && typeof res.eventChannel.emit === 'function') {
        res.eventChannel.emit(PSI_DOC_FINANCE_INIT_EVENT, {
          psiType: options.psiType || '',
          docNumber: options.docNumber || '',
          partner: options.partner || '',
          staged: options.staged === true,
        });
      }
    },
  });
}

module.exports = {
  PSI_DOC_FINANCE_ENTRY_PATH,
  PSI_DOC_FINANCE_INIT_EVENT,
  openPsiDocFinanceEntry,
};
