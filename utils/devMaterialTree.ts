import { DEV_MATERIAL_BOM_MAX_DEPTH } from '../shared/types';
import type { BOM } from '../types';

export interface DevMaterialTreeNode {
  productId: string;
  /** 深度：顶层为 1 */
  level: number;
  /**
   * 相对父件（或试制 BOM）的单个用量；未知时为 null。
   * 顶层取试制 BOM 用量，下级取产品档案 BOM 用量。
   */
  unitQty: number | null;
  children: DevMaterialTreeNode[];
}

export interface DevMaterialFlatRow {
  productId: string;
  level: number;
  hasChildren: boolean;
  /** 祖先路径拼接，同一物料在不同父下互不干扰 */
  rowKey: string;
  /** 相对父件（或试制 BOM）的单个用量；未知时为 null */
  unitQty: number | null;
}

export interface ProductBomChildIndex {
  childrenByParent: Map<string, string[]>;
  /** parentId → childId → 单个用量（同 parent 下去重时保留首次出现的用量） */
  unitQtyByParentChild: Map<string, Map<string, number>>;
}

export interface DevMaterialTreeQtyOptions {
  /** 试制 BOM 顶层物料 productId → 单个用量 */
  rootUnitQty?: ReadonlyMap<string, number>;
  /** 产品档案 BOM：parent → child → 单个用量 */
  childUnitQty?: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

function toFiniteQty(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * 试制 BOM 顶层物料的单个用量（跨变体/工序按 productId 去重，保留首次用量）。
 */
export function buildDevBomUnitQtyMap(
  boms: Array<{ items?: Array<{ productId?: string | null; quantity?: number | null }> } | null | undefined> | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const bom of boms ?? []) {
    for (const item of bom?.items ?? []) {
      const productId = String(item.productId ?? '').trim();
      if (!productId || map.has(productId)) continue;
      const qty = toFiniteQty(item.quantity);
      if (qty == null) continue;
      map.set(productId, qty);
    }
  }
  return map;
}

/** 按 parentProductId 聚合子件与用量，跨变体/工序去重保序 */
export function buildProductBomChildIndex(
  boms: Array<Pick<BOM, 'parentProductId' | 'items'>>,
): ProductBomChildIndex {
  const childrenByParent = new Map<string, string[]>();
  const unitQtyByParentChild = new Map<string, Map<string, number>>();
  const seenByParent = new Map<string, Set<string>>();
  for (const bom of boms) {
    const parentId = String(bom.parentProductId ?? '').trim();
    if (!parentId) continue;
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
    for (const item of bom.items ?? []) {
      const childId = String(item.productId ?? '').trim();
      if (!childId || seen!.has(childId)) continue;
      seen!.add(childId);
      list.push(childId);
      const qty = toFiniteQty(item.quantity);
      if (qty != null) qtyMap!.set(childId, qty);
    }
  }
  return { childrenByParent, unitQtyByParentChild };
}

/** 按 parentProductId 聚合子件 productId，跨变体/工序去重保序 */
export function buildProductChildrenIndex(
  boms: Array<Pick<BOM, 'parentProductId' | 'items'>>,
): Map<string, string[]> {
  return buildProductBomChildIndex(boms).childrenByParent;
}

function buildNode(
  productId: string,
  level: number,
  unitQty: number | null,
  childrenIndex: Map<string, string[]>,
  childUnitQty: ReadonlyMap<string, ReadonlyMap<string, number>> | undefined,
  pathVisited: Set<string>,
): DevMaterialTreeNode {
  const children: DevMaterialTreeNode[] = [];
  if (level < DEV_MATERIAL_BOM_MAX_DEPTH && !pathVisited.has(productId)) {
    const nextVisited = new Set(pathVisited);
    nextVisited.add(productId);
    const qtyUnderParent = childUnitQty?.get(productId);
    for (const childId of childrenIndex.get(productId) ?? []) {
      const childQty = qtyUnderParent?.get(childId);
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
    }
  }
  return { productId, level, unitQty, children };
}

/** 以试制 BOM 顶层 id 为根，按产品档案 BOM 递归建树（路径防环 + 深度上限） */
export function buildDevMaterialTree(
  rootIds: string[],
  childrenIndex: Map<string, string[]>,
  qty?: DevMaterialTreeQtyOptions,
): DevMaterialTreeNode[] {
  const roots: DevMaterialTreeNode[] = [];
  const seenRoot = new Set<string>();
  for (const raw of rootIds) {
    const productId = String(raw ?? '').trim();
    if (!productId || seenRoot.has(productId)) continue;
    seenRoot.add(productId);
    const rootQty = qty?.rootUnitQty?.get(productId);
    roots.push(
      buildNode(
        productId,
        1,
        rootQty == null || !Number.isFinite(rootQty) ? null : rootQty,
        childrenIndex,
        qty?.childUnitQty,
        new Set(),
      ),
    );
  }
  return roots;
}

/** 按展开集合扁平化可见行；expandedIds 存 rowKey */
export function flattenVisibleRows(
  nodes: DevMaterialTreeNode[],
  expandedIds: ReadonlySet<string>,
  parentPath = '',
): DevMaterialFlatRow[] {
  const rows: DevMaterialFlatRow[] = [];
  for (const node of nodes) {
    const rowKey = parentPath ? `${parentPath}/${node.productId}` : node.productId;
    const hasChildren = node.children.length > 0;
    rows.push({
      productId: node.productId,
      level: node.level,
      hasChildren,
      rowKey,
      unitQty: node.unitQty,
    });
    if (hasChildren && expandedIds.has(rowKey)) {
      rows.push(...flattenVisibleRows(node.children, expandedIds, rowKey));
    }
  }
  return rows;
}

/** 树内全部 productId（去重） */
export function collectTreeProductIds(nodes: DevMaterialTreeNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (list: DevMaterialTreeNode[]) => {
    for (const n of list) {
      if (!seen.has(n.productId)) {
        seen.add(n.productId);
        ids.push(n.productId);
      }
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

function normalizeIds(rootIds: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of rootIds) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 去掉「已经是另一个根的子孙」的根，避免同一物料既占顶层又出现在展开的子树里。
 * 互为子孙（环）时按传入顺序保留先出现的那个，保证结果稳定。
 */
export function resolveTopLevelRootIds(
  rootIds: string[],
  childrenIndex: Map<string, string[]>,
): string[] {
  const unique = normalizeIds(rootIds);
  const isRoot = new Set(unique);
  const covered = new Set<string>();
  for (const id of unique) {
    if (covered.has(id)) continue;
    for (const descendantId of collectDescendantProductIds([id], childrenIndex)) {
      if (descendantId !== id && isRoot.has(descendantId)) covered.add(descendantId);
    }
  }
  return unique.filter((id) => !covered.has(id));
}

/**
 * productId → 覆盖它的根 id 集合（含根自身）。
 * 用于「某根的子树里是否有流水」与「summary 行是否游离于所有根之外」的判定，
 * 避免对每个根重复遍历子树。
 */
export function buildRootCoverageIndex(
  rootIds: string[],
  childrenIndex: Map<string, string[]>,
): Map<string, Set<string>> {
  const coverage = new Map<string, Set<string>>();
  const mark = (productId: string, rootId: string) => {
    let roots = coverage.get(productId);
    if (!roots) {
      roots = new Set();
      coverage.set(productId, roots);
    }
    roots.add(rootId);
  };
  for (const rootId of normalizeIds(rootIds)) {
    mark(rootId, rootId);
    for (const descendantId of collectDescendantProductIds([rootId], childrenIndex)) {
      mark(descendantId, rootId);
    }
  }
  return coverage;
}

/** 收集以 roots 为起点的全部子孙 productId（不含 roots 自身） */
export function collectDescendantProductIds(
  rootIds: string[],
  childrenIndex: Map<string, string[]>,
): Set<string> {
  const descendants = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = rootIds
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
    .map((id) => ({ id, depth: 1 }));
  const enqueued = new Set(queue.map((q) => q.id));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= DEV_MATERIAL_BOM_MAX_DEPTH) continue;
    for (const childId of childrenIndex.get(id) ?? []) {
      if (enqueued.has(childId)) continue;
      enqueued.add(childId);
      descendants.add(childId);
      queue.push({ id: childId, depth: depth + 1 });
    }
  }
  return descendants;
}
