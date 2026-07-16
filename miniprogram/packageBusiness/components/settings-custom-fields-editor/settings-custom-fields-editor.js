const { makeCustomFieldId } = require('../../utils/settingsForm.js');

const FIELD_TYPE_LABELS = {
  text: '文本',
  date: '日期',
  select: '下拉',
  file: '上传文件/图片',
  knowledge: '资料库',
};

const DEFAULT_ALLOWED_TYPES = ['text', 'date', 'select', 'file'];

function resolveAllowedTypes(options) {
  if (options && Array.isArray(options.allowedTypes) && options.allowedTypes.length) {
    return options.allowedTypes;
  }
  const base = DEFAULT_ALLOWED_TYPES.slice();
  if (options && options.knowledgeEnabled) base.push('knowledge');
  return base;
}

function normalizeFieldType(type, allowedTypes) {
  return allowedTypes.includes(type) ? type : allowedTypes[0] || 'text';
}

function enrichFields(fields, options) {
  const allowedTypes = resolveAllowedTypes(options);
  const showRequiredCol = !!(options && options.showRequired);
  const showShowInFormCol = !!(options && options.showShowInForm);
  const typeNames = allowedTypes.map((id) => FIELD_TYPE_LABELS[id] || id);

  return (fields || []).map((field) => {
    const type = normalizeFieldType(field.type, allowedTypes);
    const typeIndex = Math.max(0, allowedTypes.indexOf(type));
    return {
      id: field.id,
      label: field.label || '',
      type,
      typeIndex,
      typeNames,
      options: field.options || [],
      required: !!field.required,
      showInForm: field.showInForm !== false,
      showRequiredCol,
      showShowInFormCol,
      showChecks: showRequiredCol || showShowInFormCol,
      isSelect: type === 'select',
      isKnowledge: type === 'knowledge',
      desktopOnly: type === 'knowledge',
    };
  });
}

Component({
  options: { addGlobalClass: true },
  properties: {
    fields: { type: Array, value: [] },
    idPrefix: { type: String, value: 'custom-' },
    showRequired: { type: Boolean, value: false },
    showShowInForm: { type: Boolean, value: false },
    knowledgeEnabled: { type: Boolean, value: false },
    allowedTypes: { type: Array, value: [] },
    addLabel: { type: String, value: '新增扩展项' },
    disabled: { type: Boolean, value: false },
  },
  data: {
    enrichedFields: [],
  },
  observers: {
    'fields, knowledgeEnabled, showRequired, showShowInForm, allowedTypes': function () {
      this.refreshFields();
    },
  },
  lifetimes: {
    attached() {
      this.refreshFields();
    },
  },
  methods: {
    getEnrichOptions() {
      const customAllowed = this.properties.allowedTypes;
      return {
        allowedTypes:
          Array.isArray(customAllowed) && customAllowed.length
            ? customAllowed
            : undefined,
        knowledgeEnabled: this.properties.knowledgeEnabled,
        showRequired: this.properties.showRequired,
        showShowInForm: this.properties.showShowInForm,
      };
    },

    refreshFields() {
      this.setData({
        enrichedFields: enrichFields(this.properties.fields, this.getEnrichOptions()),
      });
    },

    emitChange(nextFields) {
      this.triggerEvent('change', { fields: nextFields });
    },

    cloneFields() {
      return (this.properties.fields || []).map((f) =>
        Object.assign({}, f, {
          options: Array.isArray(f.options) ? f.options.slice() : undefined,
        }),
      );
    },

    onAddField() {
      if (this.properties.disabled) return;
      const next = this.cloneFields();
      next.push({
        id: makeCustomFieldId(this.properties.idPrefix),
        label: '新自定义项',
        type: 'text',
        required: false,
        showInForm: true,
        options: [],
      });
      this.emitChange(next);
    },

    onRemoveField(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      this.emitChange(this.cloneFields().filter((f) => f.id !== id));
    },

    onLabelInput(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.label = e.detail.value || '';
      this.emitChange(next);
    },

    onTypeChange(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      const idx = Number(e.detail.value) || 0;
      const allowed = resolveAllowedTypes(this.getEnrichOptions());
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.type = allowed[idx] || 'text';
      if (field.type === 'select' && !field.options) field.options = ['新选项'];
      if (field.type !== 'select') field.options = undefined;
      this.emitChange(next);
    },

    onRequiredChange(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.required = !!e.detail.value.length;
      this.emitChange(next);
    },

    onShowInFormChange(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.showInForm = !!e.detail.value.length;
      this.emitChange(next);
    },

    onOptionInput(e) {
      if (this.properties.disabled) return;
      const { id, index } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      const opts = (field.options || []).slice();
      opts[Number(index)] = e.detail.value || '';
      field.options = opts;
      this.emitChange(next);
    },

    onAddOption(e) {
      if (this.properties.disabled) return;
      const { id } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.options = [...(field.options || []), '新选项'];
      this.emitChange(next);
    },

    onRemoveOption(e) {
      if (this.properties.disabled) return;
      const { id, index } = e.currentTarget.dataset;
      const next = this.cloneFields();
      const field = next.find((f) => f.id === id);
      if (!field) return;
      field.options = (field.options || []).filter((_, i) => i !== Number(index));
      this.emitChange(next);
    },
  },
});
