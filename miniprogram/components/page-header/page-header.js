const { readNavBarMetrics } = require('../../utils/windowMetrics.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    center: { type: Boolean, value: false },
    theme: { type: String, value: 'default' },
  },
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    placeholderExtra: 0,
  },
  observers: {
    theme() {
      this.applyMetrics();
    },
  },
  lifetimes: {
    attached() {
      this.applyMetrics();
    },
  },
  methods: {
    applyMetrics() {
      const m = readNavBarMetrics();
      const isPrimary = this.properties.theme === 'primary';
      const placeholderExtra = isPrimary
        ? Math.round((wx.getWindowInfo().windowWidth / 750) * 28)
        : 0;
      this.setData({
        statusBarHeight: m.statusBarHeight,
        navBarHeight: m.navBarHeight,
        placeholderExtra,
      });
    },
    onBack() {
      this.triggerEvent('back');
    },
  },
});
