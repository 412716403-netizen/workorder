Component({
  properties: {
    visible: { type: Boolean, value: false },
  },
  methods: {
    emit(action, digit) {
      this.triggerEvent('action', { action, digit: digit || '' });
    },
    onConfirm() {
      this.emit('confirm');
    },
    onKeyTap(e) {
      const { key } = e.currentTarget.dataset;
      if (!key) return;
      if (key === 'backspace' || key === 'minus' || key === 'dot' || key === 'next' || key === 'enter') {
        this.emit(key);
        return;
      }
      this.emit('digit', key);
    },
  },
});
