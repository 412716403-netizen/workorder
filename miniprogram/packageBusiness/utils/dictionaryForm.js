const { DICT_KIND_LABEL } = require('../config/dictionaries.js');
const { hasDuplicateName } = require('./dictionaries.js');

function prepareDictionaryForSave(form, dictionaries, editingId) {
  const name = String((form && form.name) || '').trim();
  if (!name) {
    return { error: '请填写名称' };
  }
  const kind = form && form.kind;
  if (!kind || !DICT_KIND_LABEL[kind]) {
    return { error: '请选择字典类型' };
  }
  if (hasDuplicateName(dictionaries, kind, name, editingId || '')) {
    const typeLabel = DICT_KIND_LABEL[kind] || '字典项';
    return { error: `${typeLabel}「${name}」已存在` };
  }
  const value = name;
  if (editingId) {
    return { payload: { name, value } };
  }
  return { payload: { type: kind, name, value } };
}

module.exports = {
  prepareDictionaryForSave,
};
