const { filterWorkers, buildWorkerSelectTabs } = require('../../../utils/filterWorkers.js');
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
    label: { type: String, value: '生产人员' },
    workers: { type: Array, value: [] },
    processNodes: { type: Array, value: [] },
    currentNodeId: { type: String, value: '' },
    valueId: { type: String, value: '' },
    valueName: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
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
    filteredWorkers: [],
    visibleNodes: [],
    showUnassigned: false,
  },
  observers: {
    'workers, processNodes, search, activeTab': function () {
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
      const { visibleNodes, showUnassigned } = buildWorkerSelectTabs(
        this.properties.workers,
        this.properties.processNodes,
      );
      const filteredWorkers = filterWorkers(this.properties.workers, {
        search: this.data.search,
        activeTab: this.data.activeTab,
      }).map((w) => ({
        id: w.id,
        name: w.name,
        groupName: w.groupName || '',
        role: w.role || '',
      }));
      this.setData({ filteredWorkers, visibleNodes, showUnassigned });
    },

    resolveDefaultTab() {
      const { currentNodeId, workers } = this.properties;
      const list = workers || [];
      if (currentNodeId && list.some((w) => (w.assignedMilestoneIds || []).includes(currentNodeId))) {
        return currentNodeId;
      }
      return 'all';
    },

    onOpen() {
      if (this.properties.disabled) return;
      openBottomSheet(this, { search: '', activeTab: this.resolveDefaultTab() }, { picker: this.properties.cell });
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
      if (!id || !name) return;
      this.triggerEvent('change', { id, name });
      this.onClose();
    },
  },
});
