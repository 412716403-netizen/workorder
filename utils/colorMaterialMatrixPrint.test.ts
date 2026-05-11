import { describe, expect, it } from 'vitest';
import {
  COLOR_MATERIAL_MATRIX_JSON_KEY,
  parseColorMaterialMatrixFromRow,
  serializeColorMaterialMatrixPayload,
} from './colorMaterialMatrixPrint';

describe('colorMaterialMatrixPrint', () => {
  it('serialize round-trip', () => {
    const p = {
      nodeBlocks: [
        {
          nodeName: '织造',
          colorRows: [
            {
              colorName: '黑',
              materials: [
                { name: '全毛黑色', ratio: '25', productFormSummary: '成分: 羊毛' },
                { name: '全毛白色', ratio: '5' },
              ],
            },
          ],
        },
      ],
    };
    const row = { [COLOR_MATERIAL_MATRIX_JSON_KEY]: serializeColorMaterialMatrixPayload(p) };
    expect(parseColorMaterialMatrixFromRow(row)).toEqual(p);
  });

  it('parse rejects invalid json', () => {
    expect(parseColorMaterialMatrixFromRow({ [COLOR_MATERIAL_MATRIX_JSON_KEY]: '' })).toBeNull();
    expect(parseColorMaterialMatrixFromRow({ [COLOR_MATERIAL_MATRIX_JSON_KEY]: '{}' })).toBeNull();
    expect(parseColorMaterialMatrixFromRow({ [COLOR_MATERIAL_MATRIX_JSON_KEY]: '{"x":1}' })).toBeNull();
  });

  it('normalizes partial structures', () => {
    const row = {
      [COLOR_MATERIAL_MATRIX_JSON_KEY]: JSON.stringify({
        nodeBlocks: [{ nodeName: 'A', colorRows: [{ colorName: '红', materials: [{ ratio: 12 }] }] }],
      }),
    };
    const parsed = parseColorMaterialMatrixFromRow(row);
    expect(parsed?.nodeBlocks[0]?.colorRows[0]?.materials[0]).toEqual({ name: '', ratio: '12' });
  });
});
