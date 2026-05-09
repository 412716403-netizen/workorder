import { describe, expect, it } from 'vitest';
import type { PrintBodyElement, PrintDynamicListElementConfig, PrintListRow, PrintRenderContext } from '../types';
import { COLOR_MATERIAL_MATRIX_JSON_KEY, serializeColorMaterialMatrixPayload } from './colorMaterialMatrixPrint';
import { COLOR_SIZE_MATRIX_JSON_KEY, serializeColorSizeMatrixPayload } from './colorSizeMatrixPrint';
import {
  computeBodyVerticalPushByElementId,
  estimateDynamicListOverflowMm,
} from '../components/print-editor/printBodyVerticalPush';

function listEl(overrides: Partial<PrintBodyElement> & { height: number; y: number }): PrintBodyElement {
  const cfg: PrintDynamicListElementConfig = {
    dataColumnCount: 2,
    showHeader: true,
    showSerial: true,
    serialHeaderLabel: '序号',
    borderStyle: 'solid',
    borderColor: '#000',
    headerBackgroundColor: '#fff',
    headerFontSizePt: 6,
    fontSizePt: 6,
    columns: [
      { id: 'a', headerLabel: 'A', contentTemplate: '{{行.a}}', textAlign: 'left', color: '#000' },
      {
        id: 'm',
        headerLabel: '矩阵',
        contentTemplate: '',
        textAlign: 'center',
        color: '#000',
        cellKind: 'colorSizeMatrix',
        matrixColorHeader: '色',
        matrixSizeGroupTitle: '码',
      },
    ],
  };
  return {
    id: 'dl1',
    type: 'dynamicList',
    x: 0,
    y: overrides.y,
    width: 100,
    height: overrides.height,
    zIndex: 1,
    repeatPerPage: false,
    config: cfg,
    ...overrides,
  } as PrintBodyElement;
}

function listElMaterial(overrides: Partial<PrintBodyElement> & { height: number; y: number }): PrintBodyElement {
  const cfg: PrintDynamicListElementConfig = {
    dataColumnCount: 2,
    showHeader: true,
    showSerial: true,
    serialHeaderLabel: '序号',
    borderStyle: 'solid',
    borderColor: '#000',
    headerBackgroundColor: '#fff',
    headerFontSizePt: 6,
    fontSizePt: 6,
    columns: [
      { id: 'a', headerLabel: 'A', contentTemplate: '{{行.a}}', textAlign: 'left', color: '#000' },
      {
        id: 'm',
        headerLabel: '矩阵',
        contentTemplate: '',
        textAlign: 'center',
        color: '#000',
        cellKind: 'colorMaterialMatrix',
        matrixColorHeader: '颜色',
        matrixSizeGroupTitle: '工序物料',
      },
    ],
  };
  return {
    id: 'dl-m',
    type: 'dynamicList',
    x: 0,
    y: overrides.y,
    width: 100,
    height: overrides.height,
    zIndex: 1,
    repeatPerPage: false,
    config: cfg,
    ...overrides,
  } as PrintBodyElement;
}

describe('estimateDynamicListOverflowMm', () => {
  it('未设置 bodyRowHeightMm 时仍按默认行高估算矩阵溢出', () => {
    const el = listEl({ y: 10, height: 20 });
    const rows: PrintListRow[] = [
      {
        index: 1,
        [COLOR_SIZE_MATRIX_JSON_KEY]: serializeColorSizeMatrixPayload({
          sizes: ['S', 'M'],
          colorRows: [
            { colorName: '红', quantities: [1, 2] },
            { colorName: '蓝', quantities: [3, 4] },
          ],
        }),
      },
    ];
    const ctx: PrintRenderContext = { printListRows: rows };
    const chunk = { rows, serialStart: 1 };
    // matrixVisualSubRowCount = 1 + 色行数 = 3；表头 4 + 3×6 = 22，框高 20 → 溢出 2
    expect(estimateDynamicListOverflowMm(el, ctx, chunk)).toBe(2);
    const elShort = listEl({ y: 10, height: 10 });
    expect(estimateDynamicListOverflowMm(elShort, ctx, chunk)).toBe(12);
  });

  it('颜色物料矩阵按模版列类型累计视觉子行（含工序标题行）', () => {
    const el = listElMaterial({ y: 10, height: 20 });
    const rows: PrintListRow[] = [
      {
        index: 1,
        [COLOR_MATERIAL_MATRIX_JSON_KEY]: serializeColorMaterialMatrixPayload({
          nodeBlocks: [
            {
              nodeName: '织造',
              colorRows: [
                { colorName: '黑', materials: [{ name: '纱A', ratio: '1' }] },
                { colorName: '白', materials: [{ name: '纱B', ratio: '2' }] },
              ],
            },
          ],
        }),
      },
    ];
    const ctx: PrintRenderContext = { printListRows: rows };
    const chunk = { rows, serialStart: 1 };
    // 1 节点标题 + 2 色 × 2 行 = 5 子行；表头 4 + 5×6 = 34，框 20 → 溢出 14
    expect(estimateDynamicListOverflowMm(el, ctx, chunk)).toBe(14);
  });

  it('computeBodyVerticalPushByElementId 将列表下方元素下移', () => {
    const dl = listEl({ id: 'dl', y: 5, height: 10 });
    const text: PrintBodyElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 20,
      width: 50,
      height: 5,
      zIndex: 2,
      repeatPerPage: false,
      config: { content: '合计', fontSizePt: 8, fontWeight: 'normal', textAlign: 'left', color: '#000' },
    };
    const rows: PrintListRow[] = [
      {
        index: 1,
        [COLOR_SIZE_MATRIX_JSON_KEY]: serializeColorSizeMatrixPayload({
          sizes: ['S'],
          colorRows: [
            { colorName: '红', quantities: [1] },
            { colorName: '蓝', quantities: [2] },
            { colorName: '绿', quantities: [3] },
          ],
        }),
      },
    ];
    const ctx: PrintRenderContext = { printListRows: rows };
    const pushMap = computeBodyVerticalPushByElementId([text, dl], ctx, { rows, serialStart: 1 });
    const overflow = estimateDynamicListOverflowMm(dl, ctx, { rows, serialStart: 1 });
    expect(overflow).toBeGreaterThan(0);
    expect(pushMap.get('dl')).toBe(0);
    expect(pushMap.get('t1')).toBe(overflow);
  });
});
