const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { getSettingsTab } = require('../../config/settingsTabs.js');
const { fetchSettingsConfig, updateSettingsConfig } = require('../../utils/settingsApi.js');
const { fetchFeaturePlugins } = require('../../utils/financeApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  buildProductionConfigForm,
  clampWeightTolerance,
  normalizeProductEconomicsSettings,
} = require('../../utils/productionConfig.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const paddingPx = Math.ceil((win.windowWidth / 750) * 28);
  return nav.statusBarHeight + nav.navBarHeight + paddingPx;
}

Page({
  data: {
    title: '设置详情',
    sub: '',
    loading: true,
    canEdit: false,
    exceedToggles: [],
    weightEnabled: false,
    weightTolerancePercent: 5,
    costModes: [],
    savingKey: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this._tabId = options.id || 'production';
    if (this._tabId !== 'production') {
      wx.redirectTo({
        url: `/packageBusiness/settings-archive-list/settings-archive-list?id=${encodeURIComponent(this._tabId)}`,
      });
      return;
    }
    this.loadTab();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async loadTab() {
    const tab = getSettingsTab(this._tabId);
    if (!tab) {
      wx.showToast({ title: '设置项不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }

    wx.setNavigationBarTitle({ title: tab.title });

    this.setData({
      title: tab.title,
      sub: tab.sub,
      loading: true,
      canEdit:
        ctx.tenantRole === 'owner' ||
        hasPermission(ctx.permissions || [], 'settings:config:edit'),
    });

    try {
      const [config, plugins] = await Promise.all([
        fetchSettingsConfig(),
        fetchFeaturePlugins(),
      ]);
      this._config = config || {};
      this._plugins = plugins || {};
      const form = buildProductionConfigForm(this._config, this._plugins);
      this.setData({
        exceedToggles: form.exceedToggles,
        weightEnabled: form.weightEnabled,
        weightTolerancePercent: form.weightTolerancePercent,
        costModes: form.costModes,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onExceedToggle(e) {
    if (!this.data.canEdit) return;
    const { key } = e.currentTarget.dataset;
    if (!key || this.data.savingKey) return;
    const nextVal = !!e.detail.value;
    const toggles = this.data.exceedToggles || [];
    const row = toggles.find((t) => t.key === key);
    if (!row || row.value === nextVal) return;
    const prev = toggles.map((t) => Object.assign({}, t));
    this.setData({
      savingKey: key,
      exceedToggles: toggles.map((t) =>
        t.key === key ? Object.assign({}, t, { value: nextVal }) : t,
      ),
    });
    try {
      await updateSettingsConfig(key, nextVal);
      this._config[key] = nextVal;
    } catch (err) {
      this.setData({ exceedToggles: prev });
      wx.showToast({
        title: (err && err.message) || '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ savingKey: '' });
    }
  },

  async onWeightInput(e) {
    if (!this.data.canEdit) return;
    const raw = e.detail.value;
    this.setData({ weightTolerancePercent: raw });
  },

  async onWeightBlur(e) {
    if (!this.data.canEdit) return;
    const prev = clampWeightTolerance(this._config.weightTolerancePercent);
    const next = clampWeightTolerance(e.detail.value);
    this.setData({ weightTolerancePercent: next, savingKey: 'weightTolerancePercent' });
    try {
      await updateSettingsConfig('weightTolerancePercent', next);
      this._config.weightTolerancePercent = next;
    } catch (err) {
      this.setData({ weightTolerancePercent: prev });
      wx.showToast({
        title: (err && err.message) || '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ savingKey: '' });
    }
  },

  async onCostModeTap(e) {
    if (!this.data.canEdit) return;
    const { mode } = e.currentTarget.dataset;
    if (!mode || this.data.savingKey) return;
    const current = normalizeProductEconomicsSettings(this._config.productEconomicsSettings);
    if (current.materialCostMode === mode) return;
    const prevModes = (this.data.costModes || []).map((m) => Object.assign({}, m));
    this.setData({
      savingKey: 'productEconomicsSettings',
      costModes: (this.data.costModes || []).map((m) =>
        Object.assign({}, m, { active: m.mode === mode }),
      ),
    });
    const nextSettings = { materialCostMode: mode };
    try {
      await updateSettingsConfig('productEconomicsSettings', nextSettings);
      this._config.productEconomicsSettings = nextSettings;
    } catch (err) {
      this.setData({ costModes: prevModes });
      wx.showToast({
        title: (err && err.message) || '保存失败',
        icon: 'none',
      });
    } finally {
      this.setData({ savingKey: '' });
    }
  },
});
