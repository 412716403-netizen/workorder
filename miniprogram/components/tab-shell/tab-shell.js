const { readTabShellInsets } = require('../../utils/tabShell.js');

Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
  },
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    customHeader: { type: Boolean, value: false },
  },
  data: {
    headerPaddingTop: 48,
    headerPaddingRight: 28,
  },
  lifetimes: {
    attached() {
      this.setData(readTabShellInsets());
    },
  },
});
