/** 系统设置各类档案名称比较键（去首尾空白、忽略大小写） */
export function settingsNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function hasSettingsNameConflict<T extends { id: string; name: string }>(
  items: T[],
  name: string,
  excludeId?: string,
): boolean {
  const key = settingsNameKey(name);
  if (!key) return false;
  return items.some((item) => item.id !== excludeId && settingsNameKey(item.name) === key);
}
