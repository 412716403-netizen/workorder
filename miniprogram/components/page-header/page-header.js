const { readNavBarMetrics } = require('../../utils/windowMetrics.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    center: { type: Boolean, value: false },
  },
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },
  lifetimes: {
    attached() {
      this.setData(readNavBarMetrics());
    },
  },
  methods: {
    onBack() {
      this.triggerEvent('back');
    },
  },
});
