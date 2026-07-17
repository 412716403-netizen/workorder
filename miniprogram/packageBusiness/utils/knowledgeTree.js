/** 资料库树：当前层行模型 / 面包屑（纯函数） */

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sortByOrderThenTitle(a, b) {
  const ao = Number(a.sortOrder) || 0;
  const bo = Number(b.sortOrder) || 0;
  if (ao !== bo) return ao - bo;
  const an = String(a.name || a.title || '');
  const bn = String(b.name || b.title || '');
  return an.localeCompare(bn, 'zh');
}

function normalizeFolderId(folderId) {
  return folderId ? String(folderId) : null;
}

function buildFolderPath(folders, folderId) {
  const byId = {};
  (folders || []).forEach((f) => {
    if (f && f.id) byId[f.id] = f;
  });
  const path = [];
  let curId = normalizeFolderId(folderId);
  const seen = new Set();
  while (curId && byId[curId] && !seen.has(curId)) {
    seen.add(curId);
    const cur = byId[curId];
    path.unshift({ id: cur.id, name: cur.name || '未命名文件夹' });
    curId = normalizeFolderId(cur.parentId);
  }
  return path;
}

function buildCurrentLevelRows(tree, folderId) {
  const currentId = normalizeFolderId(folderId);
  const folders = ((tree && tree.folders) || [])
    .filter((f) => normalizeFolderId(f.parentId) === currentId)
    .slice()
    .sort(sortByOrderThenTitle)
    .map((f) => ({
      id: f.id,
      kind: 'folder',
      title: f.name || '未命名文件夹',
      meta: '文件夹',
      iconSrc: '/assets/icons/library.png',
    }));

  const documents = ((tree && tree.documents) || [])
    .filter((d) => normalizeFolderId(d.folderId) === currentId)
    .slice()
    .sort(sortByOrderThenTitle)
    .map((d) => ({
      id: d.id,
      kind: 'document',
      title: d.title || '未命名文档',
      meta: formatDateShort(d.updatedAt) || '文档',
      iconSrc: '/assets/icons/book-open.png',
    }));

  return folders.concat(documents);
}

function buildSearchResultRows(documents) {
  return (documents || [])
    .slice()
    .sort(sortByOrderThenTitle)
    .map((d) => ({
      id: d.id,
      kind: 'document',
      title: d.title || '未命名文档',
      meta: formatDateShort(d.updatedAt) || '文档',
      iconSrc: '/assets/icons/book-open.png',
    }));
}

module.exports = {
  formatDateShort,
  buildFolderPath,
  buildCurrentLevelRows,
  buildSearchResultRows,
};
