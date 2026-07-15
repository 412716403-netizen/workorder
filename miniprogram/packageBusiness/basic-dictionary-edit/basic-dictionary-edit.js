const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { DICT_KINDS, DICT_KIND_LABEL } = require('../config/dictionaries.js');
const { findDictionaryItemById } = require('../utils/dictionaries.js');
const { prepareDictionaryForSave } = require('../utils/dictionaryForm.js');
const {
  createDictionaryItem,
  updateDictionaryItem,
  deleteDictionaryItem,
} = require('../utils/dictionaryApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function kindIndex(kind) {
  const idx = DICT_KINDS.findIndex((k) => k.id === kind);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    submitting: false,
    pageTitle: '编辑字典项',
    isPersisted: false,
    canDelete: false,
    form: {
      kind: 'color',
      name: '',
    },
    kindNames: DICT_KINDS.map((k) => k.label),
    kindPickerIndex: 0,
    kindLabel: DICT_KIND_LABEL.color,
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
    this._dictId = options.id ? decodeURIComponent(options.id) : '';
    this._defaultKind = options.kind ? decodeURIComponent(options.kind) : 'color';
    if (!DICT_KIND_LABEL[this._defaultKind]) {
      this._defaultKind = 'color';
    }
    this._initialized = false;
    this._dictionaries = { colors: [], sizes: [], units: [] };
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
    if (!hasPermission(ctx.permissions || [], 'basic:dictionaries:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canDelete: hasPermission(ctx.permissions || [], 'basic:dictionaries:delete'),
    });
    if (!this._initialized) {
      this.bootstrap();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const raw = await fetchDictionaries();
      this._dictionaries = normalizeAppDictionaries(raw);

      let item;
      if (this._dictId) {
        item = findDictionaryItemById(this._dictionaries, this._dictId);
        if (!item) {
          wx.showToast({ title: '字典项不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
      } else {
        item = {
          id: '',
          kind: this._defaultKind,
          name: '',
        };
      }

      this._workingItem = {
        kind: item.kind,
        name: item.name || '',
      };
      this.applyUiFromWorking();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  applyUiFromWorking() {
    const item = this._workingItem;
    const kind = item.kind || 'color';
    const idx = kindIndex(kind);
    this.setData({
      loading: false,
      pageTitle: this._dictId ? '编辑字典项' : '新增字典项',
      isPersisted: !!this._dictId,
      form: {
        kind,
        name: item.name || '',
      },
      kindPickerIndex: idx,
      kindLabel: DICT_KIND_LABEL[kind] || kind,
    });
  },

  onNameInput(e) {
    this._workingItem.name = e.detail.value || '';
    this.setData({ 'form.name': this._workingItem.name });
  },

  onKindChange(e) {
    if (this._dictId) return;
    const idx = Number(e.detail.value) || 0;
    const kindDef = DICT_KINDS[idx] || DICT_KINDS[0];
    this._workingItem.kind = kindDef.id;
    this.applyUiFromWorking();
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const perms = (this._tenantCtx && this._tenantCtx.permissions) || [];
    const canCreate = hasPermission(perms, 'basic:dictionaries:create');
    const canEdit = hasPermission(perms, 'basic:dictionaries:edit');
    if (this._dictId && !canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' });
      return;
    }
    if (!this._dictId && !canCreate) {
      wx.showToast({ title: '无创建权限', icon: 'none' });
      return;
    }

    const prepared = prepareDictionaryForSave(
      this._workingItem,
      this._dictionaries,
      this._dictId,
    );
    if (prepared.error) {
      wx.showToast({ title: prepared.error, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (this._dictId) {
        await updateDictionaryItem(this._dictId, prepared.payload);
      } else {
        await createDictionaryItem(prepared.payload);
      }
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.BASIC_DICTIONARIES,
        toastTitle: '保存成功',
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._dictId || this.data.submitting) return;
    const kindLabel = DICT_KIND_LABEL[this._workingItem.kind] || '字典项';
    const name = this._workingItem.name || '';
    wx.showModal({
      title: '删除字典项',
      content: `确定删除${kindLabel}「${name}」？删除后不可恢复；若仍被产品引用，后台将拒绝删除。`,
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          await deleteDictionaryItem(this._dictId);
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.BASIC_DICTIONARIES,
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
