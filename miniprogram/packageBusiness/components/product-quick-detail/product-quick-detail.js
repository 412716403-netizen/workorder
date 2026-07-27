/**
 * 商品只读快览（对齐 Web ProductQuickDetailBody）
 * 资料库关联产品、生产计划详情点产品名等入口共用。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    hero: { type: Object, value: null },
    rows: { type: Array, value: [] },
    customRows: { type: Array, value: [] },
    showCustomSection: { type: Boolean, value: false },
    processRows: { type: Array, value: [] },
    processEmpty: { type: Boolean, value: true },
    showBomSection: { type: Boolean, value: false },
    bomSkuOptions: { type: Array, value: [] },
    showBomSkuTabs: { type: Boolean, value: false },
    bomGroups: { type: Array, value: [] },
    bomEmptyText: { type: String, value: '' },
    showBomEmpty: { type: Boolean, value: false },
  },

  methods: {
    onPreviewImage() {
      this.triggerEvent('previewimage');
    },

    onBomSkuTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      this.triggerEvent('bomskutap', { id });
    },

    onCustomKnowledgeTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      const title = e.currentTarget.dataset.title || '资料库文件';
      this.triggerEvent('customknowledgetap', { id, title });
    },

    onCustomFileTap(e) {
      const fieldId = e.currentTarget.dataset.id;
      if (!fieldId) return;
      this.triggerEvent('customfiletap', { fieldId });
    },

    onCustomFileThumbTap(e) {
      const fieldId = e.currentTarget.dataset.fieldId;
      const index = Number(e.currentTarget.dataset.index);
      if (!fieldId) return;
      this.triggerEvent('customfilethumbtap', {
        fieldId,
        index: Number.isFinite(index) ? index : 0,
      });
    },
  },
});
