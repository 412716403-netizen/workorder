import type { ItemCode, PrintListRow, DictionaryItem } from '../types';
import { formatItemCodeSerialLabel } from './serialLabels';

export interface ItemCodePrintContext {
  planNumber: string;
  productName: string;
  orderNumbers: string[];
  variants: Array<{
    id: string;
    colorId?: string | null;
    sizeId?: string | null;
    skuSuffix?: string | null;
  }>;
}

export function buildPrintListRowsFromItemCodes(
  codes: ItemCode[],
  ctx: ItemCodePrintContext,
  dictionaries: { colors: DictionaryItem[]; sizes: DictionaryItem[] },
  baseUrl: string,
): PrintListRow[] {
  const colorMap = new Map(dictionaries.colors.map(d => [d.id, d.name]));
  const sizeMap = new Map(dictionaries.sizes.map(d => [d.id, d.name]));
  const variantMap = new Map(ctx.variants.map(v => [v.id, v]));

  const ordersStr = ctx.orderNumbers.join(', ');

  return codes.map((code) => {
    let colorName = '';
    let sizeName = '';
    let variantLabel = '';

    if (code.variantId) {
      const variant = variantMap.get(code.variantId);
      if (variant) {
        colorName = variant.colorId ? (colorMap.get(variant.colorId) ?? '') : '';
        sizeName = variant.sizeId ? (sizeMap.get(variant.sizeId) ?? '') : '';
        const parts = [colorName, sizeName].filter(Boolean);
        variantLabel = parts.length > 0 ? parts.join('-') : (variant.skuSuffix ?? '');
      }
    }

    const serialLabel = formatItemCodeSerialLabel(ctx.planNumber, code.serialNo);

    return {
      scanUrl: `${baseUrl}/scan/${code.scanToken}`,
      scanToken: code.scanToken,
      serialNo: code.serialNo,
      serialLabel,
      variantLabel,
      colorName,
      sizeName,
      orderNumbers: ordersStr,
      status: code.status === 'ACTIVE' ? '正常' : '已作废',
      variantId: code.variantId ?? '',
    };
  });
}
