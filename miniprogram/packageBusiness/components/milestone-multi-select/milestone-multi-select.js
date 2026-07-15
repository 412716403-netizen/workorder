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
    nodes: { type: Array, value: [] },
    value: { type: Array, value: [] },
    memberName: { type: String, value: '' },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    selectedIds: [],
    saving: false,
    chips: [],
  },
  observers: {
    visible(visible) {
      if (visible) {
        const selectedIds = Array.isArray(this.properties.value) ? [...this.properties.value] : [];
        openBottomSheet(this, { selectedIds, saving: false });
        this.syncChips(selectedIds);
      } else if (this.data.open) {
        closeBottomSheet(this, { selectedIds: [], saving: false, chips: [] });
      }
    },
    value(val) {
      if (!this.data.open) {
        const selectedIds = Array.isArray(val) ? [...val] : [];
        this.setData({ selectedIds });
        this.syncChips(selectedIds);
      }
    },
    nodes() {
      this.syncChips(this.data.selectedIds);
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

    onToggle(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      const set = new Set(this.data.selectedIds || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const selectedIds = Array.from(set);
      this.setData({ selectedIds });
      this.syncChips(selectedIds);
    },

    onConfirm() {
      if (this.data.saving) return;
      this.setData({ saving: true });
      this.triggerEvent('confirm', { assignedMilestoneIds: [...(this.data.selectedIds || [])] });
    },

    resetSaving() {
      this.setData({ saving: false });
    },

    syncChips(selectedIds) {
      const selected = new Set(selectedIds || this.data.selectedIds || []);
      const chips = (this.properties.nodes || []).map((n) => ({
        id: n.id,
        name: n.name || n.id,
        selected: selected.has(n.id),
      }));
      this.setData({ chips });
    },
  },
});
