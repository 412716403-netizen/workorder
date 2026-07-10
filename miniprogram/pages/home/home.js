const { request } = require('../../utils/request.js');
const { readTenantCtx, readCurrentUserId, readCurrentUser } = require('../../utils/session.js');
const { syncTenantCtx } = require('../../utils/tenantCtxSync.js');
const { readTabShellInsets } = require('../../utils/tabShell.js');
const { navigateMenuPath } = require('../../utils/navigateMenuPath.js');

function buildUserProfile(ctx) {
  const user = readCurrentUser();
  const displayName = (user && (user.displayName || user.username)) || '用户';
  return {
    displayName,
    avatarText: displayName.slice(0, 1),
    tenantName: ctx.tenantName || '',
  };
}

function loadHomeDeps() {
  const period = require('../../utils/workbenchPeriodFilter.js');
  const shortcuts = require('../../utils/workbenchShortcuts.js');
  const workbench = require('../../utils/workbenchHome.js');
  const notifications = require('../../utils/notificationRead.js');
  const collab = require('../../utils/collaborationPending.js');
  const badge = require('../../utils/messagesTabBadge.js');
  return {
    PERIOD_TABS: period.PERIOD_TABS,
    buildPeriodFilter: period.buildPeriodFilter,
    createDefaultPeriodState: period.createDefaultPeriodState,
    derivePeriodState: period.derivePeriodState,
    buildHomeShortcuts: shortcuts.buildHomeShortcuts,
    buildWorkbenchPageTabs: workbench.buildWorkbenchPageTabs,
    resolveActiveWorkbenchPageId: workbench.resolveActiveWorkbenchPageId,
    loadPageStatCards: workbench.loadPageStatCards,
    loadHomeStatCards: workbench.loadHomeStatCards,
    countUnread: notifications.countUnread,
    buildCollabPendingSections: collab.buildCollabPendingSections,
    updateMessagesTabBadge: badge.updateMessagesTabBadge,
  };
}

const defaultPeriod = (() => {
  try {
    return require('../../utils/workbenchPeriodFilter.js').createDefaultPeriodState();
  } catch (err) {
    return {
      periodTab: 'today',
      customStart: '',
      customEnd: '',
      periodLabel: '今日',
      customRangeInvalid: false,
      queryEnabled: true,
    };
  }
})();

Page({
  data: {
    headerPaddingTop: 48,
    headerPaddingRight: 28,
    loading: true,
    bootError: '',
    displayName: '用户',
    avatarText: '用',
    tenantName: '',
    shortcuts: [],
    shortcutsLoading: true,
    statCards: [],
    loadError: false,
    periodTabs: [],
    periodTab: defaultPeriod.periodTab,
    customStart: defaultPeriod.customStart,
    customEnd: defaultPeriod.customEnd,
    periodLabel: defaultPeriod.periodLabel,
    customRangeInvalid: defaultPeriod.customRangeInvalid,
    queryEnabled: defaultPeriod.queryEnabled,
    statsLoading: false,
    workbenchPages: [],
    activePageId: '',
    dashboardTitle: '数据看板',
    showWorkbenchTabs: false,
    activePageIsHome: true,
    emptyStatsText: '暂无统计组件，请在电脑端工作台首页添加',
  },

  _workbenchEffective: null,
  _activePageId: '',
  _deps: null,

  onLoad() {
    try {
      const deps = loadHomeDeps();
      this._deps = deps;
      this.setData(Object.assign({ bootError: '' }, readTabShellInsets(), {
        periodTabs: deps.PERIOD_TABS,
      }));
    } catch (err) {
      this.setData(Object.assign({}, readTabShellInsets(), {
        bootError: (err && err.message) || '首页模块加载失败',
        loading: false,
        shortcutsLoading: false,
      }));
    }
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
    if (this.data.bootError) return;

    if (!this._deps) {
      try {
        this._deps = loadHomeDeps();
        this.setData({ periodTabs: this._deps.PERIOD_TABS, bootError: '' });
      } catch (err) {
        this.setData({
          bootError: (err && err.message) || '首页模块加载失败',
          loading: false,
          shortcutsLoading: false,
        });
        return;
      }
    }

    this.setData(buildUserProfile(ctx));
    this.refreshUserProfile();
    syncTenantCtx().then((freshCtx) => {
      const activeCtx = freshCtx || ctx;
      const { canShowHomeTab, resolveDefaultTabPath, syncCurrentCustomTabBar } = require('../../utils/tabAccess.js');
      syncCurrentCustomTabBar(activeCtx);
      if (!canShowHomeTab(activeCtx)) {
        wx.switchTab({ url: resolveDefaultTabPath(activeCtx) });
        return;
      }
      this.setData(buildUserProfile(activeCtx));
      this.loadHome(activeCtx);
    });
  },

  onPullDownRefresh() {
    const ctx = readTenantCtx();
    if (ctx && ctx.tenantId && this._deps && !this.data.bootError) {
      syncTenantCtx().then((freshCtx) => {
        const activeCtx = freshCtx || ctx;
        const { canShowHomeTab, resolveDefaultTabPath, syncCurrentCustomTabBar } = require('../../utils/tabAccess.js');
        syncCurrentCustomTabBar(activeCtx);
        if (!canShowHomeTab(activeCtx)) {
          wx.switchTab({ url: resolveDefaultTabPath(activeCtx) });
          return null;
        }
        this.setData(buildUserProfile(activeCtx));
        this.refreshUserProfile();
        return this.loadHome(activeCtx);
      }).then(
        () => wx.stopPullDownRefresh(),
        () => wx.stopPullDownRefresh(),
      );
    } else {
      wx.stopPullDownRefresh();
    }
  },

  refreshUserProfile() {
    request({ path: '/auth/me', method: 'GET' })
      .then((user) => {
        if (!user) return;
        wx.setStorageSync('currentUser', JSON.stringify(user));
        const ctx = readTenantCtx();
        if (ctx) {
          this.setData(buildUserProfile(ctx));
        }
      })
      .catch(() => {
        /* keep cached profile */
      });
  },

  getPeriodFilter() {
    const { periodTab, customStart, customEnd } = this.data;
    return this._deps.buildPeriodFilter(periodTab, customStart, customEnd);
  },

  buildDashboardViewState(workbenchEffective, preferredPageId) {
    const deps = this._deps;
    const workbenchPages = deps.buildWorkbenchPageTabs(workbenchEffective);
    const activePageId = deps.resolveActiveWorkbenchPageId(workbenchEffective, preferredPageId);
    const activePage = workbenchPages.find((page) => page.id === activePageId) || workbenchPages[0];
    const activePageIsHome = !!(activePage && activePage.isHome);
    return {
      workbenchPages,
      activePageId,
      showWorkbenchTabs: workbenchPages.length > 1,
      dashboardTitle: (activePage && activePage.title) || '数据看板',
      activePageIsHome,
      emptyStatsText: activePageIsHome
        ? '暂无统计组件，请在电脑端工作台首页添加'
        : '该页面暂无统计组件，请在电脑端工作台编辑',
    };
  },

  loadStatCards(showCardLoading) {
    if (!this.data.queryEnabled || !this._deps) return Promise.resolve();

    const filter = this.getPeriodFilter();
    const pageId = this.data.activePageId || this._activePageId;
    if (showCardLoading && this.data.statCards.length) {
      const loadingCards = this.data.statCards.map((c) => {
        const next = {};
        Object.keys(c).forEach((key) => {
          next[key] = c[key];
        });
        next.loading = true;
        return next;
      });
      this.setData({ statCards: loadingCards, statsLoading: true });
    } else if (showCardLoading) {
      this.setData({ statsLoading: true });
    }

    return this._deps.loadPageStatCards(request, this._workbenchEffective, pageId, filter)
      .then((statCards) => {
        this.setData({
          statCards,
          statsLoading: false,
          loadError: false,
        });
      })
      .catch(() => {
        this.setData({
          statCards: [],
          statsLoading: false,
          loadError: true,
        });
      });
  },

  loadHome(ctx) {
    if (!this._deps) return Promise.resolve();

    const { hasWorkbenchNavAccess } = require('../../utils/permissions.js');

    this.setData({ loading: true, loadError: false, shortcutsLoading: true });

    const deps = this._deps;

    return Promise.all([
      hasWorkbenchNavAccess(ctx.permissions, ctx.tenantRole)
        ? request({ path: '/dashboard/workbench', method: 'GET' }).catch(() => null)
        : Promise.resolve(null),
      request({ path: '/dashboard/shortcuts', method: 'GET' }).catch(() => null),
      request({ path: '/dashboard/feature-plugins', method: 'GET' }).catch(() => ({})),
    ])
      .then((results) => {
        const workbench = results[0];
        const shortcutsResp = results[1];
        const featurePlugins = results[2];
        this._workbenchEffective = (workbench && workbench.effective) || null;
        const dashboardView = this.buildDashboardViewState(
          this._workbenchEffective,
          this._activePageId,
        );
        this._activePageId = dashboardView.activePageId;

        const shortcuts = deps.buildHomeShortcuts(
          shortcutsResp && shortcutsResp.selected,
          ctx.permissions || [],
          featurePlugins,
          ctx.tenantRole || '',
        );

        if (this.data.queryEnabled) {
          const filter = this.getPeriodFilter();
          return deps
            .loadPageStatCards(
              request,
              this._workbenchEffective,
              dashboardView.activePageId,
              filter,
            )
            .then((statCards) => {
              this.setData(Object.assign({}, dashboardView, {
                loading: false,
                shortcuts,
                shortcutsLoading: false,
                statCards,
                loadError: false,
                statsLoading: false,
              }));
            });
        }

        this.setData(Object.assign({}, dashboardView, {
          loading: false,
          shortcuts,
          shortcutsLoading: false,
          statCards: [],
          statsLoading: false,
        }));
        return null;
      })
      .then(() => this.refreshMessagesBadge(ctx))
      .catch(() => {
        this.setData({
          loading: false,
          shortcuts: [],
          shortcutsLoading: false,
          statCards: [],
          loadError: true,
          statsLoading: false,
        });
      });
  },

  onPeriodTabTap(e) {
    if (!this._deps) return;
    const periodTab = e.currentTarget.dataset.key;
    if (!periodTab || periodTab === this.data.periodTab) return;

    const next = this._deps.derivePeriodState(periodTab, this.data.customStart, this.data.customEnd);
    this.setData(next, () => {
      if (next.queryEnabled) {
        this.loadStatCards(true);
      }
    });
  },

  onCustomStartChange(e) {
    if (!this._deps) return;
    const customStart = e.detail.value;
    const next = this._deps.derivePeriodState(this.data.periodTab, customStart, this.data.customEnd);
    this.setData(next, () => {
      if (next.queryEnabled && !next.customRangeInvalid) {
        this.loadStatCards(true);
      }
    });
  },

  onCustomEndChange(e) {
    if (!this._deps) return;
    const customEnd = e.detail.value;
    const next = this._deps.derivePeriodState(this.data.periodTab, this.data.customStart, customEnd);
    this.setData(next, () => {
      if (next.queryEnabled && !next.customRangeInvalid) {
        this.loadStatCards(true);
      }
    });
  },

  switchWorkbenchPage(pageId) {
    if (!pageId || pageId === this.data.activePageId) return;

    const dashboardView = this.buildDashboardViewState(this._workbenchEffective, pageId);
    this._activePageId = dashboardView.activePageId;
    this.setData(Object.assign({}, dashboardView, { statCards: [], loadError: false }), () => {
      if (this.data.queryEnabled) {
        this.loadStatCards(true);
      }
    });
  },

  onWorkbenchPageSwitchTap() {
    const pages = this.data.workbenchPages;
    if (!pages || pages.length <= 1) return;

    wx.showActionSheet({
      itemList: pages.map((page) => page.title),
      success: (res) => {
        const page = pages[res.tapIndex];
        if (page) this.switchWorkbenchPage(page.id);
      },
    });
  },

  onShortcutTap(e) {
    const { path } = e.currentTarget.dataset;
    navigateMenuPath(path);
  },

  refreshMessagesBadge(ctx) {
    if (!this._deps) return Promise.resolve();

    const deps = this._deps;
    return Promise.all([
      request({ path: '/dashboard/notifications?limit=50', method: 'GET' }).catch(() => []),
      request({ path: '/collaboration/subcontract-transfers?all=true', method: 'GET' }).catch(
        () => [],
      ),
    ])
      .then((results) => {
        const notifications = results[0];
        const transfers = results[1];
        const notifList = Array.isArray(notifications) ? notifications : [];
        const unreadNotifCount = deps.countUnread(ctx.tenantId, readCurrentUserId(), notifList);
        const collabTotal = deps.buildCollabPendingSections(
          Array.isArray(transfers) ? transfers : [],
        ).totalCount;
        deps.updateMessagesTabBadge(unreadNotifCount + collabTotal);
      })
      .catch(() => {
        /* ignore */
      });
  },
});
