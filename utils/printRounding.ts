import type {
  PrintBodyElement,
  PrintBodyElementType,
  PrintDynamicListElementConfig,
  PrintElementConfig,
  PrintHeaderFooterConfig,
  PrintImageElementConfig,
  PrintLineElementConfig,
  PrintRectElementConfig,
  PrintTableElementConfig,
  PrintTemplate,
  PrintTextElementConfig,
} from '../types';

/** 打印编辑器内尺寸、坐标等统一保留 1 位小数 */
export function roundPrintDecimal1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function roundDynamicListConfig(c: PrintDynamicListElementConfig): PrintDynamicListElementConfig {
  const serial =
    c.serialColumnWidthMm != null && c.serialColumnWidthMm > 0 ? roundPrintDecimal1(c.serialColumnWidthMm) : c.serialColumnWidthMm;
  const widths = c.dataColumnWidthsMm?.map(w => (w > 0 ? roundPrintDecimal1(w) : w));
  const hh = c.headerRowHeightMm != null && c.headerRowHeightMm > 0 ? roundPrintDecimal1(c.headerRowHeightMm) : c.headerRowHeightMm;
  const bh = c.bodyRowHeightMm != null && c.bodyRowHeightMm > 0 ? roundPrintDecimal1(c.bodyRowHeightMm) : c.bodyRowHeightMm;
  const columns = (c.columns ?? []).map(col => ({
    ...col,
    fontSizePt:
      col.fontSizePt != null && col.fontSizePt > 0 ? roundPrintDecimal1(Math.min(48, Math.max(1, col.fontSizePt))) : col.fontSizePt,
    headerFontSizePt:
      col.headerFontSizePt != null && col.headerFontSizePt > 0
        ? roundPrintDecimal1(Math.min(48, Math.max(1, col.headerFontSizePt)))
        : col.headerFontSizePt,
  }));
  return {
    ...c,
    serialColumnWidthMm: serial,
    dataColumnWidthsMm: widths,
    headerRowHeightMm: hh,
    bodyRowHeightMm: bh,
    headerFontSizePt: roundPrintDecimal1(c.headerFontSizePt),
    fontSizePt: roundPrintDecimal1(c.fontSizePt),
    columns,
  };
}

export function roundPrintElementConfigForType(type: PrintBodyElementType, config: PrintElementConfig): PrintElementConfig {
  switch (type) {
    case 'text': {
      const c = config as PrintTextElementConfig;
      return { ...c, fontSizePt: roundPrintDecimal1(c.fontSizePt) };
    }
    case 'line': {
      const c = config as PrintLineElementConfig;
      const a = c.angleDeg;
      return {
        ...c,
        thicknessMm: roundPrintDecimal1(c.thicknessMm),
        angleDeg: a === undefined || a === null ? 0 : roundPrintDecimal1(a),
      };
    }
    case 'rect': {
      const c = config as PrintRectElementConfig;
      return {
        ...c,
        borderWidthMm: roundPrintDecimal1(c.borderWidthMm),
        cornerRadiusMm: roundPrintDecimal1(c.cornerRadiusMm),
      };
    }
    case 'image': {
      const c = config as PrintImageElementConfig;
      const op = c.opacityPct;
      const pct = op === undefined || op === null ? 100 : Math.min(100, Math.max(0, Math.round(op)));
      const nar = c.naturalAspectRatio;
      const ratio =
        nar != null && nar > 0 ? Math.round(nar * 10000) / 10000 : undefined;
      return { ...c, opacityPct: pct, naturalAspectRatio: ratio };
    }
    case 'dynamicTable': {
      const c = config as PrintTableElementConfig;
      const fs = c.cellFontSizePt;
      const cellFontSizePt =
        !fs || !Object.keys(fs).length
          ? fs
          : Object.fromEntries(
              Object.entries(fs).map(([key, v]) => [key, roundPrintDecimal1(Math.max(1, Math.min(48, v)))]),
            );
      return { ...c, cellFontSizePt };
    }
    case 'dynamicList':
      return roundDynamicListConfig(config as PrintDynamicListElementConfig);
    case 'qrcode':
      return config;
    default:
      return config;
  }
}

export function roundHeaderFooterConfig(h: PrintHeaderFooterConfig): PrintHeaderFooterConfig {
  return {
    ...h,
    heightMm: roundPrintDecimal1(h.heightMm),
    borderWidthMm: roundPrintDecimal1(h.borderWidthMm),
    items: h.items.map(it => ({
      ...it,
      fontSizePt: roundPrintDecimal1(it.fontSizePt),
    })),
  };
}

/** 线条：宽=线长、高=线粗；旧数据「竖线」为 height>width，转为 angleDeg=90 */
export function normalizeLineBodyElement(e: PrintBodyElement): PrintBodyElement {
  if (e.type !== 'line') return e;
  const conf = e.config as PrintLineElementConfig;
  let nw = e.width;
  let nh = e.height;
  let angle = conf.angleDeg;
  if ((angle === undefined || angle === null) && nh > nw) {
    nw = e.height;
    nh = e.width;
    angle = 90;
  }
  if (angle === undefined || angle === null) angle = 0;
  const tmm = roundPrintDecimal1(Math.max(0.05, conf.thicknessMm));
  nh = Math.max(0.5, tmm);
  const nconf: PrintLineElementConfig = {
    ...conf,
    thicknessMm: tmm,
    angleDeg: roundPrintDecimal1(angle),
  };
  return {
    ...e,
    x: roundPrintDecimal1(Math.max(0, e.x)),
    y: roundPrintDecimal1(Math.max(0, e.y)),
    width: roundPrintDecimal1(Math.max(2, nw)),
    height: roundPrintDecimal1(nh),
    config: nconf,
  };
}

/** 载入/设置模板时统一数值精度，避免属性面板出现过长小数 */
export function normalizePrintTemplateNumeric1(t: PrintTemplate): PrintTemplate {
  const m = t.paperMarginsMm;
  return {
    ...t,
    paperSize: {
      widthMm: roundPrintDecimal1(Math.max(0.1, t.paperSize.widthMm)),
      heightMm: roundPrintDecimal1(Math.max(0.1, t.paperSize.heightMm)),
    },
    paperMarginsMm: m
      ? {
          top: roundPrintDecimal1(Math.max(0, m.top)),
          bottom: roundPrintDecimal1(Math.max(0, m.bottom)),
          left: roundPrintDecimal1(Math.max(0, m.left)),
          right: roundPrintDecimal1(Math.max(0, m.right)),
        }
      : m,
    header: t.header ? roundHeaderFooterConfig(t.header) : t.header,
    footer: t.footer ? roundHeaderFooterConfig(t.footer) : t.footer,
    elements: t.elements.map(e => {
      if (e.type === 'line') return normalizeLineBodyElement(e);
      return {
        ...e,
        x: roundPrintDecimal1(Math.max(0, e.x)),
        y: roundPrintDecimal1(Math.max(0, e.y)),
        width: roundPrintDecimal1(Math.max(0.1, e.width)),
        height: roundPrintDecimal1(Math.max(0.1, e.height)),
        config: roundPrintElementConfigForType(e.type, e.config),
      };
    }),
  };
}
