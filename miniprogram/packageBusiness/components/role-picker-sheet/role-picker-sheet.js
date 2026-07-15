const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
} = require('../../../utils/bottomSheetAnim.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    visible: { type: Boolean, value: false },
    roles: { type: Array, value: [] },
    value: { type: String, value: '' },
    memberName: { type: String, value: '' },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
  },
  observers: {
    visible(visible) {
      if (visible) {
        openBottomSheet(this, {}, { picker: true });
      } else if (this.data.open) {
        closeBottomSheet(this);
      }
    },
  },
  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
    },
  },
  methods: {
    noop() {},

    onClose() {
      this.triggerEvent('close');
    },

    onSelect(e) {
      const { id } = e.currentTarget.dataset;
      this.triggerEvent('select', { roleId: id || null });
    },
  },
});
