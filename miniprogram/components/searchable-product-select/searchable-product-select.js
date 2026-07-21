const { filterProducts } = require('../../utils/filterProducts.js');
const { mapProductCustomTags } = require('../../utils/reportCustomDocField.js');
const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  SHEET_ANIM_MS,
} = require('../../utils/bottomSheetAnim.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../../utils/listProductThumb.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '产品' },
    products: { type: Array, value: [] },
    categories: { type: Array, value: [] },
    valueId: { type: String, value: '' },
    valueName: { type: String, value: '' },
    placeholder: { type: String, value: '搜索产品编号或 SKU' },
    disabled: { type: Boolean, value: false },
    embedded: { type: Boolean, value: false },
    cell: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
    lineIndex: { type: Number, value: -1 },
    blockedProductIds: { type: Array, value: [] },
    unavailableProductIds: { type: Array, value: [] },
  },
  data: {
    productPlaceholderIcon: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    search: '',
    activeTab: 'all',
    filteredProducts: [],
    displayName: '',
    displaySku: '',
    displayText: '',
    hasDisplayValue: false,
    sheetTitle: '产品',
  },
  observers: {
    'label': function (label) {
      const title = String(label || '').trim() || '产品';
      this.setData({ sheetTitle: title });
    },
    'products, categories, search, activeTab, blockedProductIds, unavailableProductIds, valueId': function () {
      this.refreshFiltered();
    },
    'valueId, products, valueName': function () {
      this.refreshDisplayValue();
    },
  },
  lifetimes: {
    attached() {
      const title = String(this.properties.label || '').trim() || '产品';
      this.setData({ sheetTitle: title });
      this.refreshDisplayValue();
    },
    detached() {
      if (this._sheetCloseNotifyTimer) {
        clearTimeout(this._sheetCloseNotifyTimer);
        this._sheetCloseNotifyTimer = null;
      }
      clearBottomSheetTimers(this);
    },
  },
  methods: {
    refreshDisplayValue() {
      const { valueId, products, valueName } = this.properties;
      const product = valueId
        ? (products || []).find((p) => p.id === valueId)
        : null;
      if (product) {
        const name = product.name || product.sku || valueName || '';
        const displaySku = product.name && product.sku ? product.sku : '';
        const displayText = displaySku ? `${name} ${displaySku}` : name;
        this.setData({
          displayName: name,
          displaySku,
          displayText,
          hasDisplayValue: Boolean(name),
        });
        return;
      }
      this.setData({
        displayName: valueName || '',
        displaySku: '',
        displayText: valueName || '',
        hasDisplayValue: Boolean(valueName),
      });
    },

    refreshFiltered() {
      const categories = this.properties.categories || [];
      const catMap = new Map(categories.map((c) => [c.id, c]));
      const categoryId = this.data.activeTab === 'all' ? undefined : this.data.activeTab;
      const valueId = this.properties.valueId || '';
      const blockedSet = new Set((this.properties.blockedProductIds || []).filter(Boolean));
      const unavailableSet = new Set((this.properties.unavailableProductIds || []).filter(Boolean));
      const filteredProducts = filterProducts(this.properties.products, {
        search: this.data.search,
        categoryId,
        categories,
      }).map((p) => {
        const imageUrl = (p.imageThumb || p.imageUrl) || '';
        const category = p.categoryId ? catMap.get(p.categoryId) : null;
        const categoryLabel = category && category.name ? category.name : '';
        const customTags = mapProductCustomTags(p, category, { includeFile: false });
        const blocked = blockedSet.has(p.id);
        const used = !blocked && unavailableSet.has(p.id);
        const unavailable = (blocked || used) && p.id !== valueId;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          categoryId: p.categoryId,
          categoryLabel,
          imageUrl,
          showImage: Boolean(String(imageUrl).trim()),
          customTags,
          hasCustomTags: customTags.length > 0,
          blocked,
          used,
          unavailable,
        };
      });
      this.setData({ filteredProducts });
    },

    onImageError(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      const filteredProducts = (this.data.filteredProducts || []).map((item) => {
        if (item.id !== id) return item;
        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          categoryId: item.categoryId,
          categoryLabel: item.categoryLabel,
          imageUrl: item.imageUrl,
          showImage: false,
          customTags: item.customTags || [],
          hasCustomTags: item.hasCustomTags,
          blocked: item.blocked,
          used: item.used,
          unavailable: item.unavailable,
        };
      });
      this.setData({ filteredProducts });
    },

    onOpen() {
      if (this.data.disabled) return;
      this.triggerEvent('sheetopen');
      // 弹层统一对齐生产计划新建：取消顶栏 + picker 高度（约 75%）
      openBottomSheet(this, { search: '', activeTab: 'all' }, { picker: true });
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
      const { id, name } = e.currentTarget.dataset;
      if (!id) return;
      const row = (this.data.filteredProducts || []).find((p) => p.id === id);
      if (row && row.unavailable) {
        wx.showToast({
          title: row.used ? '已在其他行添加，不可重复选择' : '含颜色/尺码的产品不可作为 BOM 子件',
          icon: 'none',
        });
        return;
      }
      this.triggerEvent('change', {
        id,
        name,
        product: (this.properties.products || []).find((p) => p.id === id),
        lineIndex: this.properties.lineIndex,
      });
      this.onClose();
    },
  },
});
