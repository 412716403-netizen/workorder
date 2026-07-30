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
    /** 阻止点按键盘区域冒泡 */
    onKeyboardCatch() {},
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
