const { getOrderReportable, createOrderReport } = require('../../utils/orderApi.js');
const { openBottomSheet, closeBottomSheet, clearBottomSheetTimers } = require('../../utils/bottomSheetAnim.js');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    orderId: { type: String, value: '' },
    orderNumber: { type: String, value: '' },
    milestoneId: { type: String, value: '' },
    milestoneName: { type: String, value: '' },
    tenantDisplayName: { type: String, value: '' },
  },

  data: {
    open: false,
    sheetShow: false,
    quantity: '1',
    defectiveQty: '0',
    maxReportable: 0,
    remaining: 0,
    submitting: false,
    loading: false,
  },

  observers: {
    visible(v) {
      if (v) this.openSheet();
      else this.closeSheet();
    },
    'orderId,milestoneId'(orderId, milestoneId) {
      if (this.data.open && orderId && milestoneId) {
        this.loadReportable();
      }
    },
  },

  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
    },
  },

  methods: {
    openSheet() {
      openBottomSheet(this, { quantity: '1', defectiveQty: '0' });
      if (this.properties.orderId && this.properties.milestoneId) {
        this.loadReportable();
      }
    },

    closeSheet() {
      closeBottomSheet(this);
    },

    async loadReportable() {
      const { orderId, milestoneId } = this.properties;
      if (!orderId || !milestoneId) return;
      this.setData({ loading: true });
      try {
        const res = await getOrderReportable(orderId);
        const list = Array.isArray(res) ? res : (res && res.milestones) || [];
        const ms = list.find((m) => m.milestoneId === milestoneId || m.id === milestoneId);
        const maxReportable = ms && ms.maxReportable != null ? Number(ms.maxReportable) : 0;
        const remaining = ms && ms.remaining != null ? Number(ms.remaining) : maxReportable;
        this.setData({
          maxReportable,
          remaining: Math.max(0, remaining),
          quantity: remaining > 0 ? String(Math.min(1, remaining)) : '0',
          loading: false,
        });
      } catch {
        this.setData({ loading: false, maxReportable: 0, remaining: 0 });
      }
    },

    onMaskTap() {
      this.triggerEvent('close');
    },

    onCancel() {
      this.triggerEvent('close');
    },

    onQuantityInput(e) {
      this.setData({ quantity: e.detail.value || '' });
    },

    onDefectiveInput(e) {
      this.setData({ defectiveQty: e.detail.value || '' });
    },

    parseQty(val, fallback = 0) {
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    },

    clampQuantity(raw) {
      const { remaining } = this.data;
      if (remaining <= 0) return '0';
      let qty = Math.floor(this.parseQty(raw, 1));
      if (qty < 1) qty = 1;
      if (qty > remaining) qty = remaining;
      return String(qty);
    },

    clampDefective(raw) {
      let qty = Math.floor(this.parseQty(raw, 0));
      if (qty < 0) qty = 0;
      return String(qty);
    },

    onQuantityBlur() {
      this.setData({ quantity: this.clampQuantity(this.data.quantity) });
    },

    onDefectiveBlur() {
      this.setData({ defectiveQty: this.clampDefective(this.data.defectiveQty) });
    },

    onStepTap(e) {
      const { field, delta } = e.currentTarget.dataset;
      const step = Number(delta) || 0;
      if (!field || !step) return;
      if (field === 'quantity') {
        const next = this.parseQty(this.data.quantity, 1) + step;
        this.setData({ quantity: this.clampQuantity(next) });
        return;
      }
      if (field === 'defectiveQty') {
        const next = this.parseQty(this.data.defectiveQty, 0) + step;
        this.setData({ defectiveQty: this.clampDefective(next) });
      }
    },

    onGoScan() {
      const app = getApp();
      if (app.globalData) {
        app.globalData.scanPreset = {
          type: 'report',
          nodeId: this.properties.milestoneId,
          nodeName: this.properties.milestoneName,
        };
      }
      this.triggerEvent('close');
      wx.switchTab({ url: '/pages/scan/scan' });
    },

    async onSubmit() {
      const { orderId, milestoneId, tenantDisplayName } = this.properties;
      const quantity = this.clampQuantity(this.data.quantity);
      const defectiveQty = this.clampDefective(this.data.defectiveQty);
      this.setData({ quantity, defectiveQty });
      const qty = Number(quantity);
      const defective = Number(defectiveQty) || 0;
      if (!orderId || !milestoneId) return;
      if (!Number.isFinite(qty) || qty <= 0) {
        wx.showToast({ title: '请输入有效数量', icon: 'none' });
        return;
      }
      if (this.data.remaining > 0 && qty > this.data.remaining) {
        wx.showToast({ title: `最多可报 ${this.data.remaining} 件`, icon: 'none' });
        return;
      }

      this.setData({ submitting: true });
      try {
        await createOrderReport(orderId, milestoneId, {
          quantity: qty,
          defectiveQuantity: defective > 0 ? defective : undefined,
          operator: tenantDisplayName || '',
        });
        wx.showToast({ title: '报工成功', icon: 'success' });
        this.triggerEvent('success', { orderId, milestoneId });
        this.triggerEvent('close');
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '报工失败', icon: 'none' });
      } finally {
        this.setData({ submitting: false });
      }
    },
  },
});
