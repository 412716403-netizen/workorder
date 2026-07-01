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
      if (path.startsWith('/pages/')) {
        if (path.includes('apps') || path.includes('home') || path.includes('mine') || path.includes('scan') || path.includes('messages')) {
          wx.switchTab({ url: path, fail: () => wx.navigateTo({ url: path }) });
        } else {
          wx.navigateTo({
            url: path,
            fail: (err) => {
              console.error('[icon-grid] navigateTo failed', path, err);
              wx.showToast({ title: '页面打开失败', icon: 'none' });
            },
          });
        }
      }
    },
  },
});
