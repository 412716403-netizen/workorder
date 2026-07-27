const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const {
  fetchPartnersAll,
  fetchCategoriesAll,
  fetchDictionaries,
} = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { request } = require('../../utils/request.js');
const {
  getDevStyle,
  updateDevStyle,
  publishDevStyle,
  addDevSample,
  deleteDevSample,
} = require('../utils/developmentApi.js');
const { buildStyleDetailView, findSampleById } = require('../utils/devStyleDetailView.js');
const { DevStyleStatus } = require('../utils/devStyleConstants.js');
const { promptCreateTodo } = require('../utils/devTodoCreate.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx);
}

function notifyHubChanged() {
  try {
    const ec = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null;
    if (ec && ec.emit) ec.emit('hubListChanged');
  } catch {
    // ignore
  }
}

Page({
  data: {
    loading: true,
    styleId: '',
    detail: null,
    activeSampleId: '',
    activeSample: null,
    sampleSheetOpen: false,
    logSheetOpen: false,
    logRows: [],
    addSampleOpen: false,
    sampleName: '',
    sampleVariantIndex: -1,
    sampleVariantOptions: [],
    saving: false,
    showTodoBtn: false,
    showMaterialSection: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const styleId = options.styleId ? decodeURIComponent(options.styleId) : '';
    this._deepStageId = options.devStageId ? decodeURIComponent(options.devStageId) : '';
    this._deepSampleId = options.devSampleId ? decodeURIComponent(options.devSampleId) : '';
    this._openBom = options.openBom === '1' || options.openBom === 'true';
    this.setData({
      styleId,
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
      const perms = ctx.permissions || [];
      if (!hasPermission(perms, 'development:styles:view')) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._canEdit = hasPermission(perms, 'development:styles:edit');
      this._canDelete = hasPermission(perms, 'development:styles:delete');
      const canMaterialIssue = hasPermission(perms, 'development:material_issue:create');
      const canMaterialReturn = hasPermission(perms, 'development:material_return:create');
      const canMaterialRecords = hasPermission(perms, 'development:material_records:view');
      this.setData({
        showTodoBtn: isPluginEnabled(plugins, 'todo_reminder'),
        showMaterialSection: canMaterialIssue || canMaterialReturn || canMaterialRecords,
      });
      this.bootstrap();
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  noop() {},

  async bootstrap() {
    const styleId = this.data.styleId;
    if (!styleId) {
      this.setData({ loading: false, detail: null });
      return;
    }
    this.setData({ loading: true });
    try {
      const [style, partners, categories, dictRaw, nodesRaw] = await Promise.all([
        getDevStyle(styleId),
        fetchPartnersAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
      ]);
      if (!style) {
        wx.showToast({ title: '款式不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this._style = style;
      this._partners = partners || [];
      this._categories = categories || [];
      this._dictionaries = normalizeAppDictionaries(dictRaw);
      this._globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
      this.applyStyle(style);
      this.handleDeepLinks();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  applyStyle(style) {
    const detail = buildStyleDetailView(style, {
      partners: this._partners,
      categories: this._categories,
      dictionaries: this._dictionaries,
      globalNodes: this._globalNodes,
      canEdit: this._canEdit,
      canDelete: this._canDelete,
    });
    let activeSampleId = this.data.activeSampleId;
    if (!activeSampleId || !detail.samples.some((s) => s.id === activeSampleId)) {
      activeSampleId = detail.samples[0] ? detail.samples[0].id : '';
    }
    const activeSample = detail.samples.find((s) => s.id === activeSampleId) || null;
    this.setData({
      loading: false,
      detail,
      activeSampleId,
      activeSample,
    });
  },

  openMaterialPage() {
    const style = this._style;
    if (!style) return;
    const q = [
      `styleId=${encodeURIComponent(style.id)}`,
      `styleName=${encodeURIComponent(style.name || '')}`,
      `styleCode=${encodeURIComponent(style.code || '')}`,
    ];
    wx.navigateTo({
      url: `/packageBusiness/development-material-records/development-material-records?${q.join('&')}`,
    });
  },

  onMaterialTap() {
    this.openMaterialPage();
  },

  handleDeepLinks() {
    const style = this._style;
    if (!style) return;
    if (this._deepStageId) {
      const stageId = this._deepStageId;
      this._deepStageId = '';
      for (const sample of style.samples || []) {
        if ((sample.stages || []).some((st) => st.id === stageId)) {
          this.setData({ activeSampleId: sample.id });
          this.applyStyle(style);
          wx.navigateTo({
            url: `/packageBusiness/development-stage-register/development-stage-register?styleId=${encodeURIComponent(style.id)}&stageId=${encodeURIComponent(stageId)}`,
          });
          return;
        }
      }
    }
    if (this._deepSampleId) {
      const sampleId = this._deepSampleId;
      this._deepSampleId = '';
      if ((style.samples || []).some((s) => s.id === sampleId)) {
        this.setData({ activeSampleId: sampleId });
        this.applyStyle(style);
        if (this._openBom) {
          this._openBom = false;
          this.openBomForSample(sampleId);
        }
      }
    } else if (this._openBom) {
      this._openBom = false;
      const sid = this.data.activeSampleId;
      if (sid) this.openBomForSample(sid);
    }
  },

  onSampleTabTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeSampleId) return;
    const activeSample = (this.data.detail.samples || []).find((s) => s.id === id) || null;
    this.setData({ activeSampleId: id, activeSample });
  },

  onEditTap() {
    if (!this.data.detail || !this.data.detail.actions.showEdit) return;
    wx.navigateTo({
      url: `/packageBusiness/development-style-edit/development-style-edit?id=${encodeURIComponent(this.data.styleId)}`,
    });
  },

  onProductTap() {
    this.onEditTap();
  },

  onAddTodoTap() {
    if (!this.data.showTodoBtn || !this._style) return;
    const style = this._style;
    const name = style.name || style.code || '';
    const code = style.code && style.name && style.code !== style.name ? ` · ${style.code}` : '';
    promptCreateTodo({
      sourceType: 'dev_style',
      sourceId: style.id,
      sourceDocNo: '开发管理',
      sourceTitle: `${name}${code}`,
      href: `/development?styleId=${encodeURIComponent(style.id)}`,
    });
  },

  onArchiveTap() {
    this.toggleArchive(DevStyleStatus.ARCHIVED);
  },

  onRestoreTap() {
    this.toggleArchive(DevStyleStatus.DEVELOPING);
  },

  async toggleArchive(nextStatus) {
    if (!this._style || this.data.saving) return;
    const label = nextStatus === DevStyleStatus.ARCHIVED ? '归档' : '还原至开发中';
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: label,
        content:
          nextStatus === DevStyleStatus.ARCHIVED
            ? '归档后可在「已归档」页签中查看。'
            : '将恢复为开发中状态。',
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;
    this.setData({ saving: true });
    try {
      // 只改状态：不要把整棵详情（主图 + 样品附件 data URL）重传
      const saved = await updateDevStyle(this._style.id, { status: nextStatus });
      this._style = saved;
      this.applyStyle(saved);
      notifyHubChanged.call(this);
      wx.showToast({ title: nextStatus === DevStyleStatus.ARCHIVED ? '已归档' : '已还原', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onPublishTap() {
    if (!this._style || this.data.saving) return;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '生成商品',
        content: '将把已归档产品的分类、工序、变体与 BOM 写入产品档案，并标记为已发布。是否继续？',
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;
    this.setData({ saving: true });
    try {
      const result = await publishDevStyle(this._style.id);
      const saved = result && result.style ? result.style : await getDevStyle(this._style.id);
      this._style = saved;
      this.applyStyle(saved);
      notifyHubChanged.call(this);
      wx.showToast({ title: '已生成商品', icon: 'success' });
    } catch (err) {
      const msg = (err && err.message) || '发布失败';
      if (String(msg).length > 20) {
        wx.showModal({ title: '生成商品失败', content: String(msg), showCancel: false });
      } else {
        wx.showToast({ title: msg, icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  onAddSampleOpen() {
    if (!this.data.detail || !this.data.detail.actions.showAddSample) return;
    const samples = this._style.samples || [];
    const defaultName = samples.length === 0 ? '头样' : `样品 ${samples.length}`;
    const sampleVariantOptions = (this.data.detail.variantOptions || []).map((v, idx) => ({
      key: `${v.colorId || ''}__${v.sizeId || ''}__${idx}`,
      label: v.label,
      colorId: v.colorId,
      sizeId: v.sizeId,
      selected: false,
    }));
    this.setData({
      addSampleOpen: true,
      sampleName: defaultName,
      sampleVariantIndex: -1,
      sampleVariantOptions,
    });
  },

  onAddSampleClose() {
    this.setData({ addSampleOpen: false });
  },

  onSampleNameInput(e) {
    this.setData({ sampleName: e.detail.value || '' });
  },

  onSampleVariantTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx < 0) return;
    const sampleVariantOptions = (this.data.sampleVariantOptions || []).map((v, i) => ({
      ...v,
      selected: i === idx,
    }));
    this.setData({ sampleVariantIndex: idx, sampleVariantOptions });
  },

  async onAddSampleConfirm() {
    if (!this._style || this.data.saving) return;
    const detail = this.data.detail;
    let colorId;
    let sizeId;
    if (detail.hasVariants) {
      const idx = this.data.sampleVariantIndex;
      const opt = (detail.variantOptions || [])[idx];
      if (!opt) {
        wx.showToast({ title: '请选择颜色尺码', icon: 'none' });
        return;
      }
      colorId = opt.colorId;
      sizeId = opt.sizeId;
    }
    this.setData({ saving: true });
    try {
      const saved = await addDevSample(this._style.id, {
        name: this.data.sampleName || undefined,
        colorId,
        sizeId,
      });
      this._style = saved;
      this.setData({ addSampleOpen: false });
      const newest = (saved.samples || [])[saved.samples.length - 1];
      if (newest) this.setData({ activeSampleId: newest.id });
      this.applyStyle(saved);
      notifyHubChanged.call(this);
      wx.showToast({ title: '已添加样品', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onDeleteSampleTap() {
    const sample = this.data.activeSample;
    const actions = this.data.detail && this.data.detail.actions;
    if (!sample || !this._canEdit || !(actions && actions.showDeleteSample)) return;
    if (!sample.canDelete) {
      wx.showToast({ title: sample.deleteBlockReason || '无法删除', icon: 'none' });
      return;
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除样品',
        content: `确定删除「${sample.name}」？`,
        success: (res) => resolve(!!res.confirm),
      });
    });
    if (!ok) return;
    this.setData({ saving: true });
    try {
      const saved = await deleteDevSample(sample.id);
      this._style = saved;
      this.setData({ activeSampleId: '' });
      this.applyStyle(saved);
      notifyHubChanged.call(this);
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onThumbPreview(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    const sample = this.data.activeSample;
    const urls = [];
    ((sample && sample.stageRows) || []).forEach((row) => {
      (row.fieldThumbs || []).forEach((t) => {
        if (t && t.src) urls.push(t.src);
      });
    });
    wx.previewImage({
      current: src,
      urls: urls.length ? urls : [src],
    });
  },

  onStageTap(e) {
    const stageId = e.currentTarget.dataset.id;
    if (!stageId || !this._style) return;
    if (this.data.detail.readOnly) {
      wx.showToast({ title: '已发布不可编辑', icon: 'none' });
      return;
    }
    if (!this._canEdit) {
      wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/development-stage-register/development-stage-register?styleId=${encodeURIComponent(this._style.id)}&stageId=${encodeURIComponent(stageId)}`,
    });
  },

  onBomTap() {
    if (!this._style) return;
    if (this.data.detail.readOnly) {
      wx.showToast({ title: '已发布不可编辑', icon: 'none' });
      return;
    }
    const sampleId = this.data.activeSampleId;
    // 有选中样品：按样品颜色尺码过滤；无样品时打开款式级全量 BOM
    if (sampleId) {
      this.openBomForSample(sampleId);
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/development-bom-edit/development-bom-edit?styleId=${encodeURIComponent(this._style.id)}`,
    });
  },

  openBomForSample(sampleId) {
    if (!this._style) return;
    if (this.data.detail.readOnly) {
      wx.showToast({ title: '已发布不可编辑', icon: 'none' });
      return;
    }
    const sample = findSampleById(this._style, sampleId);
    const qs = [
      `styleId=${encodeURIComponent(this._style.id)}`,
      `sampleId=${encodeURIComponent(sampleId)}`,
    ];
    if (sample && sample.colorId) qs.push(`colorId=${encodeURIComponent(sample.colorId)}`);
    if (sample && sample.sizeId) qs.push(`sizeId=${encodeURIComponent(sample.sizeId)}`);
    wx.navigateTo({
      url: `/packageBusiness/development-bom-edit/development-bom-edit?${qs.join('&')}`,
    });
  },

  onLogsTap() {
    const sample = findSampleById(this._style, this.data.activeSampleId);
    const logs = ((sample && sample.logs) || []).map((log) => ({
      id: log.id,
      user: log.user || '',
      action: log.action || '',
      detail: log.detail || '',
      time: log.time || '',
    }));
    this.setData({ logSheetOpen: true, logRows: logs });
  },

  onLogsClose() {
    this.setData({ logSheetOpen: false });
  },

  onImageError() {
    if (!this.data.detail) return;
    this.setData({
      detail: { ...this.data.detail, showProductImage: false },
    });
  },
});
