/**
 * 采购入库批次选择（对齐 Web MaterialIssueBatchSelect mode="return"）
 * 点击字段打开弹窗：可选已有批次，或在弹窗内输入新批号。
 */

const { fetchStockBatches } = require('../../utils/orderApi.js');
const {
  mergeWarehouseBatchOptions,
} = require('../../utils/materialIssueBatch.js');
const { BATCH_NO_UNTAGGED } = require('../../utils/materialStockConfirm.js');
const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
} = require('../../utils/bottomSheetAnim.js');

function filterBatchOptions(options, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return options || [];
  return (options || []).filter((o) =>
    String(o.batchNo || '').toLowerCase().includes(kw)
    || String(o.label || '').toLowerCase().includes(kw));
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    value: { type: String, value: '' },
    productId: { type: String, value: '' },
    warehouseId: { type: String, value: '' },
    placeholder: { type: String, value: '选择批次' },
    mergeBatches: { type: Array, value: [] },
  },

  data: {
    batchOptions: [],
    filteredOptions: [],
    draftInput: '',
    displayText: '',
    hasValue: false,
    loading: false,
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
  },

  observers: {
    'productId, warehouseId, mergeBatches': function onDepsChange() {
      this.loadBatchOptions();
    },
    value(val) {
      this.refreshDisplay(val);
    },
  },

  lifetimes: {
    attached() {
      this.refreshDisplay(this.properties.value);
      this.loadBatchOptions();
    },
    detached() {
      clearBottomSheetTimers(this);
    },
  },

  methods: {
    noop() {},

    refreshDisplay(val) {
      const text = String(val || '').trim();
      if (!text) {
        this.setData({ displayText: '', hasValue: false });
        return;
      }
      this.setData({
        displayText: text,
        hasValue: true,
      });
    },

    applyFilteredOptions(keyword) {
      this.setData({
        filteredOptions: filterBatchOptions(this.data.batchOptions, keyword),
      });
    },

    loadBatchOptions() {
      const productId = String(this.properties.productId || '').trim();
      const warehouseId = String(this.properties.warehouseId || '').trim();
      if (!productId || !warehouseId) {
        this.setData({ batchOptions: [], filteredOptions: [], loading: false });
        return;
      }

      this.setData({ loading: true });
      fetchStockBatches({ productId, warehouseId })
        .then((raw) => {
          const batchOptions = mergeWarehouseBatchOptions(raw, this.properties.mergeBatches);
          this.setData({ loading: false, batchOptions });
          this.applyFilteredOptions(this.data.draftInput);
        })
        .catch(() => {
          const batchOptions = mergeWarehouseBatchOptions([], this.properties.mergeBatches);
          this.setData({ loading: false, batchOptions });
          this.applyFilteredOptions(this.data.draftInput);
        });
    },

    onOpenSheet() {
      const warehouseId = String(this.properties.warehouseId || '').trim();
      const productId = String(this.properties.productId || '').trim();
      if (!warehouseId) {
        wx.showToast({ title: '请先选择入库仓库', icon: 'none' });
        return;
      }
      if (!productId) {
        wx.showToast({ title: '请先选择产品', icon: 'none' });
        return;
      }
      const raw = String(this.properties.value || '').trim();
      const draftInput = raw === BATCH_NO_UNTAGGED ? '' : raw;
      this.setData({ draftInput });
      this.loadBatchOptions();
      openBottomSheet(this, { draftInput }, { picker: true });
      this.applyFilteredOptions(draftInput);
    },

    onCloseSheet() {
      closeBottomSheet(this);
    },

    onDraftInput(e) {
      const draftInput = e.detail.value != null ? String(e.detail.value) : '';
      this.setData({ draftInput });
      this.applyFilteredOptions(draftInput);
    },

    commitValue(raw) {
      const trimmed = String(raw ?? '').trim();
      const value = trimmed || BATCH_NO_UNTAGGED;
      this.triggerEvent('change', { value });
      closeBottomSheet(this);
    },

    onConfirmDraft() {
      const draft = String(this.data.draftInput || '').trim();
      this.commitValue(draft);
    },

    onSelectOption(e) {
      const batchNo = e.currentTarget.dataset.batchNo;
      if (!batchNo) return;
      this.commitValue(batchNo);
    },
  },
});
