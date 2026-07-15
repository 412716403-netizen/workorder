Component({
  properties: {
    chips: { type: Array, value: [] },
    canReport: { type: Boolean, value: false },
    compact: { type: Boolean, value: false },
  },
  methods: {
    onChipTap(e) {
      const dataset = e.currentTarget.dataset || {};
      const orderId = dataset.orderId;
      const milestoneId = dataset.milestoneId;
      const productId = dataset.productId;
      const templateId = dataset.templateId;
      const disabled = dataset.disabled;
      if (disabled) return;
      this.triggerEvent('chiptap', {
        orderId,
        milestoneId,
        productId,
        templateId: templateId || milestoneId,
      });
    },
  },
});
