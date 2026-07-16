/**
 * 从 lucide-react 图标节点导出小程序 PNG 资源。
 * 用法：npm run miniprogram:icons
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const ASSETS = path.join(ROOT, 'assets');
const ICONS_DIR = path.join(ASSETS, 'icons');
const TAB_DIR = path.join(ASSETS, 'tab');
const MINE_DIR = path.join(ASSETS, 'mine');
const LUCIDE_ICONS = path.join(REPO_ROOT, 'node_modules/lucide-react/dist/esm/icons');

const BLUE = '#2F6BFF';
const GRAY = '#8F959E';
const STROKE_WIDTH = 2;
const VIEWBOX = 24;

/** lucide-react 部分图标为 re-export，需映射到实际含 __iconNode 的文件 */
const ICON_ALIASES = {
  'file-bar-chart': 'file-chart-column-increasing',
  home: 'house',
  'circle-help': 'circle-question-mark',
  'arrow-down-circle': 'circle-arrow-down',
  'arrow-up-circle': 'circle-arrow-up',
};

/** 工作台目录用到的 Lucide 图标（与 shared/workbenchShortcuts.ts 一致） */
const APP_ICON_NAMES = [
  'calendar-range',
  'clipboard-list',
  'arrow-up-from-line',
  'truck',
  'rotate-ccw',
  'receipt',
  'shopping-bag',
  'credit-card',
  'warehouse',
  'arrow-down-circle',
  'arrow-up-circle',
  'scale',
  'boxes',
  'building-2',
  'shield-check',
  'cpu',
  'library',
  'inbox',
  'scan-line',
  'flask-conical',
  'book-open',
  'settings',
  'search',
  'tag',
  'shapes',
  'database',
  'wallet',
  'link-2',
  'clock',
  'circle-check',
  'list-filter',
  'file-plus',
  'user',
  'scroll-text',
  'history',
  'arrow-down-to-line',
  'arrow-left-right',
];

/** @type {Record<string, { icon: string; active?: boolean }[]>} */
const TAB_SPECS = [
  { name: 'home', icon: 'home' },
  { name: 'apps', icon: 'layout-grid' },
  { name: 'scan', icon: 'scan-line' },
  { name: 'messages', icon: 'bell' },
  { name: 'mine', icon: 'user' },
];

/** @type {Record<string, string>} */
const MINE_SPECS = {
  tenant: 'building-2',
  switch: 'arrow-left-right',
  security: 'lock',
  notify: 'bell',
  help: 'circle-help',
  about: 'info',
};

/**
 * @param {[string, Record<string, string>][]} iconNode
 * @param {string} color
 */
function iconNodeToSvg(iconNode, color) {
  const body = iconNode
    .map(([tag, attrs]) => {
      const pairs = Object.entries(attrs).filter(
        ([k]) => k !== 'key' && k !== 'fill' && k !== 'stroke' && k !== 'stroke-width',
      );
      const attrStr = pairs.map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
      const strokeAttrs =
        'fill="none" stroke="' +
        color +
        '" stroke-width="' +
        STROKE_WIDTH +
        '" stroke-linecap="round" stroke-linejoin="round"';
      if (tag === 'path') return `<path ${attrStr} ${strokeAttrs}/>`;
      if (tag === 'line') return `<line ${attrStr} ${strokeAttrs}/>`;
      if (tag === 'rect') return `<rect ${attrStr} ${strokeAttrs}/>`;
      if (tag === 'circle') return `<circle ${attrStr} ${strokeAttrs}/>`;
      if (tag === 'polyline') return `<polyline ${attrStr} ${strokeAttrs}/>`;
      if (tag === 'polygon') return `<polygon ${attrStr} ${strokeAttrs}/>`;
      return '';
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${VIEWBOX}" height="${VIEWBOX}">` +
    body +
    '</svg>'
  );
}

/**
 * @param {string} iconName
 */
async function loadIconNode(iconName) {
  const resolved = ICON_ALIASES[iconName] ?? iconName;
  const modPath = path.join(LUCIDE_ICONS, `${resolved}.js`);
  if (!fs.existsSync(modPath)) {
    throw new Error(`Lucide icon not found: ${iconName}`);
  }
  const mod = await import(pathToFileURL(modPath).href);
  if (!mod.__iconNode) {
    throw new Error(`Missing __iconNode for: ${iconName}`);
  }
  return mod.__iconNode;
}

/**
 * @param {string} svg
 * @param {number} size
 * @param {string} outPath
 */
async function writePng(svg, size, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

/**
 * @param {string} iconName
 * @param {string} outName
 * @param {number} size
 * @param {string} folder
 * @param {string} color
 */
async function exportIcon(iconName, outName, size, folder, color) {
  const node = await loadIconNode(iconName);
  const svg = iconNodeToSvg(node, color);
  await writePng(svg, size, path.join(folder, `${outName}.png`));
}

async function main() {
  for (const dir of [ICONS_DIR, TAB_DIR, MINE_DIR]) {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (file.endsWith('.png')) fs.unlinkSync(path.join(dir, file));
      }
    }
  }

  for (const name of APP_ICON_NAMES) {
    await exportIcon(name, name, 48, ICONS_DIR, BLUE);
  }

  for (const tab of TAB_SPECS) {
    await exportIcon(tab.icon, tab.name, 81, TAB_DIR, GRAY);
    await exportIcon(tab.icon, `${tab.name}-active`, 81, TAB_DIR, BLUE);
  }

  for (const [outName, iconName] of Object.entries(MINE_SPECS)) {
    await exportIcon(iconName, outName, 40, MINE_DIR, BLUE);
  }

  // 收/付款分类标签：细线简约文档（非 Lucide receipt 锯齿边）
  const financeCategorySvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${VIEWBOX}" height="${VIEWBOX}" fill="none" stroke="${BLUE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    '<rect x="6" y="3.5" width="12" height="17" rx="2"/>' +
    '<line x1="9" y1="9" x2="15" y2="9"/>' +
    '<line x1="9" y1="13" x2="15" y2="13"/>' +
    '</svg>';
  await writePng(financeCategorySvg, 96, path.join(ICONS_DIR, 'finance-category.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
