const { filterPartners } = require('../../../utils/filterPartners.js');
const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  SHEET_ANIM_MS,
} = require('../../../utils/bottomSheetAnim.js');
const { readTenantCtx } = require('../../../utils/session.js');
const { hasPermission, isTenantElevatedRole } = require('../../../utils/permissions.js');
const { createPartner } = require('../../../utils/partnerApi.js');
const { findPartnerByName } = require('../../../utils/partnerNormalize.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '加工厂' },
    partners: { type: Array, value: [] },
    categories: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '搜索加工厂名称' },
    disabled: { type: Boolean, value: false },
    embedded: { type: Boolean, value: false },
    cell: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
    /** 下拉内显示「新建」；对账筛选等场景传 false */
    allowQuickCreate: { type: Boolean, value: true },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    search: '',
    activeTab: 'all',
    filteredPartners: [],
    canQuickCreate: false,
    quickCreateOpen: false,
    quickName: '',
    quickCategoryIndex: 0,
    quickCategoryName: '',
    quickCategoryId: '',
    quickCategoryNames: [],
    quickSubmitting: false,
  },
  observers: {
    'partners, categories, search, activeTab': function () {
      this.refreshFiltered();
    },
    categories: function (cats) {
      const list = cats || [];
      this._quickCategoryIds = [''].concat(list.map((c) => c.id || ''));
      this.setData({
        quickCategoryNames: ['请选择分类'].concat(list.map((c) => c.name || '')),
      });
      this.refreshCanQuickCreate();
    },
    allowQuickCreate: function () {
      this.refreshCanQuickCreate();
    },
  },
  lifetimes: {
    attached() {
      this.refreshCanQuickCreate();
    },
    detached() {
      clearBottomSheetTimers(this);
      if (this._sheetCloseNotifyTimer) {
        clearTimeout(this._sheetCloseNotifyTimer);
        this._sheetCloseNotifyTimer = null;
      }
    },
  },
  methods: {
    refreshCanQuickCreate() {
      const allow = this.properties.allowQuickCreate;
      const cats = this.properties.categories || [];
      if (!allow || cats.length === 0) {
        this.setData({ canQuickCreate: false });
        return;
      }
      const ctx = readTenantCtx();
      if (!ctx) {
        this.setData({ canQuickCreate: false });
        return;
      }
      if (isTenantElevatedRole(ctx.tenantRole)) {
        this.setData({ canQuickCreate: true });
        return;
      }
      const perms = ctx.permissions || [];
      const ok =
        hasPermission(perms, 'basic:partners:view') &&
        hasPermission(perms, 'basic:partners:create');
      this.setData({ canQuickCreate: ok });
    },

    refreshFiltered() {
      const categories = this.properties.categories || [];
      const catMap = new Map(categories.map((c) => [c.id, c.name]));
      const filteredPartners = filterPartners(this.properties.partners, {
        search: this.data.search,
        activeTab: this.data.activeTab,
      }).map((p) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        contact: p.contact || '',
        categoryLabel: p.categoryId ? catMap.get(p.categoryId) || '' : '',
      }));
      this.setData({ filteredPartners });
    },

    onOpen() {
      if (this.data.disabled) return;
      this.triggerEvent('sheetopen');
      openBottomSheet(this, { search: '', activeTab: 'all' }, { picker: this.properties.cell });
      this.refreshFiltered();
    },

    onClose() {
      if (!this.data.open) return;
      closeBottomSheet(this, { search: '', activeTab: 'all' });
      if (this._sheetCloseNotifyTimer) {
        clearTimeout(this._sheetCloseNotifyTimer);
      }
      this._sheetCloseNotifyTimer = setTimeout(() => {
        this.triggerEvent('sheetclose');
        this._sheetCloseNotifyTimer = null;
      }, SHEET_ANIM_MS);
    },

    noop() {},

    onSearchInput(e) {
      this.setData({ search: e.detail.value || '' });
    },

    onTabTap(e) {
      const tab = e.currentTarget.dataset.tab;
      if (!tab || tab === this.data.activeTab) return;
      this.setData({ activeTab: tab });
    },

    onSelect(e) {
      const { name, id } = e.currentTarget.dataset;
      if (!name) return;
      this.triggerEvent('change', { name, id });
      this.onClose();
    },

    onQuickCreateOpen() {
      if (!this.data.canQuickCreate || this.data.quickSubmitting) return;
      this.setData({
        quickCreateOpen: true,
        quickName: '',
        quickCategoryIndex: 0,
        quickCategoryName: '',
        quickCategoryId: '',
      });
    },

    onQuickCreateClose() {
      if (this.data.quickSubmitting) return;
      this.setData({
        quickCreateOpen: false,
        quickName: '',
        quickCategoryIndex: 0,
        quickCategoryName: '',
        quickCategoryId: '',
      });
    },

    onQuickNameInput(e) {
      this.setData({ quickName: e.detail.value || '' });
    },

    onQuickCategoryChange(e) {
      const idx = Number(e.detail.value);
      const ids = this._quickCategoryIds || [''];
      const names = this.data.quickCategoryNames || ['请选择分类'];
      const categoryId = String(ids[idx] || '').trim();
      this.setData({
        quickCategoryIndex: idx,
        quickCategoryName: categoryId ? (names[idx] || '') : '',
        quickCategoryId: categoryId,
      });
    },

    async onQuickCreateSubmit() {
      if (this.data.quickSubmitting) return;
      const name = String(this.data.quickName || '').trim();
      if (!name) {
        wx.showToast({ title: '请填写单位名称', icon: 'none' });
        return;
      }
      const categoryId = String(this.data.quickCategoryId || '').trim();
      if (!categoryId) {
        wx.showToast({ title: '请选择合作单位分类', icon: 'none' });
        return;
      }

      const existing = findPartnerByName(this.properties.partners, name);
      if (existing) {
        this.triggerEvent('change', { name: existing.name, id: existing.id });
        this.onQuickCreateClose();
        this.onClose();
        wx.showToast({ title: '单位已存在，已为您选中', icon: 'none' });
        return;
      }

      this.setData({ quickSubmitting: true });
      try {
        const created = await createPartner({
          name,
          contact: '',
          categoryId,
        });
        if (!created || !created.id) {
          throw new Error('创建失败');
        }
        this.triggerEvent('created', { partner: created });
        this.triggerEvent('change', { name: created.name, id: created.id });
        this.onQuickCreateClose();
        this.onClose();
        wx.showToast({ title: '已添加合作单位', icon: 'success' });
      } catch (err) {
        wx.showToast({
          title: (err && err.message) || '创建失败',
          icon: 'none',
        });
      } finally {
        this.setData({ quickSubmitting: false });
      }
    },
  },
});
