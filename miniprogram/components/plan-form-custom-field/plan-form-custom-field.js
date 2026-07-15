Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    fields: { type: Array, value: [] },
    values: { type: Object, value: {} },
  },
  data: {
    enrichedFields: [],
  },
  observers: {
    'fields, values': function () {
      this.refreshEnrichedFields();
    },
  },
  lifetimes: {
    attached() {
      this.refreshEnrichedFields();
    },
  },
  methods: {
    refreshEnrichedFields() {
      const values = this.properties.values || {};
      const enrichedFields = (this.properties.fields || []).map((f) => {
        const options = f.options || [];
        const current = values[f.id];
        let pickerIndex = 0;
        if (current) {
          const idx = options.indexOf(current);
          if (idx >= 0) pickerIndex = idx;
        }
        return {
          id: f.id,
          label: f.label,
          type: f.type,
          options,
          pickerMode: f.pickerMode,
          isText: f.isText,
          isSelect: f.isSelect,
          isDate: f.isDate,
          pickerIndex,
        };
      });
      this.setData({ enrichedFields });
    },

    emitChange(id, value) {
      const next = Object.assign({}, this.properties.values || {});
      next[id] = value;
      this.triggerEvent('change', { customData: next });
    },

    onTextInput(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.emitChange(id, e.detail.value || '');
    },

    onSelectChange(e) {
      const { id, options } = e.currentTarget.dataset;
      if (!id) return;
      const idx = Number(e.detail.value) || 0;
      const list = options || [];
      const value = list[idx] || '';
      this.emitChange(id, value);
    },

    onDateChange(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) return;
      this.emitChange(id, e.detail.value || '');
    },
  },
});
