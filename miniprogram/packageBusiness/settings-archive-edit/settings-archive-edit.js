const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { getArchiveTabMeta } = require('../utils/settingsArchive.js');
const settingsApi = require('../../utils/settingsApi.js');
const { fetchFeaturePlugins } = require('../../utils/financeApi.js');
const {
  prepareArchiveForSave,
  applyCategoryToggle,
  isCategoryToggleBlocked,
  validateCategoryToggles,
  buildNodeToggles,
  buildNodeToggleUpdates,
  filterCategoryToggles,
  FINANCE_TOGGLES,
} = require('../utils/settingsForm.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { afterSaveReturnToList } = require('../../utils/saveNavigation.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function cloneForm(form) {
  return JSON.parse(JSON.stringify(form || {}));
}

Page({
  data: {
    loading: true,
    submitting: false,
    tabId: '',
    pageTitle: '编辑',
    isPersisted: false,
    canDelete: false,
    canEdit: false,
    canSave: false,
    form: { name: '' },
    categoryToggles: [],
    financeToggles: FINANCE_TOGGLES,
    nodeToggles: [],
    financeKindNames: ['收款单', '付款单'],
    financeKindIndex: 0,
    showCustomFields: false,
    showCategoryToggles: false,
    showFinanceKind: false,
    showFinanceToggles: false,
    showNodeToggles: false,
    showNodeDisplayFields: false,
    customFieldsIdPrefix: 'cf-',
    knowledgeEnabled: false,
    customFieldsShowRequired: false,
    customFieldsShowShowInForm: false,
    customFieldsAllowedTypes: [],
    customFieldsAddLabel: '新增扩展项',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this._tabId = options.tab ? decodeURIComponent(options.tab) : '';
    this._recordId = options.id ? decodeURIComponent(options.id) : '';
    this._initialized = false;
    this._allItems = [];
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    const meta = getArchiveTabMeta(this._tabId);
    if (!meta) {
      wx.showToast({ title: '设置项不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const perms = ctx.permissions || [];
    if (ctx.tenantRole !== 'owner' && !hasPermission(perms, `${meta.permBase}:view`)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this._meta = meta;
    const canEdit =
      ctx.tenantRole === 'owner' || hasPermission(perms, `${meta.permBase}:edit`);
    const canCreate =
      ctx.tenantRole === 'owner' || hasPermission(perms, `${meta.permBase}:create`);
    this.setData({
      tabId: this._tabId,
      canDelete:
        !!this._recordId &&
        (ctx.tenantRole === 'owner' || hasPermission(perms, `${meta.permBase}:delete`)),
      canEdit,
      canSave: this._recordId ? canEdit : canCreate,
    });
    if (!this._initialized) this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    const meta = this._meta;
    try {
      const api = settingsApi[meta.apiKey];
      const plugins = await fetchFeaturePlugins().catch(() => ({}));
      this._plugins = plugins;
      const list = await api.fetchAll();
      this._allItems = list || [];

      let item;
      if (this._recordId) {
        item = this._allItems.find((x) => x.id === this._recordId);
        if (!item) {
          wx.showToast({ title: `${meta.entityLabel}不存在`, icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
      } else {
        item = Object.assign({ id: '' }, meta.defaultCreate);
      }

      this._item = cloneForm(item);
      this.applyUi();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  applyUi() {
    const meta = this._meta;
    const item = this._item;
    const tabId = this._tabId;
    const ctx = this._tenantCtx || {};
    const isPersisted = !!this._recordId;

    const base = {
      loading: false,
      isPersisted,
      pageTitle: isPersisted ? `编辑${meta.entityLabel}` : `新建${meta.entityLabel}`,
      form: item,
      showCustomFields: false,
      showCategoryToggles: false,
      showFinanceKind: false,
      showFinanceToggles: false,
      showNodeToggles: false,
      showNodeDisplayFields: false,
      knowledgeEnabled: !!(this._plugins && this._plugins.knowledge_base !== false),
      customFieldsShowRequired: false,
      customFieldsShowShowInForm: false,
      customFieldsAllowedTypes: [],
      customFieldsAddLabel: '新增扩展项',
    };

    if (tabId === 'warehouses') {
      this.setData(base);
      return;
    }

    if (tabId === 'partner_categories') {
      this.setData(
        Object.assign(base, {
          showCustomFields: true,
          customFieldsShowRequired: true,
          customFieldsShowShowInForm: false,
          customFieldsAddLabel: '增加信息字段',
          customFieldsIdPrefix: `pcf-${item.id || 'new'}-`,
        }),
      );
      return;
    }

    if (tabId === 'categories') {
      this.setData(
        Object.assign(base, {
          showCustomFields: true,
          showCategoryToggles: true,
          customFieldsShowRequired: true,
          customFieldsShowShowInForm: true,
          customFieldsIdPrefix: `cf-${item.id || 'new'}-`,
          categoryToggles: filterCategoryToggles(item, ctx.industryKind || 'generic').map((t) => ({
            key: t.key,
            label: t.label,
            desc: t.desc,
            value: !!item[t.key],
            blocked: isCategoryToggleBlocked(item, t.key, !item[t.key]),
          })),
        }),
      );
      return;
    }

    if (tabId === 'finance_categories') {
      const kindIndex = item.kind === 'PAYMENT' ? 1 : 0;
      this.setData(
        Object.assign(base, {
          showCustomFields: true,
          showFinanceKind: true,
          showFinanceToggles: true,
          financeKindIndex: kindIndex,
          customFieldsShowRequired: true,
          customFieldsShowShowInForm: false,
          customFieldsIdPrefix: `fcf-${item.id || 'new'}-`,
          financeToggles: FINANCE_TOGGLES.map((t) => ({
            key: t.key,
            label: t.label,
            desc: t.desc,
            value: !!item[t.key],
          })),
        }),
      );
      return;
    }

    if (tabId === 'nodes') {
      const traceOn = !(this._plugins && this._plugins.traceability === false);
      const knowledgeOn = !!(this._plugins && this._plugins.knowledge_base !== false);
      const displayTypes = ['text', 'file'];
      if (knowledgeOn) displayTypes.push('knowledge');
      this.setData(
        Object.assign(base, {
          showNodeToggles: true,
          showNodeDisplayFields: true,
          customFieldsShowRequired: false,
          customFieldsShowShowInForm: false,
          customFieldsAllowedTypes: displayTypes,
          customFieldsAddLabel: '增加展示项',
          customFieldsIdPrefix: `node-dt-${item.id || 'new'}-`,
          nodeToggles: buildNodeToggles(item, {
            equipmentFeaturesEnabled: ctx.equipmentFeaturesEnabled !== false,
            traceabilityEnabled: traceOn,
          }),
          form: Object.assign({}, item, {
            reportDisplayTemplate: item.reportDisplayTemplate || [],
          }),
        }),
      );
      return;
    }

    this.setData(base);
  },

  onNameInput(e) {
    this._item.name = e.detail.value || '';
    this.setData({ 'form.name': this._item.name });
  },

  onFinanceKindChange(e) {
    const idx = Number(e.detail.value) || 0;
    this._item.kind = idx === 1 ? 'PAYMENT' : 'RECEIPT';
    this.setData({ financeKindIndex: idx, 'form.kind': this._item.kind });
  },

  onCategoryToggle(e) {
    const { key } = e.currentTarget.dataset;
    const nextVal = !!e.detail.value;
    if (!key || !this.data.canEdit) return;
    if (isCategoryToggleBlocked(this._item, key, nextVal)) {
      wx.showToast({
        title:
          key === 'linkPartner'
            ? '已启用采购价时需保持关联合作单位'
            : '颜色尺码与批次管理互斥',
        icon: 'none',
      });
      this.applyUi();
      return;
    }
    const updates = applyCategoryToggle(this._item, key, nextVal);
    Object.assign(this._item, updates);
    const err = validateCategoryToggles(this._item, {});
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      this.applyUi();
      return;
    }
    this.applyUi();
  },

  onFinanceToggle(e) {
    const { key } = e.currentTarget.dataset;
    if (!key || !this.data.canEdit) return;
    this._item[key] = !!e.detail.value;
    this.applyUi();
  },

  onNodeToggle(e) {
    const { key } = e.currentTarget.dataset;
    if (!key || !this.data.canEdit) return;
    const nextVal = !!e.detail.value;
    const ctx = this._tenantCtx || {};
    const updates = buildNodeToggleUpdates(this._item, key, nextVal, {
      equipmentFeaturesEnabled: ctx.equipmentFeaturesEnabled !== false,
    });
    if (!updates) {
      this.applyUi();
      return;
    }
    Object.assign(this._item, updates);
    this.applyUi();
  },

  onCustomFieldsChange(e) {
    const fields = (e.detail && e.detail.fields) || [];
    if (this._tabId === 'nodes') {
      this._item.reportDisplayTemplate = fields;
    } else {
      this._item.customFields = fields;
    }
    this.setData({ form: cloneForm(this._item) });
  },

  onNodeDisplayFieldsChange(e) {
    this.onCustomFieldsChange(e);
  },

  async onSaveTap() {
    if (this.data.submitting || !this.data.canSave) return;
    const meta = this._meta;
    const isNew = !this._recordId;
    const prepared = prepareArchiveForSave(this._tabId, this._item, this._allItems, isNew);
    if (prepared.error) {
      wx.showToast({ title: prepared.error, icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const api = settingsApi[meta.apiKey];
      if (isNew) {
        await api.create(prepared.payload);
      } else {
        await api.update(this._recordId, prepared.payload);
      }
      afterSaveReturnToList({
        listUrl: meta.listRoute,
        toastTitle: '保存成功',
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || this.data.submitting) return;
    wx.showModal({
      title: '确认删除',
      content: `确定删除该${this._meta.entityLabel}？`,
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          await settingsApi[this._meta.apiKey].delete(this._recordId);
          afterSaveReturnToList({
            listUrl: this._meta.listRoute,
            toastTitle: '已删除',
          });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          this.setData({ submitting: false });
        }
      },
    });
  },
});
