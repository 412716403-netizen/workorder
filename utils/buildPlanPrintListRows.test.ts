import { describe, expect, it } from 'vitest';
import type { AppDictionaries, BOM, GlobalNodeTemplate, PlanOrder, Product } from '../types';
import {
  buildPlanPrintListRows,
  buildColorMaterialMatrixPayloadForPlan,
} from './buildPlanPrintListRows';
import { COLOR_MATERIAL_MATRIX_JSON_KEY, parseColorMaterialMatrixFromRow } from './colorMaterialMatrixPrint';

const dictionaries: AppDictionaries = {
  colors: [
    { id: 'c-black', name: '黑', value: '黑' },
    { id: 'c-white', name: '白', value: '白' },
  ],
  sizes: [{ id: 's-m', name: 'M', value: 'M' }],
  units: [],
};

describe('buildPlanPrintListRows', () => {
  it('omit colorMaterialMatrixJson when opts 未传入（兼容旧调用）', () => {
    const product: Product = {
      id: 'prod1',
      sku: 'SKU1',
      name: '毛衣',
      colorIds: ['c-black', 'c-white'],
      sizeIds: ['s-m'],
      variants: [
        { id: 'v-black-m', colorId: 'c-black', sizeId: 's-m', skuSuffix: '' },
        { id: 'v-white-m', colorId: 'c-white', sizeId: 's-m', skuSuffix: '' },
      ],
      milestoneNodeIds: ['node-knit'],
      categoryCustomData: {},
    };
    const plan: PlanOrder = {
      id: 'p1',
      planNumber: 'PL-1',
      productId: 'prod1',
      items: [
        { variantId: 'v-black-m', quantity: 10 },
        { variantId: 'v-white-m', quantity: 20 },
      ],
      startDate: '2026-01-01',
      status: 'PLANNING',
      customer: '',
      priority: 'Medium',
    };
    const rows = buildPlanPrintListRows(plan, product, dictionaries);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0][COLOR_MATERIAL_MATRIX_JSON_KEY]).toBeUndefined();
  });

  it('写入 colorMaterialMatrixJson：节点顺序与颜色顺序、物料名', () => {
    const matBlack: Product = {
      id: 'mat-black',
      sku: 'MB',
      name: '全毛黑色',
      colorIds: [],
      sizeIds: [],
      variants: [],
      milestoneNodeIds: [],
      categoryCustomData: {},
    };

    const matWhite: Product = {
      id: 'mat-white',
      sku: 'MW',
      name: '全毛白色',
      colorIds: [],
      sizeIds: [],
      variants: [],
      milestoneNodeIds: [],
      categoryCustomData: {},
    };

    const product: Product = {
      id: 'prod1',
      sku: 'SKU1',
      name: '毛衣',
      colorIds: ['c-black', 'c-white'],
      sizeIds: ['s-m'],
      variants: [
        {
          id: 'v-black-m',
          colorId: 'c-black',
          sizeId: 's-m',
          skuSuffix: '',
          nodeBoms: { 'node-knit': 'bom-k-black', 'node-dye': 'bom-d-black' },
        },
        {
          id: 'v-white-m',
          colorId: 'c-white',
          sizeId: 's-m',
          skuSuffix: '',
          nodeBoms: { 'node-knit': 'bom-k-white', 'node-dye': 'bom-d-white' },
        },
      ],
      milestoneNodeIds: ['node-knit', 'node-dye'],
      categoryCustomData: {},
    };

    const boms: BOM[] = [
      {
        id: 'bom-k-black',
        name: 'B',
        parentProductId: 'prod1',
        variantId: 'v-black-m',
        nodeId: 'node-knit',
        version: '1',
        items: [{ productId: 'mat-black', quantity: 25 }, { productId: 'mat-white', quantity: 5 }],
      },
      {
        id: 'bom-k-white',
        name: 'W',
        parentProductId: 'prod1',
        variantId: 'v-white-m',
        nodeId: 'node-knit',
        version: '1',
        items: [{ productId: 'mat-white', quantity: 25 }, { productId: 'mat-black', quantity: 5 }],
      },
      {
        id: 'bom-d-black',
        name: 'DB',
        parentProductId: 'prod1',
        variantId: 'v-black-m',
        nodeId: 'node-dye',
        version: '1',
        items: [{ productId: 'mat-black', quantity: 1 }],
      },
      {
        id: 'bom-d-white',
        name: 'DW',
        parentProductId: 'prod1',
        variantId: 'v-white-m',
        nodeId: 'node-dye',
        version: '1',
        items: [{ productId: 'mat-white', quantity: 2 }],
      },
    ];

    const globalNodes: GlobalNodeTemplate[] = [
      { id: 'node-knit', name: '织造', hasBOM: true, reportTemplate: [] },
      { id: 'node-dye', name: '染色', hasBOM: true, reportTemplate: [] },
    ];

    const plan: PlanOrder = {
      id: 'p1',
      planNumber: 'PL-1',
      productId: 'prod1',
      items: [
        { variantId: 'v-white-m', quantity: 5 },
        { variantId: 'v-black-m', quantity: 7 },
      ],
      startDate: '2026-01-01',
      status: 'PLANNING',
      customer: '',
      priority: 'Medium',
    };

    const rows = buildPlanPrintListRows(plan, product, dictionaries, {
      globalNodes,
      boms,
      products: [product, matBlack, matWhite],
    });

    const raw = rows[0]?.[COLOR_MATERIAL_MATRIX_JSON_KEY];
    expect(typeof raw).toBe('string');
    const parsed = parseColorMaterialMatrixFromRow(rows[0]);
    expect(parsed?.nodeBlocks.map(b => b.nodeName)).toEqual(['织造', '染色']);
    expect(parsed?.nodeBlocks[0]?.colorRows.map(r => r.colorName)).toEqual(['白', '黑']);
    expect(parsed?.nodeBlocks[0]?.colorRows[1]?.materials[0]?.name).toBe('全毛黑色');
    expect(parsed?.nodeBlocks[0]?.colorRows.map(r => r.materials.map(m => m.ratio))).toEqual([
      ['125', '25'],
      ['175', '35'],
    ]);
    expect(parsed?.nodeBlocks[1]?.colorRows.map(r => r.materials.map(m => m.ratio))).toEqual([['10'], ['7']]);
  });
});

describe('buildColorMaterialMatrixPayloadForPlan', () => {
  it('单色 SKU 使用 single-${productId} 解析 BOM', () => {
    const product: Product = {
      id: 'prod-s',
      sku: 'SK',
      name: '单 SKU',
      colorIds: [],
      sizeIds: [],
      variants: [],
      milestoneNodeIds: ['n1'],
      categoryCustomData: {},
    };

    const mat: Product = {
      id: 'm1',
      sku: 'M',
      name: '纱线A',
      colorIds: [],
      sizeIds: [],
      variants: [],
      milestoneNodeIds: [],
      categoryCustomData: {},
    };
    const boms: BOM[] = [
      {
        id: 'sbom',
        name: 'x',
        parentProductId: 'prod-s',
        variantId: 'single-prod-s',
        nodeId: 'n1',
        version: '1',
        items: [{ productId: 'm1', quantity: 3 }],
      },
    ];
    const globalNodes: GlobalNodeTemplate[] = [{ id: 'n1', name: '针织', hasBOM: true, reportTemplate: [] }];
    const plan: PlanOrder = {
      id: 'pl',
      planNumber: 'P',
      productId: 'prod-s',
      items: [{ quantity: 100 }],
      startDate: '2026-01-01',
      status: 'PLANNING',
      customer: '',
      priority: 'Medium',
    };

    const payload = buildColorMaterialMatrixPayloadForPlan({
      plan,
      product,
      dictionaries: { colors: [], sizes: [], units: [] },
      globalNodes,
      boms,
      products: [product, mat],
      hasVariantQty: false,
      qtyNoVariant: 100,
    });
    expect(payload.nodeBlocks).toHaveLength(1);
    expect(payload.nodeBlocks[0]?.colorRows[0]?.colorName).toBe('—');
    expect(payload.nodeBlocks[0]?.colorRows[0]?.materials[0]?.name).toBe('纱线A');
    expect(payload.nodeBlocks[0]?.colorRows[0]?.materials[0]?.ratio).toBe('300');
  });
});
