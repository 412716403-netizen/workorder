const { filterPartners } = require('../../utils/filterPartners.js');
const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  SHEET_ANIM_MS,
} = require('../../utils/bottomSheetAnim.js');

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
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    search: '',
    activeTab: 'all',
    filteredPartners: [],
  },
  observers: {
    'partners, categories, search, activeTab': function () {
      this.refreshFiltered();
    },
  },
  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
      if (this._sheetCloseNotifyTimer) {
        clearTimeout(this._sheetCloseNotifyTimer);
        this._sheetCloseNotifyTimer = null;
      }
    },
  },
  methods: {
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
  },
});
