const { DEV_STAGE_STATUS_LABEL, DevStageStatus } = require('./devStyleConstants.js');

const STAGE_STATUS_OPTIONS = [
  { id: DevStageStatus.PENDING, label: DEV_STAGE_STATUS_LABEL.pending },
  { id: DevStageStatus.IN_PROGRESS, label: DEV_STAGE_STATUS_LABEL.in_progress },
  { id: DevStageStatus.COMPLETED, label: DEV_STAGE_STATUS_LABEL.completed },
  { id: DevStageStatus.EXCEPTION, label: DEV_STAGE_STATUS_LABEL.exception },
];

function findTemplateByStageName(templates, stageName) {
  return (templates || []).find((t) => t.name === stageName) || null;
}

function buildStageRegisterFields(stage, templates) {
  const tpl = findTemplateByStageName(templates, stage && stage.name);
  const existingByLabel = new Map();
  ((stage && stage.fields) || []).forEach((f) => {
    existingByLabel.set(String(f.label || '').trim(), f);
  });

  if (tpl && tpl.fields && tpl.fields.length) {
    return [...tpl.fields]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((tf) => {
        const existing = existingByLabel.get(String(tf.label || '').trim());
        const type = tf.type || 'text';
        let value = existing ? existing.value || '' : '';
        if (!value && type === 'date' && tf.dateAutoFill) {
          value = new Date().toISOString();
        }
        return {
          id: (existing && existing.id) || tf.id,
          label: tf.label,
          type,
          required: !!tf.required,
          options: tf.options || [],
          dateWithTime: !!tf.dateWithTime,
          value,
          pickerIndex:
            type === 'select' && (tf.options || []).length
              ? Math.max(0, (tf.options || []).indexOf(value))
              : 0,
        };
      });
  }

  return ((stage && stage.fields) || []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type || 'text',
    required: false,
    options: [],
    dateWithTime: false,
    value: f.value || '',
    pickerIndex: 0,
  }));
}

function validateStageRegisterFields(fields) {
  for (const f of fields || []) {
    if (f.required && !String(f.value || '').trim()) {
      return `请填写「${f.label}」`;
    }
  }
  return null;
}

function buildStageUpdatePayload(status, fields, userName) {
  return {
    status,
    fields: (fields || []).map((f) => ({
      id: f.id,
      label: f.label,
      value: f.value || '',
      type: f.type || 'text',
    })),
    user: userName || undefined,
  };
}

function splitIsoToDateTime(iso) {
  if (!iso) return { datePart: '', timePart: '' };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { datePart: '', timePart: '' };
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return { datePart: `${y}-${m}-${day}`, timePart: `${hh}:${mm}` };
  } catch {
    return { datePart: '', timePart: '' };
  }
}

function joinDateTimeToIso(datePart, timePart) {
  const d = String(datePart || '').trim();
  if (!d) return '';
  const t = String(timePart || '00:00').trim() || '00:00';
  const iso = new Date(`${d}T${t}:00`);
  if (Number.isNaN(iso.getTime())) return '';
  return iso.toISOString();
}

module.exports = {
  STAGE_STATUS_OPTIONS,
  findTemplateByStageName,
  buildStageRegisterFields,
  validateStageRegisterFields,
  buildStageUpdatePayload,
  splitIsoToDateTime,
  joinDateTimeToIso,
};
