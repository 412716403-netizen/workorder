import type { PrintListRow } from '../types';

/** 计划单颜色物料矩阵：动态列表行内嵌 JSON 键 */
export const COLOR_MATERIAL_MATRIX_JSON_KEY = 'colorMaterialMatrixJson' as const;

export type ColorMaterialMatrixMaterialCell = {
  name: string;
  ratio: string;
  /** 产品分类「表单中显示」的自定义项摘要（与用料清单物料名称下标签一致），如「纱支: 48Nm · 成分: 羊毛」 */
  productFormSummary?: string;
};

export type ColorMaterialMatrixColorRow = {
  colorName: string;
  materials: ColorMaterialMatrixMaterialCell[];
};

export type ColorMaterialMatrixNodeBlock = {
  nodeName: string;
  colorRows: ColorMaterialMatrixColorRow[];
};

export type ColorMaterialMatrixPayload = {
  nodeBlocks: ColorMaterialMatrixNodeBlock[];
};

export function serializeColorMaterialMatrixPayload(p: ColorMaterialMatrixPayload): string {
  return JSON.stringify(p);
}

export function parseColorMaterialMatrixFromRow(row: PrintListRow): ColorMaterialMatrixPayload | null {
  const raw = row[COLOR_MATERIAL_MATRIX_JSON_KEY];
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const nodeBlocks = (o as { nodeBlocks?: unknown }).nodeBlocks;
    if (!Array.isArray(nodeBlocks)) return null;
    const blocks: ColorMaterialMatrixNodeBlock[] = [];
    for (const blk of nodeBlocks) {
      if (!blk || typeof blk !== 'object') continue;
      const bn = blk as { nodeName?: unknown; colorRows?: unknown };
      const nodeName = bn.nodeName == null ? '' : String(bn.nodeName);
      const colorRowsRaw = bn.colorRows;
      const colorRows: ColorMaterialMatrixColorRow[] = [];
      if (Array.isArray(colorRowsRaw)) {
        for (const cr of colorRowsRaw) {
          if (!cr || typeof cr !== 'object') {
            colorRows.push({ colorName: '', materials: [] });
            continue;
          }
          const c = cr as { colorName?: unknown; materials?: unknown };
          const colorName = c.colorName == null ? '' : String(c.colorName);
          const materials: ColorMaterialMatrixMaterialCell[] = [];
          if (Array.isArray(c.materials)) {
            for (const m of c.materials) {
              if (!m || typeof m !== 'object') {
                materials.push({ name: '', ratio: '' });
                continue;
              }
              const mm = m as { name?: unknown; ratio?: unknown };
              const mmx = mm as { productFormSummary?: unknown };
              materials.push({
                name: mm.name == null ? '' : String(mm.name),
                ratio:
                  mm.ratio == null
                    ? ''
                    : typeof mm.ratio === 'number'
                      ? String(mm.ratio)
                      : String(mm.ratio),
                ...(mmx.productFormSummary != null && String(mmx.productFormSummary).trim() !== ''
                  ? { productFormSummary: String(mmx.productFormSummary) }
                  : {}),
              });
            }
          }
          colorRows.push({ colorName, materials });
        }
      }
      blocks.push({ nodeName, colorRows });
    }
    return { nodeBlocks: blocks };
  } catch {
    return null;
  }
}
