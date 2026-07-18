const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
} = require('../../../utils/bottomSheetAnim.js');

function filterItems(items, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return items || [];
  return (items || []).filter((it) => String(it.name || '').toLowerCase().indexOf(q) >= 0);
}

function buildSummaryLabels(ids, items) {
  return (ids || [])
    .map((id) => {
      const it = (items || []).find((x) => x.id === id);
      return (it && it.name) || '';
    })
    .filter(Boolean)
    .join('、');
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    colorIds: { type: Array, value: [] },
    sizeIds: { type: Array, value: [] },
    colors: { type: Array, value: [] },
    sizes: { type: Array, value: [] },
    readOnly: { type: Boolean, value: false },
    canQuickAdd: { type: Boolean, value: true },
  },

  data: {
    colorSummary: '',
    sizeSummary: '',
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    pickerKind: '',
    pickerTitle: '',
    search: '',
    searchPlaceholder: '',
    emptyHint: '',
    quickAddLabel: '',
    confirmLabel: '确定',
    selectedCount: 0,
    selectedMap: {},
    selectedOrder: [],
    filteredItems: [],
    pickerSelectedLabels: [],
    showQuickAdd: false,
    quickAddName: '',
  },

  observers: {
    'colorIds, sizeIds, colors, sizes'() {
      this._refreshSummaries();
      if (this.data.open) this._syncPickerFromProps();
    },
  },

  lifetimes: {
    attached() {
      this._refreshSummaries();
    },
    detached() {
      clearBottomSheetTimers(this);
    },
  },

  methods: {
    _refreshSummaries() {
      const colorIds = this.properties.colorIds || [];
      const sizeIds = this.properties.sizeIds || [];
      this.setData({
        colorSummary: buildSummaryLabels(colorIds, this.properties.colors),
        sizeSummary: buildSummaryLabels(sizeIds, this.properties.sizes),
      });
    },

    _buildSelectedState(ids) {
      const selectedOrder = [...(ids || [])];
      const selectedMap = {};
      selectedOrder.forEach((id) => {
        selectedMap[id] = true;
      });
      return { selectedMap, selectedOrder };
    },

    _syncPickerFromProps() {
      const kind = this.data.pickerKind;
      if (!kind) return;
      const propIds = kind === 'color' ? (this.properties.colorIds || []) : (this.properties.sizeIds || []);
      const selectedOrder = [...(this.data.selectedOrder || [])];
      const selectedMap = { ...(this.data.selectedMap || {}) };
      propIds.forEach((id) => {
        if (!selectedMap[id]) {
          selectedMap[id] = true;
          selectedOrder.push(id);
        }
      });
      this.setData({ selectedMap, selectedOrder });
      this._refreshPickerList();
    },

    _refreshPickerList() {
      const kind = this.data.pickerKind;
      const items = kind === 'color' ? (this.properties.colors || []) : (this.properties.sizes || []);
      const selectedMap = this.data.selectedMap || {};
      const selectedOrder = (this.data.selectedOrder || []).filter((id) => selectedMap[id]);
      const filteredItems = filterItems(items, this.data.search).map((it) => ({
        id: it.id,
        name: it.name,
        value: it.value,
        selected: !!selectedMap[it.id],
      }));
      const pickerSelectedLabels = selectedOrder.map((id) => {
        const it = items.find((x) => x.id === id);
        return {
          id,
          name: (it && it.name) || '（未命名）',
          value: (it && it.value) || '#ccc',
        };
      });
      const selectedCount = selectedOrder.length;
      this.setData({
        filteredItems,
        pickerSelectedLabels,
        selectedCount,
        selectedOrder,
        confirmLabel: selectedCount > 0 ? `确定(${selectedCount})` : '确定',
      });
    },

    noop() {},

    onOpenColorPicker() {
      if (this.properties.readOnly) return;
      this._openPicker(
        'color',
        '选择颜色',
        '搜索颜色名称',
        '暂无颜色，可点击下方新增',
        '＋ 新增颜色',
        this.properties.colorIds || [],
      );
    },

    onOpenSizePicker() {
      if (this.properties.readOnly) return;
      this._openPicker(
        'size',
        '选择尺码',
        '搜索尺码名称',
        '暂无尺码，可点击下方新增',
        '＋ 新增尺码',
        this.properties.sizeIds || [],
      );
    },

    _openPicker(kind, title, searchPlaceholder, emptyHint, quickAddLabel, selectedIds) {
      const selected = this._buildSelectedState(selectedIds);
      this.setData({
        pickerKind: kind,
        pickerTitle: title,
        searchPlaceholder,
        emptyHint,
        quickAddLabel,
        search: '',
        showQuickAdd: false,
        quickAddName: '',
        selectedMap: selected.selectedMap,
        selectedOrder: selected.selectedOrder,
      });
      this._refreshPickerList();
      openBottomSheet(this, {}, { picker: true });
    },

    onClose() {
      closeBottomSheet(this, {
        pickerKind: '',
        search: '',
        showQuickAdd: false,
        quickAddName: '',
        selectedCount: 0,
        confirmLabel: '确定',
      });
    },

    onSearchInput(e) {
      this.setData({ search: e.detail.value || '' });
      this._refreshPickerList();
    },

    onItemTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      const selectedMap = { ...(this.data.selectedMap || {}) };
      let selectedOrder = [...(this.data.selectedOrder || [])];
      if (selectedMap[id]) {
        delete selectedMap[id];
        selectedOrder = selectedOrder.filter((x) => x !== id);
      } else {
        selectedMap[id] = true;
        selectedOrder.push(id);
      }
      this.setData({ selectedMap, selectedOrder });
      this._refreshPickerList();
    },

    onSelectedChipTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      const selectedMap = { ...(this.data.selectedMap || {}) };
      delete selectedMap[id];
      const selectedOrder = (this.data.selectedOrder || []).filter((x) => x !== id);
      this.setData({ selectedMap, selectedOrder });
      this._refreshPickerList();
    },

    onClearSelected() {
      this.setData({ selectedMap: {}, selectedOrder: [] });
      this._refreshPickerList();
    },

    onPickerConfirm() {
      const ids = (this.data.selectedOrder || []).filter((id) => this.data.selectedMap[id]);
      this.triggerEvent('change', { kind: this.data.pickerKind, ids });
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
        wx.showToast({ title: '请输入名称', icon: 'none' });
        return;
      }
      const items = this.data.pickerKind === 'color'
        ? (this.properties.colors || [])
        : (this.properties.sizes || []);
      const existing = items.find((it) => it.name === name);
      if (existing) {
        const selectedMap = { ...(this.data.selectedMap || {}) };
        let selectedOrder = [...(this.data.selectedOrder || [])];
        if (!selectedMap[existing.id]) {
          selectedMap[existing.id] = true;
          selectedOrder.push(existing.id);
        }
        this.setData({ selectedMap, selectedOrder, showQuickAdd: false, quickAddName: '' });
        this._refreshPickerList();
        return;
      }
      if (!this.properties.canQuickAdd) {
        wx.showToast({ title: '无新增权限', icon: 'none' });
        return;
      }
      const pendingIds = (this.data.selectedOrder || []).filter((id) => this.data.selectedMap[id]);
      this.triggerEvent('quickadd', { kind: this.data.pickerKind, name, pendingIds });
      this.setData({ showQuickAdd: false, quickAddName: '' });
    },
  },
});
