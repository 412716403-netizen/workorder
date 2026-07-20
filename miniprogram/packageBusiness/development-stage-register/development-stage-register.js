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
const { chooseProductImages } = require('../utils/fileBase64.js');
const {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileUrls,
  serializeDevStageFileUrls,
} = require('../utils/devStageFileValue.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function enrichFileField(field, urls, previewSrcs) {
  const list = parseDevStageFileUrls(urls);
  const previews = (previewSrcs && previewSrcs.length ? previewSrcs : list).slice(
    0,
    DEV_STAGE_FILE_MAX_COUNT,
  );
  const hasFile = list.length > 0;
  return {
    ...field,
    value: hasFile ? 'uploaded' : '',
    hasFile,
    fileCount: list.length,
    fileLabel: hasFile
      ? `已传 ${list.length} 张${list.length < DEV_STAGE_FILE_MAX_COUNT ? '（可继续添加）' : '（已满）'}`
      : '选择图片',
    canAddMore: list.length < DEV_STAGE_FILE_MAX_COUNT,
    previewList: previews.map((src, idx) => ({
      id: `${field.id}-${idx}`,
      src,
      index: idx,
    })),
  };
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
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._initialized = false;
    this._fileValues = {};
    this._filePreviews = {};
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
      if (!this._initialized) this.bootstrap();
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  resolveFieldValue(field) {
    if (field && field.type === 'file') {
      const urls = this._fileValues && this._fileValues[field.id];
      if (Array.isArray(urls)) return serializeDevStageFileUrls(urls);
      if (typeof urls === 'string') return serializeDevStageFileUrls(parseDevStageFileUrls(urls));
      if (field.value === 'uploaded') return '';
    }
    return (field && field.value) || '';
  },

  refreshFileField(fieldId) {
    const urls = this._fileValues[fieldId] || [];
    const previews = this._filePreviews[fieldId] || urls;
    const fields = (this.data.fields || []).map((f) =>
      f.id === fieldId ? enrichFileField(f, urls, previews) : f,
    );
    this.setData({ fields });
  },

  async bootstrap() {
    this._initialized = true;
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
      this._fileValues = {};
      this._filePreviews = {};
      const fields = buildStageRegisterFields(found.stage, this._templates).map((f) => {
        const parts = f.type === 'date' ? splitIsoToDateTime(f.value) : { datePart: '', timePart: '' };
        const base = {
          ...f,
          datePart: parts.datePart,
          timePart: f.dateWithTime ? parts.timePart : parts.timePart || '00:00',
        };
        if (f.type === 'file') {
          const urls = parseDevStageFileUrls(f.value);
          this._fileValues[f.id] = urls;
          this._filePreviews[f.id] = urls.slice();
          return enrichFileField(base, urls, urls);
        }
        return base;
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
      this._initialized = false;
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onStatusTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.status) return;
    const idx = STAGE_STATUS_OPTIONS.findIndex((o) => o.id === id);
    this.setData({
      status: id,
      statusIndex: idx >= 0 ? idx : 0,
    });
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
    if (!id) return;
    const existing = this._fileValues[id] || [];
    const room = DEV_STAGE_FILE_MAX_COUNT - existing.length;
    if (room <= 0) {
      wx.showToast({ title: `最多 ${DEV_STAGE_FILE_MAX_COUNT} 张`, icon: 'none' });
      return;
    }
    try {
      const picked = await chooseProductImages(room);
      if (!picked || !picked.length) return;
      const nextUrls = existing.concat(picked.map((p) => p.dataUrl)).slice(0, DEV_STAGE_FILE_MAX_COUNT);
      const nextPreviews = (this._filePreviews[id] || [])
        .concat(picked.map((p) => p.tempFilePath || p.dataUrl))
        .slice(0, DEV_STAGE_FILE_MAX_COUNT);
      this._fileValues[id] = nextUrls;
      this._filePreviews[id] = nextPreviews;
      this.refreshFileField(id);
      wx.showToast({ title: `已添加 ${picked.length} 张`, icon: 'success' });
    } catch (err) {
      if (err && err.code === 'FILE_TOO_LARGE') {
        wx.showToast({ title: '单张图片不能超过 4MB', icon: 'none' });
        return;
      }
      wx.showToast({
        title: (err && (err.message || err.errMsg)) || '选择失败',
        icon: 'none',
      });
    }
  },

  onFileRemove(e) {
    const id = e.currentTarget.dataset.id;
    const index = Number(e.currentTarget.dataset.index);
    if (!id || Number.isNaN(index)) return;
    const urls = (this._fileValues[id] || []).filter((_, i) => i !== index);
    const previews = (this._filePreviews[id] || []).filter((_, i) => i !== index);
    this._fileValues[id] = urls;
    this._filePreviews[id] = previews;
    this.refreshFileField(id);
  },

  onFilePreview(e) {
    const id = e.currentTarget.dataset.id;
    const index = Number(e.currentTarget.dataset.index) || 0;
    const urls = this._filePreviews[id] || this._fileValues[id] || [];
    if (!urls.length) return;
    wx.previewImage({
      current: urls[index] || urls[0],
      urls,
    });
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const fieldsForSave = (this.data.fields || []).map((f) => ({
      ...f,
      value: this.resolveFieldValue(f),
    }));
    const err = validateStageRegisterFields(fieldsForSave);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const userName =
      (this._tenantCtx && (this._tenantCtx.userName || this._tenantCtx.name)) || '';
    const payload = buildStageUpdatePayload(this.data.status, fieldsForSave, userName);
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
});
