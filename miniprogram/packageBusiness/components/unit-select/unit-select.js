const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
} = require('../../../utils/bottomSheetAnim.js');
const { createDictionaryItem } = require('../../utils/dictionaryApi.js');

function filterUnits(units, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return units || [];
  return (units || []).filter((u) => String(u.name || '').toLowerCase().indexOf(q) >= 0);
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    label: { type: String, value: '单位' },
    units: { type: Array, value: [] },
    valueId: { type: String, value: '' },
    valueName: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false },
    cell: { type: Boolean, value: true },
    required: { type: Boolean, value: false },
    canQuickAdd: { type: Boolean, value: true },
  },

  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    search: '',
    filteredUnits: [],
    showQuickAdd: false,
    quickAddName: '',
  },

  observers: {
    'units, search, valueId'() {
      this.refreshFiltered();
    },
  },

  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
    },
  },

  methods: {
    refreshFiltered() {
      this.setData({
        filteredUnits: filterUnits(this.properties.units, this.data.search).map((u) => ({
          id: u.id,
          name: u.name,
          selected: u.id === this.properties.valueId,
        })),
      });
    },

    noop() {},

    onOpen() {
      if (this.properties.disabled) return;
      this.setData({ search: '', showQuickAdd: false, quickAddName: '' });
      this.refreshFiltered();
      openBottomSheet(this);
    },

    onClose() {
      closeBottomSheet(this);
    },

    onSearchInput(e) {
      this.setData({ search: e.detail.value || '' });
    },

    onSelect(e) {
      const { id, name } = e.currentTarget.dataset;
      if (!id) return;
      this.triggerEvent('change', { id, name });
      this.onClose();
    },

    onToggleQuickAdd() {
      this.setData({ showQuickAdd: !this.data.showQuickAdd, quickAddName: '' });
    },

    onQuickAddInput(e) {
      this.setData({ quickAddName: e.detail.value || '' });
    },

    onQuickAddSubmit() {
      const name = String(this.data.quickAddName || '').trim();
      if (!name) {
        wx.showToast({ title: '请输入单位名称', icon: 'none' });
        return;
      }
      const existing = (this.properties.units || []).find((u) => u.name === name);
      if (existing) {
        this.triggerEvent('change', { id: existing.id, name: existing.name });
        this.onClose();
        return;
      }
      if (!this.properties.canQuickAdd) {
        wx.showToast({ title: '无新增单位权限', icon: 'none' });
        return;
      }
      if (this._quickAddBusy) return;
      this._quickAddBusy = true;
      createDictionaryItem({ type: 'unit', name, value: name })
        .then((created) => {
          const unit = { id: created.id, name: created.name || name };
          this.triggerEvent('change', { id: unit.id, name: unit.name });
          this.triggerEvent('unitsupdated', { unit });
          this.setData({ showQuickAdd: false, quickAddName: '' });
          this.onClose();
          wx.showToast({ title: '已添加单位', icon: 'success' });
        })
        .catch((err) => {
          wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
        })
        .finally(() => {
          this._quickAddBusy = false;
        });
    },
  },
});
