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
const { chooseCustomFieldFiles, isImageDataUrl, resolveImageDisplaySrc } = require('../utils/fileBase64.js');
const {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileItems,
  serializeDevStageFileItems,
} = require('../utils/devStageFileValue.js');
const {
  resolveOpenDocumentFileType,
  formatUnpreviewableMessage,
  getFileExtension,
} = require('../utils/knowledgeAttachmentForMini.js');

function mimeFromDataUrl(url) {
  const m = /^data:([^;,]+)/i.exec(String(url || '').trim());
  return (m && m[1] ? m[1] : '').trim().toLowerCase();
}

/** data URL → 临时文件，供 wx.openDocument */
function writeDataUrlTempFile(dataUrl, fileName) {
  const raw = String(dataUrl || '');
  const comma = raw.indexOf(',');
  if (comma < 0 || raw.indexOf('data:') !== 0) {
    return Promise.reject(new Error('无效附件'));
  }
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  if (!/;base64/i.test(meta)) {
    return Promise.reject(new Error('仅支持 base64 附件'));
  }
  const mime = mimeFromDataUrl(raw);
  const ext =
    getFileExtension(fileName) ||
    (mime === 'application/pdf'
      ? 'pdf'
      : mime.indexOf('spreadsheetml') >= 0
        ? 'xlsx'
        : mime === 'application/vnd.ms-excel'
          ? 'xls'
          : mime.indexOf('wordprocessingml') >= 0
            ? 'docx'
            : mime === 'application/msword'
              ? 'doc'
              : 'bin');
  const base = (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || '';
  if (!base) return Promise.reject(new Error('无法写入临时文件'));
  const safe = String(fileName || 'attach')
    .replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_')
    .slice(0, 40);
  const filePath = `${base}/dev-stage-${Date.now()}-${safe}.${ext}`;
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: payload,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject,
    });
  });
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function enrichFileField(field, items, previewSrcs) {
  const list = Array.isArray(items) ? items : parseDevStageFileItems(items);
  const previews = (previewSrcs && previewSrcs.length ? previewSrcs : list.map((i) => i.url)).slice(
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
      ? `已传 ${list.length} 个${list.length < DEV_STAGE_FILE_MAX_COUNT ? '（可继续添加）' : '（已满）'}`
      : '上传文件/图片',
    canAddMore: list.length < DEV_STAGE_FILE_MAX_COUNT,
    previewList: list.map((item, idx) => {
      const src = previews[idx] || item.url;
      const isImage = String(item.url).indexOf('data:image/') === 0;
      return {
        id: `${field.id}-${idx}`,
        src: isImage ? src : '',
        isImage,
        name: item.name || '',
        kindLabel: isImage
          ? '图片'
          : String(item.url).indexOf('data:application/pdf') === 0
            ? 'PDF'
            : item.name
              ? item.name
              : '附件',
        index: idx,
      };
    }),
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
      const items = this._fileValues && this._fileValues[field.id];
      if (Array.isArray(items)) return serializeDevStageFileItems(items);
      if (typeof items === 'string') return serializeDevStageFileItems(parseDevStageFileItems(items));
      if (field.value === 'uploaded') return '';
    }
    return (field && field.value) || '';
  },

  refreshFileField(fieldId) {
    const items = this._fileValues[fieldId] || [];
    const previews = this._filePreviews[fieldId] || items.map((i) => i.url);
    const fields = (this.data.fields || []).map((f) =>
      f.id === fieldId ? enrichFileField(f, items, previews) : f,
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
      this._originalStage = found.stage;
      this._templates = templates || [];
      this._fileValues = {};
      this._filePreviews = {};
      const rawFields = buildStageRegisterFields(found.stage, this._templates);
      const fields = [];
      for (let fi = 0; fi < rawFields.length; fi += 1) {
        const f = rawFields[fi];
        const parts = f.type === 'date' ? splitIsoToDateTime(f.value) : { datePart: '', timePart: '' };
        const base = {
          ...f,
          datePart: parts.datePart,
          timePart: f.dateWithTime ? parts.timePart : parts.timePart || '00:00',
        };
        if (f.type === 'file') {
          const items = parseDevStageFileItems(f.value);
          this._fileValues[f.id] = items;
          // 图片 data URL 落盘后再进 setData，避免大 base64 卡渲染
          const previews = await Promise.all(
            items.map((item, idx) => {
              if (!isImageDataUrl(item.url)) return Promise.resolve('');
              return resolveImageDisplaySrc(item.url, `${f.id}-${idx}`);
            }),
          );
          this._filePreviews[f.id] = previews;
          fields.push(enrichFileField(base, items, previews));
        } else {
          fields.push(base);
        }
      }
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
      wx.showToast({ title: `最多 ${DEV_STAGE_FILE_MAX_COUNT} 个`, icon: 'none' });
      return;
    }
    try {
      const picked = await chooseCustomFieldFiles(room);
      if (!picked || !picked.length) return;
      const added = picked.map((p) => ({
        url: p.dataUrl,
        name: p.name || '',
      }));
      const nextItems = existing.concat(added).slice(0, DEV_STAGE_FILE_MAX_COUNT);
      const nextPreviews = (this._filePreviews[id] || [])
        .concat(picked.map((p) => p.tempFilePath || p.dataUrl))
        .slice(0, DEV_STAGE_FILE_MAX_COUNT);
      this._fileValues[id] = nextItems;
      this._filePreviews[id] = nextPreviews;
      this.refreshFileField(id);
      wx.showToast({ title: `已添加 ${picked.length} 个`, icon: 'success' });
    } catch (err) {
      if (err && err.code === 'FILE_TOO_LARGE') {
        wx.showToast({ title: '单个文件不能超过 4MB', icon: 'none' });
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
    const items = (this._fileValues[id] || []).filter((_, i) => i !== index);
    const previews = (this._filePreviews[id] || []).filter((_, i) => i !== index);
    this._fileValues[id] = items;
    this._filePreviews[id] = previews;
    this.refreshFileField(id);
  },

  onFilePreview(e) {
    const id = e.currentTarget.dataset.id;
    const index = Number(e.currentTarget.dataset.index) || 0;
    const items = this._fileValues[id] || [];
    const item = items[index];
    if (!item || !item.url) return;
    if (isImageDataUrl(item.url)) {
      const imageItems = items.filter((it) => isImageDataUrl(it.url));
      const previews = this._filePreviews[id] || [];
      const previewUrls = imageItems.map((it) => {
        const idx = items.indexOf(it);
        return previews[idx] || it.url;
      });
      wx.previewImage({
        current: previews[index] || item.url,
        urls: previewUrls.length ? previewUrls : [item.url],
      });
      return;
    }

    const fileName = item.name || '附件';
    const mimeType = mimeFromDataUrl(item.url);
    const fileType = resolveOpenDocumentFileType(fileName, mimeType);
    if (!fileType) {
      wx.showModal({
        title: fileName,
        content: `${formatUnpreviewableMessage(fileName)}，请在电脑端查看。`,
        showCancel: false,
      });
      return;
    }

    wx.showLoading({ title: '打开中…', mask: true });
    writeDataUrlTempFile(item.url, fileName)
      .then(
        (filePath) =>
          new Promise((resolve, reject) => {
            wx.openDocument({
              filePath,
              fileType,
              showMenu: true,
              success: resolve,
              fail: reject,
            });
          }),
      )
      .catch(() => {
        wx.showModal({
          title: '无法打开',
          content: '请在电脑端查看该文件。',
          showCancel: false,
        });
      })
      .finally(() => {
        wx.hideLoading();
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
    const payload = buildStageUpdatePayload(
      this.data.status,
      fieldsForSave,
      userName,
      this._originalStage,
    );
    if (!payload) {
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
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
