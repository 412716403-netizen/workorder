const { filterProducts } = require('../../utils/filterProducts.js');
const { mapProductCustomTags } = require('../../utils/reportCustomDocField.js');
const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
} = require('../../utils/bottomSheetAnim.js');

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
    placeholder: { type: String, value: '搜索产品名称或 SKU' },
    disabled: { type: Boolean, value: false },
    embedded: { type: Boolean, value: false },
    cell: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
  },
  data: {
    open: false,
    sheetShow: false,
    search: '',
    activeTab: 'all',
    filteredProducts: [],
    displayName: '',
    displaySku: '',
    displayText: '',
    hasDisplayValue: false,
  },
  observers: {
    'products, categories, search, activeTab': function () {
      this.refreshFiltered();
    },
    'valueId, products, valueName': function () {
      this.refreshDisplayValue();
    },
  },
  lifetimes: {
    attached() {
      this.refreshDisplayValue();
    },
    detached() {
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
      const filteredProducts = filterProducts(this.properties.products, {
        search: this.data.search,
        categoryId,
        categories,
      }).map((p) => {
        const imageUrl = p.imageUrl || '';
        const category = p.categoryId ? catMap.get(p.categoryId) : null;
        const categoryLabel = category && category.name ? category.name : '';
        const customTags = mapProductCustomTags(p, category, { includeFile: false });
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
        };
      });
      this.setData({ filteredProducts });
    },

    onOpen() {
      if (this.data.disabled) return;
      openBottomSheet(this, { search: '', activeTab: 'all' });
      this.refreshFiltered();
    },

    onClose() {
      closeBottomSheet(this, { search: '', activeTab: 'all' });
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
      this.triggerEvent('change', { id, name, product: (this.properties.products || []).find((p) => p.id === id) });
      this.onClose();
    },
  },
});
