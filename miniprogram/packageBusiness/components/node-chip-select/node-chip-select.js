Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '' },
    nodes: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '请选择工序' },
    emptyText: { type: String, value: '暂无可选工序' },
    sheetTitle: { type: String, value: '选择工序' },
  },
  data: {
    open: false,
    selectedName: '',
  },
  observers: {
    'value, nodes': function () {
      this.syncSelectedName();
    },
  },
  methods: {
    syncSelectedName() {
      const { value, nodes } = this.properties;
      const node = (nodes || []).find((n) => n.id === value);
      this.setData({ selectedName: node ? node.name : '' });
    },

    onOpen() {
      if (!(this.properties.nodes || []).length) return;
      this.setData({ open: true });
    },

    onClose() {
      this.setData({ open: false });
    },

    noop() {},

    onSelect(e) {
      const { id, name } = e.currentTarget.dataset;
      if (!id) return;
      this.triggerEvent('change', { id, name });
      this.onClose();
    },
  },
});
