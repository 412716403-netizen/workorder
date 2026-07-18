const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const {
  listDevStageTemplates,
  createDevStageTemplate,
  updateDevStageTemplate,
} = require('../utils/developmentApi.js');

const FIELD_TYPES = [
  { id: 'text', label: '文本' },
  { id: 'date', label: '日期' },
  { id: 'select', label: '下拉' },
  { id: 'file', label: '文件' },
];

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function genFieldId() {
  return `dtf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function decorateFields(fields) {
  const list = fields || [];
  return list.map((f, idx) => ({
    ...f,
    orderLabel: String(idx + 1),
    canMoveUp: idx > 0,
    canMoveDown: idx < list.length - 1,
  }));
}

function moveFieldInList(fields, id, dir) {
  const list = [...(fields || [])];
  const idx = list.findIndex((f) => f.id === id);
  if (idx < 0) return list;
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;
  [list[idx], list[target]] = [list[target], list[idx]];
  return list;
}

Page({
  data: {
    loading: true,
    submitting: false,
    isEdit: false,
    pageTitle: '新建节点',
    name: '',
    fields: [],
    fieldCount: 0,
    fieldTypeOptions: FIELD_TYPES,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._id = options.id ? decodeURIComponent(options.id) : '';
    this._initialized = false;
    this.setData({
      isEdit: !!this._id,
      pageTitle: this._id ? '编辑节点' : '新建节点',
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
    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'development')) {
        wx.showToast({ title: '开发管理插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const need = this._id ? 'development:templates:edit' : 'development:templates:create';
      if (!hasPermission(ctx.permissions || [], need)) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!this._initialized) this.bootstrap();
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  setFields(fields) {
    const decorated = decorateFields(fields);
    this.setData({
      fields: decorated,
      fieldCount: decorated.length,
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      if (!this._id) {
        this.setData({
          loading: false,
          name: '',
          fields: [],
          fieldCount: 0,
        });
        return;
      }
      const list = await listDevStageTemplates();
      const tpl = (list || []).find((t) => t.id === this._id);
      if (!tpl) {
        wx.showToast({ title: '模板不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._order = tpl.order;
      const fields = [...(tpl.fields || [])]
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((f) => ({
          id: f.id || genFieldId(),
          label: f.label || '',
          type: f.type || 'text',
          required: !!f.required,
          optionsText: (f.options || []).join(','),
          dateWithTime: !!f.dateWithTime,
          dateAutoFill: !!f.dateAutoFill,
        }));
      this.setData({ loading: false, name: tpl.name || '' });
      this.setFields(fields);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value || '' });
  },

  onAddField() {
    this.setFields([
      ...(this.data.fields || []),
      {
        id: genFieldId(),
        label: '',
        type: 'text',
        required: false,
        optionsText: '',
        dateWithTime: false,
        dateAutoFill: false,
      },
    ]);
  },

  onFieldLabel(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value || '';
    this.setFields(
      (this.data.fields || []).map((f) => (f.id === id ? { ...f, label: value } : f)),
    );
  },

  onFieldTypeChip(e) {
    const { id, type } = e.currentTarget.dataset;
    if (!id || !type) return;
    this.setFields(
      (this.data.fields || []).map((f) => (f.id === id ? { ...f, type } : f)),
    );
  },

  patchFieldBool(id, key, value) {
    this.setFields(
      (this.data.fields || []).map((f) =>
        f.id === id ? { ...f, [key]: typeof value === 'boolean' ? value : !f[key] } : f,
      ),
    );
  },

  onFieldRequiredSwitch(e) {
    this.patchFieldBool(e.currentTarget.dataset.id, 'required', !!e.detail.value);
  },

  onFieldOptions(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value || '';
    this.setFields(
      (this.data.fields || []).map((f) => (f.id === id ? { ...f, optionsText: value } : f)),
    );
  },

  onFieldDateWithTimeSwitch(e) {
    this.patchFieldBool(e.currentTarget.dataset.id, 'dateWithTime', !!e.detail.value);
  },

  onFieldDateAutoFillSwitch(e) {
    this.patchFieldBool(e.currentTarget.dataset.id, 'dateAutoFill', !!e.detail.value);
  },

  onFieldMoveUp(e) {
    this.setFields(moveFieldInList(this.data.fields, e.currentTarget.dataset.id, 'up'));
  },

  onFieldMoveDown(e) {
    this.setFields(moveFieldInList(this.data.fields, e.currentTarget.dataset.id, 'down'));
  },

  onRemoveField(e) {
    const id = e.currentTarget.dataset.id;
    this.setFields((this.data.fields || []).filter((f) => f.id !== id));
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写节点名称', icon: 'none' });
      return;
    }
    const fields = (this.data.fields || []).map((f, idx) => {
      const type = f.type || 'text';
      const options =
        type === 'select'
          ? String(f.optionsText || '')
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      return {
        id: f.id,
        label: String(f.label || '').trim() || `字段${idx + 1}`,
        type,
        required: !!f.required,
        order: idx,
        options,
        dateWithTime: type === 'date' ? !!f.dateWithTime : undefined,
        dateAutoFill: type === 'date' ? !!f.dateAutoFill : undefined,
      };
    });
    for (const f of fields) {
      if (f.type === 'select' && !(f.options && f.options.length)) {
        wx.showToast({ title: `「${f.label}」请填写选项`, icon: 'none' });
        return;
      }
    }
    this.setData({ submitting: true });
    try {
      if (this._id) {
        await updateDevStageTemplate(this._id, { name, fields, order: this._order });
      } else {
        await createDevStageTemplate({ name, fields });
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
