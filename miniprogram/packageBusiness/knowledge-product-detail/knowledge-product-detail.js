const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { getProduct, fetchProductsAll, fetchBomsAll } = require('../utils/productApi.js');
const {
  fetchCategoriesAll,
  fetchDictionaries,
  fetchPartnersAll,
  fetchNodesAll,
} = require('../../utils/planApi.js');
const { normalizeMasterList } = require('../utils/productionOrders.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../../utils/listProductThumb.js');
const {
  buildKnowledgeProductDetailView,
  sanitizeProductForMiniView,
  slimProductsForBomLookup,
} = require('../utils/knowledgeProductDetailView.js');
const {
  resolveOpenDocumentFileType,
  formatUnpreviewableMessage,
  getFileExtension,
} = require('../utils/knowledgeAttachmentForMini.js');
const { isImageDataUrl } = require('../utils/fileBase64.js');

function computeHeaderBlockHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  return Math.max(200, (win.windowHeight || 667) - computeHeaderBlockHeight(nav));
}

function mimeFromDataUrl(url) {
  const m = /^data:([^;,]+)/i.exec(String(url || '').trim());
  return (m && m[1] ? m[1] : '').trim().toLowerCase();
}

/** 将 data URL 写到本地临时路径，供 image / previewImage 使用（避免大 base64 进 setData） */
function writeDataUrlTempFile(dataUrl, productId) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
      resolve('');
      return;
    }
    const comma = dataUrl.indexOf(',');
    if (comma < 0) {
      resolve('');
      return;
    }
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const mimeMatch = /data:([^;]+)/.exec(meta);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    let ext = 'jpg';
    if (mime.indexOf('png') >= 0) ext = 'png';
    else if (mime.indexOf('webp') >= 0) ext = 'webp';
    else if (mime.indexOf('gif') >= 0) ext = 'gif';
    const base =
      (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || '';
    if (!base || typeof wx === 'undefined' || !wx.getFileSystemManager) {
      resolve('');
      return;
    }
    const filePath = `${base}/kb-prod-img-${String(productId || 'x').replace(/[^\w-]/g, '')}.${ext}`;
    try {
      wx.getFileSystemManager().writeFile({
        filePath,
        data: b64,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: () => resolve(''),
      });
    } catch {
      resolve('');
    }
  });
}

/** data URL → 临时文件，供 wx.openDocument / previewImage */
function writeAttachDataUrlTempFile(dataUrl, fileName) {
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
      : mime.indexOf('png') >= 0
        ? 'png'
        : mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0
          ? 'jpg'
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
  const filePath = `${base}/kb-prod-file-${Date.now()}-${safe}.${ext}`;
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

Page({
  data: {
    loading: true,
    found: false,
    emptyText: '产品不存在',
    hero: null,
    rows: [],
    customRows: [],
    showCustomSection: false,
    processRows: [],
    processEmpty: true,
    showBomSection: false,
    bomSkuOptions: [],
    showBomSkuTabs: false,
    bomGroups: [],
    bomEmptyText: '',
    showBomEmpty: false,
    showWhereUsedSection: false,
    whereUsedRows: [],
    whereUsedCollapsible: false,
    whereUsedToggleText: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
    scrollHeight: 600,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._productId = options.id ? decodeURIComponent(options.id) : '';
      this._bomSkuId = '';
      this._bomExpandedKeys = {};
      this._whereUsedExpanded = false;
    this._bomExpandedKeys = {};
    this._imageTempPath = '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
  },

  onUnload() {
    const paths = [];
    if (this._imageTempPath) paths.push(this._imageTempPath);
    (this._fileTempPaths || []).forEach((p) => {
      if (p) paths.push(p);
    });
    if (!paths.length || typeof wx === 'undefined' || !wx.getFileSystemManager) return;
    const fs = wx.getFileSystemManager();
    paths.forEach((path) => {
      try {
        fs.unlinkSync(path);
      } catch {
        // ignore
      }
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
    if (!hasPermission(ctx.permissions || [], 'basic:products:view')) {
      wx.showToast({ title: '无产品查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!this._loaded) {
      this.loadProduct();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPreviewImage() {
    const url = this.data.hero && this.data.hero.imageUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onBomSkuTap(e) {
    const id = e.detail && e.detail.id;
    if (!id || id === this._bomSkuId) return;
    this._bomSkuId = id;
    this._bomExpandedKeys = {};
    this.applyView({ fields: 'bom' });
  },

  onBomExpandTap(e) {
    const rowKey = e.detail && e.detail.rowKey;
    if (!rowKey) return;
    const next = { ...(this._bomExpandedKeys || {}) };
    if (next[rowKey]) delete next[rowKey];
    else next[rowKey] = true;
    this._bomExpandedKeys = next;
    this.applyView({ fields: 'bom' });
  },

  /** BOM 子件 / 被调用父产品：同一路由再开一层，可逐级 navigateBack */
  onProductTap(e) {
    const productId = (e.detail && e.detail.productId) || '';
    if (!productId || productId === this._productId) return;
    const url = `/packageBusiness/knowledge-product-detail/knowledge-product-detail?id=${encodeURIComponent(productId)}`;
    // 微信页面栈上限 10；钻取过深时用 redirectTo 避免 navigateTo:fail
    const stackDepth = (getCurrentPages() || []).length;
    if (stackDepth >= 9) {
      wx.redirectTo({ url });
      return;
    }
    wx.navigateTo({ url });
  },

  onWhereUsedToggle() {
    this._whereUsedExpanded = !this._whereUsedExpanded;
    this.applyView({ fields: 'whereUsed' });
  },

  onCustomKnowledgeTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    const title = (e.detail && e.detail.title) || '资料库文件';
    wx.navigateTo({
      url: `/packageBusiness/knowledge-doc-detail/knowledge-doc-detail?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
    });
  },

  onCustomFileTap(e) {
    const fieldId = e.detail && e.detail.fieldId;
    if (!fieldId) return;
    const items = ((this._fileFieldsById && this._fileFieldsById[fieldId]) || []).filter(
      (it) => it && !it.isImage,
    );
    const fallback = (this._fileFieldsById && this._fileFieldsById[fieldId]) || [];
    const list = items.length ? items : fallback;
    if (!list.length) {
      wx.showToast({ title: '附件不可用', icon: 'none' });
      return;
    }
    if (list.length === 1) {
      this.openCustomFileItem(list[0], fieldId);
      return;
    }
    wx.showActionSheet({
      itemList: list.map((it, idx) => it.name || `附件 ${idx + 1}`),
      success: (res) => {
        const item = list[res.tapIndex];
        if (item) this.openCustomFileItem(item, fieldId);
      },
    });
  },

  onCustomFileThumbTap(e) {
    const fieldId = e.detail && e.detail.fieldId;
    const index = e.detail && e.detail.index;
    if (!fieldId) return;
    const items = (this._fileFieldsById && this._fileFieldsById[fieldId]) || [];
    const imageItems = items.filter((it) => it && it.isImage && it.localPath);
    if (!imageItems.length) {
      const item = items[index];
      if (item) this.openCustomFileItem(item, fieldId);
      return;
    }
    const urls = imageItems.map((it) => it.localPath);
    const currentItem = items[index];
    const current =
      currentItem && currentItem.localPath && urls.indexOf(currentItem.localPath) >= 0
        ? currentItem.localPath
        : urls[0];
    wx.previewImage({ current, urls });
  },

  openCustomFileItem(item, fieldId) {
    if (!item || !item.url) return;
    if (item.isImage || isImageDataUrl(item.url)) {
      const fieldItems = (this._fileFieldsById && this._fileFieldsById[fieldId]) || [item];
      const withPath = fieldItems.filter((it) => it && it.isImage && it.localPath);
      if (withPath.length) {
        const urls = withPath.map((it) => it.localPath);
        const current = item.localPath && urls.indexOf(item.localPath) >= 0 ? item.localPath : urls[0];
        wx.previewImage({ current, urls });
        return;
      }
      wx.showLoading({ title: '打开中…', mask: true });
      writeAttachDataUrlTempFile(item.url, item.name || 'image.jpg')
        .then((filePath) => {
          wx.previewImage({
            current: filePath,
            urls: [filePath],
          });
        })
        .catch(() => {
          wx.showToast({ title: '无法预览图片', icon: 'none' });
        })
        .finally(() => wx.hideLoading());
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
    writeAttachDataUrlTempFile(item.url, fileName)
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

  /**
   * @param {{ fields?: 'all' | 'bom' | 'whereUsed' }} [options]
   * 规格切换 / 展开被调用只推相关字段，避免整包视图反复 setData。
   */
  applyView(options) {
    if (!this._product) return;
    const fields = (options && options.fields) || 'all';
    const view = buildKnowledgeProductDetailView({
      product: this._product,
      category: this._category,
      categories: this._categories,
      dictionaries: this._dictionaries,
      partners: this._partners,
      globalNodes: this._nodes,
      boms: this._boms,
      products: this._products,
      bomSkuId: this._bomSkuId,
      whereUsedExpanded: this._whereUsedExpanded,
      bomExpandedKeys: this._bomExpandedKeys,
    });
    if (!this._bomSkuId && view.defaultBomSkuId) {
      this._bomSkuId = view.defaultBomSkuId;
      return this.applyView(options);
    }
    if (fields === 'bom') {
      this.setData({
        bomSkuOptions: view.bomSkuOptions || [],
        showBomSkuTabs: view.showBomSkuTabs,
        bomGroups: view.bomGroups || [],
        bomEmptyText: view.bomEmptyText || '',
        showBomEmpty: view.showBomEmpty,
      });
      return;
    }
    if (fields === 'whereUsed') {
      this.setData({
        whereUsedRows: view.whereUsedRows || [],
        whereUsedCollapsible: view.whereUsedCollapsible,
        whereUsedToggleText: view.whereUsedToggleText || '',
      });
      return;
    }
    this.setData({
      loading: false,
      found: true,
      hero: {
        productName: view.productName,
        productSku: view.productSku,
        showProductSku: view.showProductSku,
        categoryName: view.categoryName,
        imageUrl: view.imageUrl,
        showImage: view.showImage,
        placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
      },
      rows: view.rows || [],
      customRows: view.customRows || [],
      showCustomSection: view.showCustomSection,
      processRows: view.processRows || [],
      processEmpty: view.processEmpty,
      showBomSection: view.showBomSection,
      bomSkuOptions: view.bomSkuOptions || [],
      showBomSkuTabs: view.showBomSkuTabs,
      bomGroups: view.bomGroups || [],
      bomEmptyText: view.bomEmptyText || '',
      showBomEmpty: view.showBomEmpty,
      showWhereUsedSection: view.showWhereUsedSection,
      whereUsedRows: view.whereUsedRows || [],
      whereUsedCollapsible: view.whereUsedCollapsible,
      whereUsedToggleText: view.whereUsedToggleText || '',
    });
  },

  async loadProduct() {
    const id = this._productId;
    if (!id) {
      this.setData({ loading: false, found: false, emptyText: '缺少产品 id' });
      return;
    }
    this.setData({ loading: true });
    try {
      const [
        productRaw,
        categoriesRaw,
        dictionariesRaw,
        partnersRaw,
        nodesRaw,
        bomsRaw,
        productsRaw,
      ] = await Promise.all([
        getProduct(id),
        fetchCategoriesAll(),
        fetchDictionaries(),
        fetchPartnersAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        fetchBomsAll().catch(() => []),
        fetchProductsAll().catch(() => []),
      ]);
      if (!productRaw) {
        this.setData({ loading: false, found: false });
        return;
      }
      const product = sanitizeProductForMiniView(productRaw);
      const dataUrlForTemp = product._imageDataUrlForTemp || '';
      const fileFieldsById = product._fileFieldsById || {};
      delete product._imageDataUrlForTemp;
      this._fileFieldsById = fileFieldsById;
      this._fileTempPaths = [];

      if (dataUrlForTemp) {
        const localPath = await writeDataUrlTempFile(dataUrlForTemp, id);
        if (localPath) {
          product.imageLocalPath = localPath;
          this._imageTempPath = localPath;
        }
      }

      // 图片类扩展附件落本地，供缩略图直接展示（禁止大 base64 进 setData）；并行写盘缩短首屏
      const attachJobs = [];
      const fieldIds = Object.keys(fileFieldsById);
      for (let fi = 0; fi < fieldIds.length; fi += 1) {
        const fieldId = fieldIds[fi];
        const items = fileFieldsById[fieldId] || [];
        for (let i = 0; i < items.length; i += 1) {
          const it = items[i];
          if (!it || !it.url) continue;
          const asImage = it.isImage || isImageDataUrl(it.url);
          if (!asImage) continue;
          it.isImage = true;
          const name = it.name || `img-${fi}-${i}.jpg`;
          attachJobs.push(
            writeAttachDataUrlTempFile(it.url, name)
              .then((localPath) => {
                if (localPath) {
                  it.localPath = localPath;
                  this._fileTempPaths.push(localPath);
                }
              })
              .catch(() => {
                // 写失败则仍可点文字打开
              }),
          );
        }
      }
      if (attachJobs.length) await Promise.all(attachJobs);
      product._fileFieldsById = fileFieldsById;

      this._loaded = true;
      this._product = product;
      this._categories = normalizeMasterList(categoriesRaw);
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw);
      this._partners = normalizeMasterList(partnersRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._boms = Array.isArray(bomsRaw) ? bomsRaw : normalizeMasterList(bomsRaw);
      this._products = slimProductsForBomLookup(normalizeMasterList(productsRaw));
      this._category = product.categoryId
        ? this._categories.find((c) => c.id === product.categoryId)
        : null;
      this._bomSkuId = '';
      this._bomExpandedKeys = {};
      this.applyView();
    } catch (err) {
      this.setData({
        loading: false,
        found: false,
        emptyText: (err && err.message) || '加载失败',
      });
    }
  },
});
