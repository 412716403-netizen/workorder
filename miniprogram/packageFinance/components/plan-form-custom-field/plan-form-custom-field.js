const {
  chooseCustomFieldFileAsDataUrl,
  formatCustomFileLabel,
  isImageDataUrl,
} = require('../../../utils/fileBase64.js');

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    fields: { type: Array, value: [] },
    values: { type: Object, value: {} },
  },
  data: {
    enrichedFields: [],
  },
  observers: {
    'fields, values': function () {
      this.refreshEnrichedFields();
    },
  },
  lifetimes: {
    attached() {
      this.refreshEnrichedFields();
    },
  },
  methods: {
    refreshEnrichedFields() {
      const values = this.properties.values || {};
      const enrichedFields = (this.properties.fields || []).map((f) => {
        const options = f.options || [];
        const current = values[f.id];
        let pickerIndex = 0;
        if (current) {
          const idx = options.indexOf(current);
          if (idx >= 0) pickerIndex = idx;
        }
        const fileVal = typeof current === 'string' ? current : '';
        const hasFile = !!(fileVal && fileVal.indexOf('data:') === 0);
        return {
          id: f.id,
          label: f.label,
          type: f.type,
          options,
          pickerMode: f.pickerMode,
          required: !!f.required,
          isText: f.isText,
          isSelect: f.isSelect,
          isDate: f.isDate,
          isFile: !!f.isFile || f.type === 'file',
          desktopOnly: !!f.desktopOnly && !(f.isFile || f.type === 'file'),
          pickerIndex,
          hasFile,
          isImageFile: hasFile && isImageDataUrl(fileVal),
          fileLabel: hasFile ? formatCustomFileLabel(fileVal) : '',
          filePreview: hasFile && isImageDataUrl(fileVal) ? fileVal : '',
        };
      });
      this.setData({ enrichedFields });
    },

    emitChange(id, value) {
      const next = Object.assign({}, this.properties.values || {});
      next[id] = value;
      this.triggerEvent('change', { customData: next });
    },

    onTextInput(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.emitChange(id, e.detail.value || '');
    },

    onSelectChange(e) {
      const { id, options } = e.currentTarget.dataset;
      if (!id) return;
      const idx = Number(e.detail.value) || 0;
      const list = options || [];
      const value = list[idx] || '';
      this.emitChange(id, value);
    },

    onDateChange(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.emitChange(id, e.detail.value || '');
    },

    async onPickFile(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      try {
        const dataUrl = await chooseCustomFieldFileAsDataUrl();
        if (!dataUrl) return;
        this.emitChange(id, dataUrl);
      } catch (err) {
        if (err && err.code === 'FILE_TOO_LARGE') {
          wx.showToast({ title: '文件不能超过 4MB', icon: 'none' });
          return;
        }
        wx.showToast({ title: '读取失败', icon: 'none' });
      }
    },

    onClearFile(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.emitChange(id, '');
    },

    onPreviewFile(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      const values = this.properties.values || {};
      const dataUrl = values[id];
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
        wx.showToast({ title: '请在电脑端查看该附件', icon: 'none' });
        return;
      }
      wx.previewImage({
        urls: [dataUrl],
        current: dataUrl,
      });
    },
  },
});
