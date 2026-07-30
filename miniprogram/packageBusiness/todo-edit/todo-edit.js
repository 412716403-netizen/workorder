const { readTenantCtx } = require('../../utils/session.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');
const { splitIsoToDateTime } = require('../utils/devStageRegister.js');
const {
  TODO_NOTE_MAX_CHARS,
  createTodo,
  updateTodo,
  deleteTodo,
  listTodos,
  todoDocLabel,
  openTodosList,
} = require('../utils/todosApi.js');
const { navigateTodoHref } = require('../utils/todoNavigate.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function applyEditingToForm(editing) {
  const parts = splitIsoToDateTime(editing && editing.remindAt);
  return {
    note: (editing && editing.note) || '',
    remindEnabled: !!(editing && editing.remindEnabled),
    remindDate: parts.datePart || '',
    remindTime: parts.timePart || '',
    docLabel: todoDocLabel(editing),
  };
}

Page({
  data: {
    title: '新建待办',
    isEdit: false,
    note: '',
    remindEnabled: false,
    remindDate: '',
    remindTime: '',
    docLabel: '',
    canJumpDoc: false,
    showRelatedBtn: false,
    noteMax: TODO_NOTE_MAX_CHARS,
    submitting: false,
    deleting: false,
    togglingDone: false,
    done: false,
    pickerSheetOpen: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this._seed = null;
    this._editing = null;
    this._todoId = options.id ? decodeURIComponent(options.id) : '';

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, true),
      isEdit: !!this._todoId,
      title: this._todoId ? '待办详情' : '新建待办',
    });

    const ec = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null;
    if (ec && typeof ec.on === 'function') {
      ec.on('todoEditInit', (payload) => {
        this.applyInit(payload || {});
      });
    }

    if (this._todoId) {
      // eventChannel 可能稍后到达；若无 editing 再拉列表兜底
      setTimeout(() => {
        if (!this._editing) this.loadEditingById(this._todoId);
      }, 80);
    }

    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'todo_reminder')) {
        wx.showToast({ title: '待办提醒插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    });
  },

  applyInit(payload) {
    const editing = payload.editing || null;
    const seed = payload.seed || null;
    this._seed = seed;
    if (editing && editing.id) {
      this._editing = editing;
      this._todoId = editing.id;
      this._href = editing.href || '';
      const form = applyEditingToForm(editing);
      this.setData({
        isEdit: true,
        title: '待办详情',
        note: form.note,
        remindEnabled: form.remindEnabled,
        remindDate: form.remindDate,
        remindTime: form.remindTime,
        docLabel: form.docLabel,
        canJumpDoc: !!(editing.href && form.docLabel),
        showRelatedBtn: !!form.docLabel,
        done: editing.status === 'done',
      });
      return;
    }
    if (seed) {
      this._href = seed.href || '';
      const label = todoDocLabel(seed);
      this.setData({
        docLabel: label,
        canJumpDoc: !!(seed.href && label),
        showRelatedBtn: !!label,
      });
    }
  },

  async loadEditingById(id) {
    try {
      const items = await listTodos({});
      const found = (items || []).find((t) => t.id === id);
      if (!found) {
        wx.showToast({ title: '待办不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.applyInit({ editing: found });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onRelatedTodosTap() {
    const q = String(this.data.docLabel || '').trim();
    if (!q) return;
    openTodosList({ searchKeyword: q, hideCreate: true });
  },

  onDocTap() {
    if (!this.data.canJumpDoc || !this._href) return;
    navigateTodoHref(this._href);
  },

  onDeleteTap() {
    if (!this.data.isEdit || !this._todoId || this.data.deleting || this.data.submitting || this.data.togglingDone) return;
    wx.showModal({
      title: '删除待办',
      content: '确定删除这条待办吗？',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        deleteTodo(this._todoId)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
            this.setData({ deleting: false });
          });
      },
    });
  },

  onToggleDone() {
    if (
      !this.data.isEdit ||
      !this._todoId ||
      this.data.togglingDone ||
      this.data.submitting ||
      this.data.deleting
    ) {
      return;
    }
    const nextDone = !this.data.done;
    this.setData({ togglingDone: true });
    updateTodo(this._todoId, { status: nextDone ? 'done' : 'open' })
      .then(() => {
        if (this._editing) this._editing.status = nextDone ? 'done' : 'open';
        this.setData({ done: nextDone, togglingDone: false });
        wx.showToast({
          title: nextDone ? '已完成' : '已还原为未完成',
          icon: 'success',
        });
        if (nextDone) {
          setTimeout(() => wx.navigateBack(), 400);
        }
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
        this.setData({ togglingDone: false });
      });
  },

  onNoteInput(e) {
    const note = String((e.detail && e.detail.value) || '');
    this.setData({ note });
  },

  onRemindToggle() {
    const remindEnabled = !this.data.remindEnabled;
    this.setData({ remindEnabled });
  },

  onRemindDateTimeChange(e) {
    const detail = (e && e.detail) || {};
    this.setData({
      remindDate: detail.date || '',
      remindTime: detail.time || '',
    });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  async onSubmit() {
    if (this.data.submitting || this.data.togglingDone) return;
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }

    const trimmed = String(this.data.note || '').trim();
    if (!trimmed) {
      wx.showToast({ title: '请填写待办内容', icon: 'none' });
      return;
    }
    if (trimmed.length > TODO_NOTE_MAX_CHARS) {
      wx.showToast({ title: `内容最多 ${TODO_NOTE_MAX_CHARS} 字`, icon: 'none' });
      return;
    }
    if (this.data.remindEnabled && !this.data.remindDate) {
      wx.showToast({ title: '开启提醒后请选择提醒时间', icon: 'none' });
      return;
    }

    const remindAtIso =
      this.data.remindEnabled && this.data.remindDate
        ? entryDateAndTimeToIso(this.data.remindDate, this.data.remindTime || '00:00')
        : null;

    this.setData({ submitting: true });
    try {
      if (this.data.isEdit && this._todoId) {
        await updateTodo(this._todoId, {
          note: trimmed,
          remindEnabled: !!this.data.remindEnabled,
          remindAt: remindAtIso,
        });
        wx.showToast({ title: '待办已更新', icon: 'success' });
      } else {
        const seed = this._seed || {};
        await createTodo({
          sourceType: seed.sourceType || 'standalone',
          sourceId: seed.sourceId != null ? seed.sourceId : null,
          sourceDocNo: seed.sourceDocNo != null ? seed.sourceDocNo : null,
          sourceTitle: seed.sourceTitle != null ? seed.sourceTitle : null,
          href: seed.href != null ? seed.href : null,
          note: trimmed,
          remindEnabled: !!this.data.remindEnabled,
          remindAt: remindAtIso,
        });
        wx.showToast({ title: '已加入待办', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 400);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
