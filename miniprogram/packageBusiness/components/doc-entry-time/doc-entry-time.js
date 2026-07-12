Component({
  properties: {
    label: { type: String, value: '入单时间' },
    value: { type: String, value: '' },
    last: { type: Boolean, value: false },
  },
  methods: {
    onDateChange(e) {
      const v = (e.detail && e.detail.value) || '';
      this.triggerEvent('change', { value: v });
    },
  },
});
