const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../../utils/partnerApi.js'),fetchPartnersAll = _require3.fetchPartnersAll,createPartner = _require3.createPartner,updatePartner = _require3.updatePartner,deletePartner = _require3.deletePartner;
const _require4 = require('../../utils/planApi.js'),fetchPartnerCategoriesAll = _require4.fetchPartnerCategoriesAll;
const _require5 =



  require('../../utils/windowMetrics.js'),readNavBarMetrics = _require5.readNavBarMetrics,readWindowMetrics = _require5.readWindowMetrics,computePlanCreateHeaderHeight = _require5.computePlanCreateHeaderHeight;
const _require6 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require6.LIST_ROUTES,afterSaveReturnToList = _require6.afterSaveReturnToList;
const _require7 =




  require('../utils/partnerForm.js'),buildEmptyPartner = _require7.buildEmptyPartner,buildPartnerCustomFieldsForForm = _require7.buildPartnerCustomFieldsForForm,preparePartnerForSave = _require7.preparePartnerForSave,formatPartnerListNo = _require7.formatPartnerListNo;

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
    pageTitle: '编辑单位',
    isPersisted: false,
    canDelete: false,
    form: {
      name: '',
      customData: {}
    },
    categoryOptions: [],
    customFields: [],
    listNoText: '',
    showListNo: false,
    showCollab: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav)
    });
    this._partnerId = options.id ? decodeURIComponent(options.id) : '';
    this._defaultCategoryId = options.categoryId ? decodeURIComponent(options.categoryId) : '';
    this._initialized = false;
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
    if (!hasPermission(ctx.permissions || [], 'basic:partners:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canDelete: hasPermission(ctx.permissions || [], 'basic:partners:delete')
    });
    if (!this._initialized) {
      this.bootstrap();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchPartnersAll(),
        fetchPartnerCategoriesAll()]
        ),partners = _await$Promise$all[0],categories = _await$Promise$all[1];
      this._partners = partners || [];
      this._categories = categories || [];

      let partner;
      if (this._partnerId) {
        partner = (this._partners || []).find((p) => p.id === this._partnerId);
        if (!partner) {
          wx.showToast({ title: '单位不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
      } else {
        const defaultCategoryId = this._defaultCategoryId ||
        categories[0] && categories[0].id || '';
        partner = buildEmptyPartner(defaultCategoryId);
      }

      this._workingPartner = JSON.parse(JSON.stringify(partner));
      this.applyUiFromWorking();
    } catch (err) {
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  getActiveCategory() {
    return (this._categories || []).find((c) => c.id === this._workingPartner.categoryId);
  },

  applyUiFromWorking() {
    const partner = this._workingPartner;
    const category = this.getActiveCategory();
    const categoryOptions = (this._categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      selected: c.id === partner.categoryId
    }));
    const customFields = buildPartnerCustomFieldsForForm(category);

    this.setData({
      loading: false,
      pageTitle: this._partnerId ? '编辑单位' : '新增单位',
      isPersisted: !!this._partnerId,
      form: {
        name: partner.name || '',
        customData: partner.customData && typeof partner.customData === 'object' ?
        { ...partner.customData } :
        {}
      },
      categoryOptions,
      customFields,
      listNoText: formatPartnerListNo(partner.partnerListNo),
      showListNo: partner.partnerListNo != null,
      showCollab: Boolean(partner.collaborationTenantId)
    });
  },

  onNameInput(e) {
    this._workingPartner.name = e.detail.value || '';
    this.setData({ 'form.name': this._workingPartner.name });
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const cat = (this._categories || []).find((c) => c.id === id);
    if (!cat || cat.id === this._workingPartner.categoryId) return;
    this._workingPartner = {
      ...this._workingPartner,
      categoryId: cat.id,
      customData: {}
    };
    this.applyUiFromWorking();
  },

  onCustomFieldsChange(e) {
    const customData = e.detail && e.detail.customData || {};
    this._workingPartner.customData = { ...customData };
    this.setData({ 'form.customData': { ...customData } });
  },

  async onSaveTap() {
    if (this.data.submitting) return;
    const perms = this._tenantCtx && this._tenantCtx.permissions || [];
    const canCreate = hasPermission(perms, 'basic:partners:create');
    const canEdit = hasPermission(perms, 'basic:partners:edit');
    if (this._partnerId && !canEdit) {
      wx.showToast({ title: '无编辑权限', icon: 'none' });
      return;
    }
    if (!this._partnerId && !canCreate) {
      wx.showToast({ title: '无创建权限', icon: 'none' });
      return;
    }

    const category = this.getActiveCategory();
    const isNew = !this._partnerId;
    const prepared = preparePartnerForSave(
      this._workingPartner,
      this._partners,
      category,
      isNew
    );
    if (prepared.error) {
      wx.showToast({ title: prepared.error, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (this._partnerId) {
        await updatePartner(this._partnerId, prepared.payload);
      } else {
        await createPartner(prepared.payload);
      }
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.BASIC_PARTNERS,
        toastTitle: '保存成功'
      });
    } catch (err) {
      wx.showToast({ title: err && err.message || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._partnerId || this.data.submitting) return;
    wx.showModal({
      title: '删除单位',
      content: `确定删除单位「${this._workingPartner.name || ''}」？`,
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          await deletePartner(this._partnerId);
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.BASIC_PARTNERS,
            toastTitle: '已删除'
          });
        } catch (err) {
          wx.showToast({ title: err && err.message || '删除失败', icon: 'none' });
          this.setData({ submitting: false });
        }
      }
    });
  }
});