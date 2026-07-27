/**
 * 产品编号自动取号（对齐 Web hooks/useProductCodeAutoFill.ts）。
 * 仅新建 + 分类规则 mode=auto 时启用；不做规则配置 UI。
 */

const { getProductCodeRule, buildProductCodePrefix } = require('./productCodeRule.js');
const { nextCode } = require('./productApi.js');

const AUTO_FILL_DEBOUNCE_MS = 400;

/**
 * @param {{ onFill: (code: string) => void }} options
 */
function createProductCodeAutoFill(options) {
  const onFill = options && options.onFill;
  let rules = {};
  let categories = [];
  let partners = [];
  /** @type {{ code: string, prefix: string, serialLength: number } | null} */
  let lastAuto = null;
  let fetchSeq = 0;
  let timer = null;

  function setRules(map) {
    rules = map || {};
  }

  /** 规则可含「合作单位」元素时需要主数据把 supplierId 解析成名称 */
  function setMasterData(data) {
    categories = (data && data.categories) || [];
    partners = (data && data.partners) || [];
  }

  /** 对齐 Web utils/productPartnerDisplay.ts：仅分类开启 linkPartner 时视为有效 */
  function resolvePartnerName(product) {
    const categoryId = (product && product.categoryId) || '';
    const category = categories.find((c) => c.id === categoryId);
    if (!category || !category.linkPartner) return '';
    const supplierId = String((product && product.supplierId) || '').trim();
    if (!supplierId) return '';
    const partner = partners.find((p) => p.id === supplierId);
    return partner ? String(partner.name || '').trim() : '';
  }

  function getAutoState(product, isNew) {
    const rule = getProductCodeRule(rules, product && product.categoryId);
    const autoMode = Boolean(isNew && rule.mode === 'auto' && product && product.categoryId);
    const prefix = autoMode
      ? buildProductCodePrefix(rule, product, { partnerName: resolvePartnerName(product) })
      : '';
    return {
      autoMode,
      prefix,
      serialLength: rule.serialLength,
      rule,
    };
  }

  function fetchAndFill(prefix, serialLength) {
    const seq = ++fetchSeq;
    return nextCode({ prefix, serialLength })
      .then((res) => {
        if (seq !== fetchSeq) return;
        const code = res && res.code != null ? String(res.code) : '';
        if (!code) return;
        const prevAutoCode = lastAuto && lastAuto.code;
        lastAuto = { code, prefix, serialLength };
        if (typeof onFill === 'function') onFill(code, prevAutoCode);
      })
      .catch((err) => {
        console.warn('产品编号自动取号失败', err);
      });
  }

  /**
   * @param {object} product
   * @param {boolean} isNew
   * @param {{ force?: boolean }} [opts]
   */
  function schedule(product, isNew, opts) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const state = getAutoState(product, isNew);
    if (!state.autoMode) return state;

    const force = opts && opts.force;
    const currentName = String((product && product.name) || '').trim();

    if (!force) {
      // 手改过（且非空）不自动覆盖；清空后恢复自动取号
      if (currentName && (!lastAuto || currentName !== lastAuto.code)) return state;
      // 已是当前规则下的自动号，规则/前缀没变则不重取
      if (
        currentName &&
        lastAuto &&
        lastAuto.prefix === state.prefix &&
        lastAuto.serialLength === state.serialLength
      ) {
        return state;
      }
    }

    timer = setTimeout(() => {
      timer = null;
      fetchAndFill(state.prefix, state.serialLength);
    }, force ? 0 : AUTO_FILL_DEBOUNCE_MS);
    return state;
  }

  function refresh(product, isNew) {
    const state = getAutoState(product, isNew);
    if (!state.autoMode) return state;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fetchAndFill(state.prefix, state.serialLength);
    return state;
  }

  function buildCodeAutoGenPayload(product, isNew) {
    const state = getAutoState(product, isNew);
    if (!state.autoMode) return null;
    const name = String((product && product.name) || '').trim();
    if (!name || !lastAuto || name !== lastAuto.code) return null;
    return { prefix: state.prefix, serialLength: state.serialLength };
  }

  /** 是否显示「重新取号」：自动模式且未手改（空或仍是最近自动号） */
  function isAutoCodeActive(product, isNew) {
    const state = getAutoState(product, isNew);
    if (!state.autoMode) return false;
    const name = String((product && product.name) || '').trim();
    if (!name) return true;
    return Boolean(lastAuto && name === lastAuto.code);
  }

  function dispose() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fetchSeq += 1;
  }

  /** 新建页重新 bootstrap 时清空手改/最近取号状态 */
  function reset() {
    dispose();
    lastAuto = null;
  }

  return {
    setRules,
    setMasterData,
    getAutoState,
    schedule,
    refresh,
    buildCodeAutoGenPayload,
    isAutoCodeActive,
    dispose,
    reset,
  };
}

module.exports = {
  AUTO_FILL_DEBOUNCE_MS,
  createProductCodeAutoFill,
};
