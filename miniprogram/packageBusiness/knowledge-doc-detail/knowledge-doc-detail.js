const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  getKnowledgeDocument,
  fetchKnowledgeAssetBuffer,
  writeKnowledgeAssetTempFile,
  removeKnowledgeAssetTempFiles,
} = require('../utils/knowledgeApi.js');
const {
  extractKnowledgeAssetIdsFromHtml,
  buildKnowledgeDocBlocks,
  applyImageBlockLayout,
} = require('../utils/knowledgeHtmlForMini.js');
const { formatDateShort } = require('../utils/knowledgeTree.js');

function computeHeaderBlockHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight;
}

Page({
  data: {
    loading: true,
    found: false,
    title: '',
    updatedText: '',
    blocks: [],
    previewUrls: [],
    emptyText: '文档不存在或无权查看',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
    scrollHeight: 600,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const win = readWindowMetrics();
    const headerBlockHeight = computeHeaderBlockHeight(nav);
    const docId = options.id ? decodeURIComponent(options.id) : '';
    const titleHint = options.title ? decodeURIComponent(options.title) : '';
    this._docId = docId;
    this._windowWidth = win.windowWidth || 375;
    this._tempAssetPaths = [];
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight,
      scrollHeight: Math.max(320, win.windowHeight - headerBlockHeight),
      title: titleHint || '文档',
    });
  },

  onUnload() {
    removeKnowledgeAssetTempFiles(this._tempAssetPaths || []);
    this._tempAssetPaths = [];
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
      if (!isPluginEnabled(plugins, 'knowledge_base')) {
        wx.showToast({ title: '资料库插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!hasPermission(ctx.permissions || [], 'knowledge_base:documents:view')) {
        wx.showToast({ title: '无权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!this._loaded) {
        this.loadDocument();
      }
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onImageTap(e) {
    const urls = this.data.previewUrls || [];
    if (!urls.length) return;
    const index = Number(e.currentTarget.dataset.index);
    const current = Number.isFinite(index) && urls[index] ? urls[index] : urls[0];
    wx.previewImage({ current, urls });
  },

  onProductTap(e) {
    const productId = e.currentTarget.dataset.id;
    if (!productId) {
      wx.showToast({ title: '产品信息无效', icon: 'none' });
      return;
    }
    const ctx = this._tenantCtx || readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    if (!hasPermission(perms, 'basic:products:view')) {
      wx.showToast({ title: '暂无产品查看权限', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/knowledge-product-detail/knowledge-product-detail?id=${encodeURIComponent(productId)}`,
    });
  },

  async loadDocument() {
    const id = this._docId;
    if (!id) {
      this.setData({ loading: false, found: false, emptyText: '缺少文档 id' });
      return;
    }
    this.setData({ loading: true });
    try {
      const doc = await getKnowledgeDocument(id);
      if (!doc) {
        this.setData({ loading: false, found: false });
        return;
      }
      this._loaded = true;
      const content = String(doc.content || '');
      const assetIds = extractKnowledgeAssetIdsFromHtml(content);
      const urlById = {};
      const tempPaths = [];

      await Promise.all(
        assetIds.map(async (assetId) => {
          try {
            const { buffer, mimeType } = await fetchKnowledgeAssetBuffer(assetId);
            if (!buffer) return;
            // 写本地文件，禁止把 base64 塞进 setData（易触发 1MB+ 传输与渲染层错误）
            const filePath = await writeKnowledgeAssetTempFile(assetId, buffer, mimeType);
            urlById[assetId] = filePath;
            tempPaths.push(filePath);
          } catch {
            // 单张失败不阻断正文
          }
        }),
      );
      this._tempAssetPaths = tempPaths;

      const maxContentWidthPx = Math.max(160, (this._windowWidth || 375) - 48);
      const { blocks, previewUrls } = buildKnowledgeDocBlocks(content, urlById, {
        maxContentWidthPx,
      });
      const layoutBlocks = applyImageBlockLayout(blocks, this._windowWidth, 48);
      this.setData({
        loading: false,
        found: true,
        title: doc.title || '未命名文档',
        updatedText: formatDateShort(doc.updatedAt)
          ? `更新于 ${formatDateShort(doc.updatedAt)}`
          : '',
        blocks: layoutBlocks.length
          ? layoutBlocks
          : [{ type: 'html', key: 'empty', html: '<p></p>', isTable: false }],
        previewUrls,
      });
    } catch (err) {
      this.setData({
        loading: false,
        found: false,
        emptyText: (err && err.message) || '加载失败',
      });
    }
  },
});
