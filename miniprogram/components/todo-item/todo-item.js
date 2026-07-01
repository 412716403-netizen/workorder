Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    count: { type: Number, value: 0 },
    url: { type: String, value: '' },
  },
  methods: {
    onTap() {
      const { url } = this.properties;
      this.triggerEvent('tap');
      if (url) {
        wx.navigateTo({ url, fail: () => wx.showToast({ title: '功能开发中', icon: 'none' }) });
      }
    },
  },
});
