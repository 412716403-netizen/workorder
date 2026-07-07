/** 系统设置各类档案名称比较键（去首尾空白、忽略大小写） */
function settingsNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function hasSettingsNameConflict(items, name, excludeId) {
  const key = settingsNameKey(name);
  if (!key) return false;
  return (items || []).some(
    (item) => item.id !== excludeId && settingsNameKey(item.name) === key,
  );
}

module.exports = {
  settingsNameKey,
  hasSettingsNameConflict,
};
