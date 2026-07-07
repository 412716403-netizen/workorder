const { navigateMenuPath } = require('../../utils/navigateMenuPath.js');

Component({
  options: { addGlobalClass: true },
  properties: {
    items: { type: Array, value: [] },
    columns: { type: Number, value: 4 },
    variant: { type: String, value: 'default' },
  },
  methods: {
    onTap(e) {
      const { key, path } = e.currentTarget.dataset;
      if (!path) {
        wx.showToast({ title: '功能开发中', icon: 'none' });
        return;
      }
      this.triggerEvent('tap', { key, path });
      navigateMenuPath(path);
    },
  },
});
