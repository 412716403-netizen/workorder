const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  LIST_PICKER_HEIGHT_RATIO,
} = require('../../../utils/bottomSheetAnim.js');

/** 收支账户统一蓝色简笔图标 */
const ACCOUNT_ICON = '/assets/icons/wallet.png';

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '收支账户' },
    /** [{ id, name, balanceText?, balanceNegative? }] */
    accounts: { type: Array, value: [] },
    /**
     * 当前选中值：
     * - valueMode=name：账户名（收/付款 paymentAccount）
     * - valueMode=id：账户 id（转账 from/toAccountId）
     */
    value: { type: String, value: '' },
    valueMode: { type: String, value: 'name' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
    last: { type: Boolean, value: false },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    displayName: '',
    selectedId: '',
    showSelectedMark: false,
    iconSrc: ACCOUNT_ICON,
  },
  observers: {
    'accounts, value, valueMode': function (accounts, value, valueMode) {
      const list = accounts || [];
      const raw = (value || '').trim();
      const byId = valueMode === 'id';
      const hit = list.find((a) => a && (byId ? a.id === raw : a.name === raw));
      this.setData({
        displayName: (hit && hit.name) || (byId ? '' : raw),
        selectedId: (hit && hit.id) || '',
        showSelectedMark: list.length > 1,
      });
    },
  },
  lifetimes: {
    detached() {
      clearBottomSheetTimers(this);
    },
  },
  methods: {
    noop() {},

    onOpen() {
      if (this.data.disabled) return;
      this.triggerEvent('sheetopen');
      openBottomSheet(this, null, { heightRatio: LIST_PICKER_HEIGHT_RATIO });
    },

    onClose() {
      this.triggerEvent('sheetclose');
      closeBottomSheet(this);
    },

    onSelect(e) {
      const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
      if (!id) return;
      const hit = (this.properties.accounts || []).find((a) => a && a.id === id);
      if (!hit) return;
      const byId = this.properties.valueMode === 'id';
      this.triggerEvent('change', {
        id: hit.id,
        name: hit.name || '',
        value: byId ? hit.id : hit.name || '',
      });
      this.triggerEvent('sheetclose');
      closeBottomSheet(this);
    },
  },
});
