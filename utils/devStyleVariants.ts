import type { DevSampleDto, DevStyleVariantDto, DictionaryItem } from '../types';

/** 按色码矩阵生成/保留款式变体（与产品档案逻辑一致） */
export function buildDevStyleVariants(
  colorIds: string[],
  sizeIds: string[],
  existingVariants: DevStyleVariantDto[],
  dictionaries: { colors: DictionaryItem[]; sizes: DictionaryItem[] },
): DevStyleVariantDto[] {
  if (colorIds.length === 0 && sizeIds.length === 0) return [];
  const colors = colorIds.length > 0 ? colorIds : ['none'];
  const sizes = sizeIds.length > 0 ? sizeIds : ['none'];
  const next: DevStyleVariantDto[] = [];
  for (const cId of colors) {
    for (const sId of sizes) {
      const existing = existingVariants.find((v) => v.colorId === cId && v.sizeId === sId);
      if (existing) {
        next.push(existing);
      } else {
        const colorName = dictionaries.colors.find((c) => c.id === cId)?.name ?? '';
        const sizeName = dictionaries.sizes.find((s) => s.id === sId)?.name ?? '';
        next.push({
          id: `dvar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          colorId: cId,
          sizeId: sId,
          skuSuffix: `${colorName}${colorName && sizeName ? '-' : ''}${sizeName}`,
          nodeBoms: {},
        });
      }
    }
  }
  return next;
}

/** 从开发节点模板库生成默认流程节点名（按 order 排序） */
export function defaultStageNamesFromTemplates(
  templates: Array<{ name: string; order: number }>,
): string[] {
  return [...templates]
    .sort((a, b) => a.order - b.order)
    .map((t) => t.name.trim())
    .filter(Boolean);
}

/** 样品轮次内开发节点名称（按 order 排序） */
export function stageNamesFromDevSample(sample: DevSampleDto): string[] {
  return [...sample.stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => s.name.trim())
    .filter(Boolean);
}

/** 新增样品时默认沿用头样（首个轮次）的节点流程 */
export function stageNamesFromFirstDevSample(samples: DevSampleDto[]): string[] {
  const first = samples[0];
  if (!first?.stages.length) return [];
  return stageNamesFromDevSample(first);
}
