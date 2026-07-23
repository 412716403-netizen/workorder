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
  collectKnowledgeOutlineFromHtml,
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
    outline: [],
    outlineOpen: false,
    scrollTop: 0,
    emptyText: '文档不存在或无权查看',
    statusBarHeight: 20,
    navBarHeight: 44,
    menuRightInset: 96,
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
      menuRightInset: nav.menuRightInset || 96,
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

  onToggleOutline() {
    if (!(this.data.outline || []).length) return;
    this.setData({ outlineOpen: !this.data.outlineOpen });
  },

  onCloseOutline() {
    this.setData({ outlineOpen: false });
  },

  onOutlineJump(e) {
    const ds = e.currentTarget.dataset || {};
    const elementId = ds.id || ds.elementId || ds.anchorId;
    if (!elementId) return;
    this.setData({ outlineOpen: false });
    // 等底栏动画结束再滚动；enhanced scroll-view 必须用 node().scrollTo
    setTimeout(() => {
      this.scrollToOutlineAnchor(String(elementId), 0);
    }, 220);
  },

  scrollToOutlineAnchor(elementId, attempt) {
    const tryCount = attempt || 0;
    const query = this.createSelectorQuery();
    query.select('.plan-detail-scroll').scrollOffset();
    query.select('.plan-detail-scroll').boundingClientRect();
    query.select(`.kb-a-${elementId}`).boundingClientRect();
    query.select(`#${elementId}`).boundingClientRect();
    query.select('.plan-detail-scroll').node();
    query.exec((res) => {
      const offset = res && res[0];
      const svRect = res && res[1];
      const targetByClass = res && res[2];
      const targetById = res && res[3];
      const targetRect =
        targetByClass && targetByClass.height > 0
          ? targetByClass
          : targetById && targetById.height > 0
            ? targetById
            : null;
      const scrollNode = res && res[4] && res[4].node;

      if (!offset || !svRect || !targetRect) {
        if (tryCount < 8) {
          setTimeout(() => this.scrollToOutlineAnchor(elementId, tryCount + 1), 60);
        } else {
          console.warn('[kb-doc] scrollToOutlineAnchor miss', elementId, res);
        }
        return;
      }

      const nextTop = Math.max(0, offset.scrollTop + (targetRect.top - svRect.top) - 12);
      if (scrollNode && typeof scrollNode.scrollTo === 'function') {
        scrollNode.scrollTo({ top: nextTop, animated: true });
        return;
      }
      // 非 enhanced 兜底：双次 setData 强制触发 scroll-top
      const cur = Number(this.data.scrollTop) || 0;
      const bump = Math.abs(cur - nextTop) < 1 ? nextTop + 1.5 : 0.01;
      this.setData({ scrollTop: bump }, () => {
        this.setData({ scrollTop: nextTop });
      });
    });
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
      const built = buildKnowledgeDocBlocks(content, urlById, {
        maxContentWidthPx,
      });
      const layoutBlocks = applyImageBlockLayout(built.blocks || [], this._windowWidth, 48);
      let outline = Array.isArray(built.outline) ? built.outline : [];
      if (!outline.length) {
        outline = collectKnowledgeOutlineFromHtml(content);
      }
      // 若分块里已有 heading 但大纲为空，从块回填（防止解析漂移）
      if (!outline.length) {
        const fromBlocks = [];
        const walk = (list) => {
          (list || []).forEach((b) => {
            if (b && b.type === 'heading' && b.text) {
              fromBlocks.push({
                id: `${b.anchorId || fromBlocks.length}`,
                level: b.level || 3,
                text: b.text,
                elementId: b.anchorId || `kb-outline-${fromBlocks.length}`,
              });
            } else if (b && b.type === 'callout') {
              walk(b.blocks);
            } else if (b && b.type === 'table') {
              (b.rows || []).forEach((row) => {
                (row.cells || []).forEach((cell) => walk(cell.blocks));
              });
            }
          });
        };
        walk(layoutBlocks);
        outline = fromBlocks;
      }
      console.warn(
        `[kb-doc] id=${id} outline=${outline.length} hasH3=${/<\/?h3\b/i.test(content)} contentLen=${content.length}`,
      );
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
        previewUrls: built.previewUrls || [],
        outline,
        outlineOpen: false,
        scrollTop: 0,
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
