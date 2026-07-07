Component({
  properties: {
    chips: { type: Array, value: [] },
    canReport: { type: Boolean, value: false },
    compact: { type: Boolean, value: false },
  },
  methods: {
    onChipTap(e) {
      const { orderId, milestoneId, disabled } = e.currentTarget.dataset;
      if (disabled) return;
      this.triggerEvent('chiptap', { orderId, milestoneId });
    },
  },
});
