const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  TAG_PICKER_HEIGHT_RATIO,
} = require('../../utils/bottomSheetAnim.js');

/** 收/付款单据分类统一蓝色简笔图标（细线文档，非 serrated receipt） */
const CATEGORY_ICON = '/assets/icons/finance-category.png';

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '单据分类' },
    categories: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    displayName: '',
    showSelectedStyle: false,
    iconSrc: CATEGORY_ICON,
  },
  observers: {
    'categories, value': function (categories, value) {
      const list = categories || [];
      const hit = list.find((c) => c && c.id === value);
      this.setData({
        displayName: (hit && hit.name) || '',
        // 仅一项时选择无对比意义，不展示黄色已选态
        showSelectedStyle: list.length > 1,
      });
    },
  },
  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
    },
  },
  methods: {
    noop() {},

    onOpen() {
      if (this.data.disabled) return;
      this.triggerEvent('sheetopen');
      openBottomSheet(this, null, { heightRatio: TAG_PICKER_HEIGHT_RATIO });
    },

    onClose() {
      this.triggerEvent('sheetclose');
      closeBottomSheet(this);
    },

    onSelect(e) {
      const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
      if (!id) return;
      const hit = (this.properties.categories || []).find((c) => c && c.id === id);
      this.triggerEvent('change', {
        id,
        name: (hit && hit.name) || '',
        value: id,
      });
      this.triggerEvent('sheetclose');
      closeBottomSheet(this);
    },
  },
});
