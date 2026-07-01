const { request } = require('../../utils/request.js');
const { readTenantCtx } = require('../../utils/session.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { getSettingsTab, buildProductionConfigSections } = require('../../config/settingsTabs.js');

function rowSubtitle(item) {
  if (item.categoryName) return item.categoryName;
  if (item.type) return String(item.type);
  if (item.code) return item.code;
  return '';
}

Page({
  data: {
    title: '设置详情',
    sub: '',
    loading: true,
    mode: 'list',
    rows: [],
    sections: [],
    emptyText: '暂无数据',
    hint: '完整编辑请在电脑端系统设置中操作',
  },

  onLoad(options) {
    this._tabId = options.id || '';
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
      mode: tab.type === 'config' ? 'config' : 'list',
    });

    try {
      if (tab.type === 'config') {
        const config = await request({ path: '/settings/config', method: 'GET' });
        const sections = buildProductionConfigSections(config || {});
        this.setData({ sections, loading: false, emptyText: '暂无配置' });
        return;
      }

      const body = await request({ path: tab.listPath, method: 'GET' });
      const list = normalizeListBody(body);
      const rows = list.map((item) => ({
        id: item.id,
        name: item.name || item.title || '未命名',
        subtitle: rowSubtitle(item),
      }));
      this.setData({ rows, loading: false });
    } catch {
      this.setData({ rows: [], sections: [], loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
