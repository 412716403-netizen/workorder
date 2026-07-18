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
  extractImageAssetIdsFromHtml,
  extractPlayerVideoAssetIdsFromHtml,
  buildKnowledgeDocBlocks,
  applyImageBlockLayout,
} = require('../utils/knowledgeHtmlForMini.js');
const { formatDateShort } = require('../utils/knowledgeTree.js');
const {
  resolveOpenDocumentFileType,
  formatUnpreviewableMessage,
} = require('../utils/knowledgeAttachmentForMini.js');

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
    this._fileTempByAssetId = {};
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
    this._fileTempByAssetId = {};
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

  onDocumentTap(e) {
    const documentId = e.currentTarget.dataset.id;
    if (!documentId) {
      wx.showToast({ title: '文档信息无效', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/knowledge-doc-detail/knowledge-doc-detail?id=${encodeURIComponent(documentId)}`,
    });
  },

  async onFileTap(e) {
    const ds = e.currentTarget.dataset || {};
    const assetId = ds.assetId;
    const fileName = ds.fileName || '附件';
    const mimeType = ds.mimeType || 'application/octet-stream';
    const kind = ds.kind || 'other';
    if (!assetId) {
      wx.showToast({ title: '附件无效', icon: 'none' });
      return;
    }

    if (kind === 'image') {
      try {
        const path = await this.ensureFileTempPath(assetId, fileName, mimeType);
        wx.previewImage({ current: path, urls: [path] });
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '预览失败', icon: 'none' });
      }
      return;
    }

    if (kind === 'video') {
      wx.showLoading({ title: '打开中…', mask: true });
      try {
        const path = await this.ensureFileTempPath(assetId, fileName, mimeType);
        if (typeof wx.previewMedia === 'function') {
          await new Promise((resolve, reject) => {
            wx.previewMedia({
              sources: [{ url: path, type: 'video' }],
              current: 0,
              success: resolve,
              fail: reject,
            });
          });
        } else {
          wx.showModal({
            title: '无法播放',
            content: '当前微信版本过低，请升级后重试，或在电脑端播放。',
            showCancel: false,
          });
        }
      } catch (err) {
        wx.showToast({
          title: (err && err.errMsg) || (err && err.message) || '播放失败',
          icon: 'none',
        });
      } finally {
        wx.hideLoading();
      }
      return;
    }

    const fileType = resolveOpenDocumentFileType(fileName, mimeType);
    if (!fileType) {
      wx.showModal({
        title: '无法预览',
        content: `${formatUnpreviewableMessage(fileName)}，请在电脑端打开或下载。`,
        showCancel: false,
      });
      return;
    }

    wx.showLoading({ title: '打开中…', mask: true });
    try {
      const filePath = await this.ensureFileTempPath(assetId, fileName, mimeType);
      await new Promise((resolve, reject) => {
        wx.openDocument({
          filePath,
          fileType,
          showMenu: true,
          success: resolve,
          fail: reject,
        });
      });
    } catch (err) {
      wx.showModal({
        title: '无法打开',
        content: (err && err.errMsg) || (err && err.message) || '打开失败，请在电脑端查看',
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
    }
  },

  async ensureFileTempPath(assetId, fileName, mimeType) {
    const cached = this._fileTempByAssetId && this._fileTempByAssetId[assetId];
    if (cached) return cached;
    const { buffer, mimeType: serverMime } = await fetchKnowledgeAssetBuffer(assetId);
    if (!buffer) throw new Error('下载失败');
    const filePath = await writeKnowledgeAssetTempFile(
      assetId,
      buffer,
      serverMime || mimeType,
      fileName,
    );
    this._fileTempByAssetId = this._fileTempByAssetId || {};
    this._fileTempByAssetId[assetId] = filePath;
    this._tempAssetPaths = (this._tempAssetPaths || []).concat(filePath);
    return filePath;
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
      // 预拉正文图片 + 内嵌播放视频；标签式附件仍按点击再下载
      const imageIds = extractImageAssetIdsFromHtml(content);
      const playerVideoIds = extractPlayerVideoAssetIdsFromHtml(content);
      const assetIds = Array.from(new Set(imageIds.concat(playerVideoIds)));
      const urlById = {};
      const tempPaths = [];
      this._fileTempByAssetId = {};

      await Promise.all(
        assetIds.map(async (assetId) => {
          try {
            const { buffer, mimeType } = await fetchKnowledgeAssetBuffer(assetId);
            if (!buffer) return;
            const filePath = await writeKnowledgeAssetTempFile(assetId, buffer, mimeType);
            urlById[assetId] = filePath;
            tempPaths.push(filePath);
            this._fileTempByAssetId[assetId] = filePath;
          } catch {
            // 单资源失败不阻断正文
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
