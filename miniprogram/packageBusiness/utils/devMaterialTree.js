/**
 * 开发物料 BOM 树（对齐 Web utils/devMaterialTree.ts）
 * 试制 BOM 顶层 + 产品档案 BOM 下级，可展开；深度上限 8，路径防环。
 */

/** 小程序无法 import TS，改此值须同步 shared/types.ts 的同名常量 */
const DEV_MATERIAL_BOM_MAX_DEPTH = 8;

function toFiniteQty(raw) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function buildProductBomChildIndex(boms) {
  const childrenByParent = new Map();
  const unitQtyByParentChild = new Map();
  const seenByParent = new Map();
  (boms || []).forEach((bom) => {
    const parentId = String((bom && bom.parentProductId) || '').trim();
    if (!parentId) return;
    let list = childrenByParent.get(parentId);
    let seen = seenByParent.get(parentId);
    let qtyMap = unitQtyByParentChild.get(parentId);
    if (!list) {
      list = [];
      seen = new Set();
      qtyMap = new Map();
      childrenByParent.set(parentId, list);
      seenByParent.set(parentId, seen);
      unitQtyByParentChild.set(parentId, qtyMap);
    }
    ((bom && bom.items) || []).forEach((item) => {
      const childId = String((item && item.productId) || '').trim();
      if (!childId || seen.has(childId)) return;
      seen.add(childId);
      list.push(childId);
      const qty = toFiniteQty(item && item.quantity);
      if (qty != null) qtyMap.set(childId, qty);
    });
  });
  return { childrenByParent, unitQtyByParentChild };
}

function collectDescendantProductIds(rootIds, childrenIndex) {
  const descendants = new Set();
  const queue = (rootIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .map((id) => ({ id, depth: 1 }));
  const enqueued = new Set(queue.map((q) => q.id));

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth >= DEV_MATERIAL_BOM_MAX_DEPTH) continue;
    (childrenIndex.get(id) || []).forEach((childId) => {
      if (enqueued.has(childId)) return;
      enqueued.add(childId);
      descendants.add(childId);
      queue.push({ id: childId, depth: depth + 1 });
    });
  }
  return descendants;
}

function normalizeIds(rootIds) {
  const ids = [];
  const seen = new Set();
  (rootIds || []).forEach((raw) => {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

/** 去掉「已经是另一个根的子孙」的根，避免同一物料既占顶层又出现在展开的子树里 */
function resolveTopLevelRootIds(rootIds, childrenIndex) {
  const unique = normalizeIds(rootIds);
  const isRoot = new Set(unique);
  const covered = new Set();
  unique.forEach((id) => {
    if (covered.has(id)) return;
    collectDescendantProductIds([id], childrenIndex).forEach((descendantId) => {
      if (descendantId !== id && isRoot.has(descendantId)) covered.add(descendantId);
    });
  });
  return unique.filter((id) => !covered.has(id));
}

function buildNode(productId, level, unitQty, childrenIndex, childUnitQty, pathVisited) {
  const children = [];
  if (level < DEV_MATERIAL_BOM_MAX_DEPTH && !pathVisited.has(productId)) {
    const nextVisited = new Set(pathVisited);
    nextVisited.add(productId);
    const qtyUnderParent = childUnitQty && childUnitQty.get(productId);
    (childrenIndex.get(productId) || []).forEach((childId) => {
      const childQty = qtyUnderParent && qtyUnderParent.get(childId);
      children.push(
        buildNode(
          childId,
          level + 1,
          childQty == null || !Number.isFinite(childQty) ? null : childQty,
          childrenIndex,
          childUnitQty,
          nextVisited,
        ),
      );
    });
  }
  return { productId, level, unitQty, children };
}

function buildDevMaterialTree(rootIds, childrenIndex, qty) {
  const roots = [];
  const seenRoot = new Set();
  const rootUnitQty = (qty && qty.rootUnitQty) || null;
  const childUnitQty = (qty && qty.childUnitQty) || null;
  (rootIds || []).forEach((raw) => {
    const productId = String(raw || '').trim();
    if (!productId || seenRoot.has(productId)) return;
    seenRoot.add(productId);
    const rootQty = rootUnitQty && rootUnitQty.get(productId);
    roots.push(
      buildNode(
        productId,
        1,
        rootQty == null || !Number.isFinite(rootQty) ? null : rootQty,
        childrenIndex,
        childUnitQty,
        new Set(),
      ),
    );
  });
  return roots;
}

/** expandedKeys 存 rowKey；返回可见扁平行 */
function flattenVisibleRows(nodes, expandedKeys, parentPath) {
  const rows = [];
  const expanded = expandedKeys instanceof Set ? expandedKeys : new Set(expandedKeys || []);
  const path = parentPath || '';
  (nodes || []).forEach((node) => {
    const rowKey = path ? `${path}/${node.productId}` : node.productId;
    const hasChildren = (node.children || []).length > 0;
    rows.push({
      productId: node.productId,
      level: node.level,
      hasChildren,
      rowKey,
      unitQty: node.unitQty,
      expanded: hasChildren && expanded.has(rowKey),
    });
    if (hasChildren && expanded.has(rowKey)) {
      rows.push(...flattenVisibleRows(node.children, expanded, rowKey));
    }
  });
  return rows;
}

function collectTreeProductIds(nodes) {
  const ids = [];
  const seen = new Set();
  const walk = (list) => {
    (list || []).forEach((n) => {
      if (!seen.has(n.productId)) {
        seen.add(n.productId);
        ids.push(n.productId);
      }
      if (n.children && n.children.length) walk(n.children);
    });
  };
  walk(nodes);
  return ids;
}

module.exports = {
  DEV_MATERIAL_BOM_MAX_DEPTH,
  buildProductBomChildIndex,
  resolveTopLevelRootIds,
  buildDevMaterialTree,
  flattenVisibleRows,
  collectTreeProductIds,
};
