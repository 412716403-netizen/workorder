/**
 * 颜色×尺码矩阵布局（对齐 Web utils/variantQtyMatrix.ts）
 */

function sortedVariantColorEntries(grouped, colorIds, sizeIds) {
  const entries = Object.entries(grouped || {});
  if (colorIds && colorIds.length) {
    const colorOrder = new Map(colorIds.map((id, i) => [id, i]));
    entries.sort(([a], [b]) => {var _colorOrder$get, _colorOrder$get2;return ((_colorOrder$get = colorOrder.get(a)) != null ? _colorOrder$get : Infinity) - ((_colorOrder$get2 = colorOrder.get(b)) != null ? _colorOrder$get2 : Infinity);});
  }
  if (sizeIds && sizeIds.length) {
    const sizeOrder = new Map(sizeIds.map((id, i) => [id, i]));
    entries.forEach(([, variants]) => {
      variants.sort(
        (a, b) => {var _sizeOrder$get, _sizeOrder$get2;return ((_sizeOrder$get = sizeOrder.get(a.sizeId)) != null ? _sizeOrder$get : Infinity) - ((_sizeOrder$get2 = sizeOrder.get(b.sizeId)) != null ? _sizeOrder$get2 : Infinity);}
      );
    });
  }
  return entries;
}

/**
 * @param {object} product
 * @param {{ colors?: object[]; sizes?: object[] }} dict
 * @returns {{ sizeColumns: object[]; colorRows: object[] } | null}
 */
function buildVariantQtyMatrixLayout(product, dict) {
  const variants = product && product.variants;
  if (!variants || !variants.length) return null;

  const colors = dict.colors || [];
  const sizes = dict.sizes || [];

  const fullGrid =
  Boolean(product.colorIds && product.colorIds.length && product.sizeIds && product.sizeIds.length &&
  colors.length && sizes.length);

  if (fullGrid) {
    const colorRows = [];
    product.colorIds.forEach((colorId) => {
      const color = colors.find((c) => c.id === colorId);
      if (!color) return;
      const variantAtSize = product.sizeIds.map(
        (sizeId) => variants.find((v) => v.colorId === colorId && v.sizeId === sizeId) || null
      );
      colorRows.push({
        key: colorId,
        colorLabel: color.name,
        colorSwatch: color.value || '',
        variantAtSize
      });
    });
    const sizeColumns = product.sizeIds.map((sizeId) => {
      const s = sizes.find((x) => x.id === sizeId);
      const name = s && String(s.name || '').trim() ? String(s.name).trim() : sizeId;
      return { id: sizeId, header: name };
    });
    return { sizeColumns, colorRows };
  }

  const groupedByColor = {};
  variants.forEach((v) => {
    const cid = v.colorId || '_';
    if (!groupedByColor[cid]) groupedByColor[cid] = [];
    groupedByColor[cid].push(v);
  });
  const entries = sortedVariantColorEntries(groupedByColor, product.colorIds, product.sizeIds);

  const allSizeIds = new Set();
  variants.forEach((v) => {
    if (v.sizeId) allSizeIds.add(v.sizeId);
  });
  let sizeIdsOrdered = [...allSizeIds];
  if (product.sizeIds && product.sizeIds.length) {
    const order = new Map(product.sizeIds.map((id, i) => [id, i]));
    sizeIdsOrdered.sort((a, b) => {var _order$get, _order$get2;return ((_order$get = order.get(a)) != null ? _order$get : 999) - ((_order$get2 = order.get(b)) != null ? _order$get2 : 999);});
  } else {
    sizeIdsOrdered.sort((a, b) => {
      const na = (sizes.find((s) => s.id === a) || {}).name || a;
      const nb = (sizes.find((s) => s.id === b) || {}).name || b;
      return String(na).localeCompare(String(nb), 'zh-CN');
    });
  }

  const sizeColumns = sizeIdsOrdered.map((sizeId) => {
    const s = sizes.find((x) => x.id === sizeId);
    const name = s && String(s.name || '').trim() ? String(s.name).trim() : sizeId;
    return { id: sizeId, header: name };
  });

  const colorRows = entries.map(([colorId, colorVariants]) => {
    const color = colorId !== '_' ? colors.find((c) => c.id === colorId) : undefined;
    const colorLabel = color ? color.name : colorId === '_' ? '规格' : colorId;
    const colorSwatch = color && color.value || '';
    const variantAtSize = sizeIdsOrdered.map(
      (sid) => colorVariants.find((v) => v.sizeId === sid) || null
    );
    return { key: String(colorId), colorLabel, colorSwatch, variantAtSize };
  });

  return { sizeColumns, colorRows };
}

/**
 * 转为小程序矩阵 UI 模型（含 quantity 字段）
 * @param {object} product
 * @param {{ colors?: object[]; sizes?: object[] }} dict
 * @param {Record<string, string|number>} [quantities]
 * @param {{ systemQtyByVariantId?: Record<string, number|null|undefined> }} [options]
 */
function buildVariantMatrixUiModel(product, dict, quantities, options) {
  const layout = buildVariantQtyMatrixLayout(product, dict);
  if (!layout) return null;

  const qtyMap = quantities || {};
  const sysMap = options && options.systemQtyByVariantId;
  const colorRows = layout.colorRows.map((row) => ({
    key: row.key,
    colorLabel: row.colorLabel,
    colorSwatch: row.colorSwatch,
    cells: row.variantAtSize.map((v) => {
      if (!v) {
        return { variantId: '', quantity: '', disabled: true, hasSystemQty: false, systemQty: '' };
      }
      const hasSystemQty = Boolean(sysMap && sysMap[v.id] != null);
      return {
        variantId: v.id,
        quantity: qtyMap[v.id] != null ? String(qtyMap[v.id]) : '',
        disabled: false,
        hasSystemQty,
        systemQty: hasSystemQty ? String(sysMap[v.id]) : ''
      };
    })
  }));

  return {
    sizeColumns: layout.sizeColumns,
    colorRows
  };
}

function sortVariantsByColorThenSize(variants, colorIds, sizeIds) {
  const colorOrder = new Map((colorIds || []).map((id, i) => [id, i]));
  const sizeOrder = new Map((sizeIds || []).map((id, i) => [id, i]));
  return [...(variants || [])].sort((a, b) => {var _colorOrder$get3, _colorOrder$get4, _sizeOrder$get3, _sizeOrder$get4;
    const ca = (_colorOrder$get3 = colorOrder.get(a.colorId)) != null ? _colorOrder$get3 : Infinity;
    const cb = (_colorOrder$get4 = colorOrder.get(b.colorId)) != null ? _colorOrder$get4 : Infinity;
    if (ca !== cb) return ca - cb;
    const sa = (_sizeOrder$get3 = sizeOrder.get(a.sizeId)) != null ? _sizeOrder$get3 : Infinity;
    const sb = (_sizeOrder$get4 = sizeOrder.get(b.sizeId)) != null ? _sizeOrder$get4 : Infinity;
    if (sa !== sb) return sa - sb;
    return String(a.id || '').localeCompare(String(b.id || ''), 'zh-CN');
  });
}

module.exports = {
  sortedVariantColorEntries,
  buildVariantQtyMatrixLayout,
  buildVariantMatrixUiModel,
  sortVariantsByColorThenSize
};