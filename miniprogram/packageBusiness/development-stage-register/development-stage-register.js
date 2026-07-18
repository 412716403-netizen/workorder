const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const {
  getDevStyle,
  updateDevStage,
  listDevStageTemplates,
} = require('../utils/developmentApi.js');
const { findStageById } = require('../utils/devStyleDetailView.js');
const {
  STAGE_STATUS_OPTIONS,
  buildStageRegisterFields,
  validateStageRegisterFields,
  buildStageUpdatePayload,
  splitIsoToDateTime,
  joinDateTimeToIso,
} = require('../utils/devStageRegister.js');
const { chooseProductImageAsDataUrl } = require('../utils/fileBase64.js');
const { promptCreateTodo } = require('../utils/devTodoCreate.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    submitting: false,
    styleId: '',
    stageId: '',
    stageName: '',
    status: 'pending',
    statusOptions: STAGE_STATUS_OPTIONS,
    statusIndex: 0,
    fields: [],
    pickerSheetOpen: false,
    showTodoBtn: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      styleId: options.styleId ? decodeURIComponent(options.styleId) : '',
      stageId: options.stageId ? decodeURIComponent(options.stageId) : '',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    this._tenantCtx = ctx;
    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'development')) {
        wx.showToast({ title: '开发管理插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!hasPermission(ctx.permissions || [], 'development:styles:edit')) {
        wx.showToast({ title: '无编辑权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({ showTodoBtn: isPluginEnabled(plugins, 'todo_reminder') });
      this.bootstrap();
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [style, templates] = await Promise.all([
        getDevStyle(this.data.styleId),
        listDevStageTemplates().catch(() => []),
      ]);
      const found = findStageById(style, this.data.stageId);
      if (!found) {
        wx.showToast({ title: '节点不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._style = style;
      this._templates = templates || [];
      const fields = buildStageRegisterFields(found.stage, this._templates).map((f) => {
        const parts = f.type === 'date' ? splitIsoToDateTime(f.value) : { datePart: '', timePart: '' };
        return {
          ...f,
          datePart: parts.datePart,
          timePart: f.dateWithTime ? parts.timePart : parts.timePart || '00:00',
        };
      });
      const statusIndex = Math.max(
        0,
        STAGE_STATUS_OPTIONS.findIndex((o) => o.id === found.stage.status),
      );
      this.setData({
        loading: false,
        stageName: found.stage.name,
        status: found.stage.status,
        statusIndex,
        fields,
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = STAGE_STATUS_OPTIONS[idx];
    this.setData({ statusIndex: idx, status: opt ? opt.id : 'pending' });
  },

  onFieldInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value || '';
    const fields = (this.data.fields || []).map((f) =>
      f.id === id ? { ...f, value } : f,
    );
    this.setData({ fields });
  },

  onSelectChange(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value) || 0;
    const fields = (this.data.fields || []).map((f) => {
      if (f.id !== id) return f;
      const value = (f.options || [])[idx] || '';
      return { ...f, value, pickerIndex: idx };
    });
    this.setData({ fields });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  onDateFieldChange(e) {
    const id = e.currentTarget.dataset.id;
    const detail = e.detail || {};
    const datePart = detail.date || '';
    const timePart = detail.time || '00:00';
    const fields = (this.data.fields || []).map((f) => {
      if (f.id !== id) return f;
      const iso = joinDateTimeToIso(datePart, f.dateWithTime ? timePart : '00:00');
      return {
        ...f,
        datePart,
        timePart: f.dateWithTime ? timePart : '00:00',
        value: iso,
      };
    });
    this.setData({ fields });
  },

  async onFilePick(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const dataUrl = await chooseProductImageAsDataUrl();
      if (!dataUrl) return;
      const fields = (this.data.fields || []).map((f) =>
        f.id === id ? { ...f, value: dataUrl } : f,
      );
      this.setData({ fields });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '选择失败', icon: 'none' });
    }
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const err = validateStageRegisterFields(this.data.fields);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const userName =
      (this._tenantCtx && (this._tenantCtx.userName || this._tenantCtx.name)) || '';
    const payload = buildStageUpdatePayload(this.data.status, this.data.fields, userName);
    this.setData({ submitting: true });
    try {
      await updateDevStage(this.data.stageId, payload);
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onAddTodoTap() {
    if (!this.data.showTodoBtn) return;
    const style = this._style;
    const found = findStageById(style, this.data.stageId);
    const stageName = this.data.stageName || (found && found.stage && found.stage.name) || '';
    const styleName = style ? style.name || style.code : '';
    promptCreateTodo({
      sourceType: 'dev_stage',
      sourceId: this.data.stageId,
      sourceDocNo: '开发管理',
      sourceTitle: `${styleName ? `${styleName} · ` : ''}节点登记 · ${stageName}`,
      href: `/development?styleId=${encodeURIComponent(this.data.styleId)}&devStageId=${encodeURIComponent(this.data.stageId)}`,
    });
  },
});
