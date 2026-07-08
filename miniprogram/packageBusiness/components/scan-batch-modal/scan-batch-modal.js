Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    open: { type: Boolean, value: false },
    title: { type: String, value: '批量扫码' },
    hint: { type: String, value: '' },
    rows: { type: Array, value: [] },
    processing: { type: Boolean, value: false },
    showIntentToggle: { type: Boolean, value: false },
    scanIntent: { type: String, value: 'BATCH' },
    scanDisabled: { type: Boolean, value: false },
    scanDisabledHint: { type: String, value: '' },
  },
  methods: {
    preventMove() {},
    onMaskTap() {
      this.triggerEvent('close');
    },
    noop() {},
    onClose() {
      this.triggerEvent('close');
    },
    onScanTap() {
      if (this.data.processing || this.data.scanDisabled) return;
      this.triggerEvent('scan');
    },
    onConfirm() {
      if (this.data.processing || this.data.scanDisabled) return;
      this.triggerEvent('confirm');
    },
    onRemove(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.triggerEvent('remove', { id });
    },
    onIntentBatch() {
      this.triggerEvent('intentchange', { intent: 'BATCH' });
    },
    onIntentItem() {
      this.triggerEvent('intentchange', { intent: 'ITEM' });
    },
  },
});
