#!/usr/bin/env node
/**
 * 将主包未使用的 config/utils 及仅分包引用的 components 迁入 business 分包。
 * 用法：node miniprogram/scripts/migrate-subpackage-utils.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'packageBusiness');

const MAIN_PACKAGE_COMPONENTS = new Set([
  'empty-state',
  'page-header',
  'tab-shell',
  'icon-grid',
  'workbench-stat-card',
]);

const APP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const MAIN_PAGES = APP_JSON.pages.map((p) => path.join(ROOT, 'pages', p.replace(/^pages\//, '')));

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveRequire(fromFile, reqPath) {
  if (!reqPath.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), reqPath);
  for (const c of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function extractRequires(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function componentPathFromRef(ref) {
  if (!ref.startsWith('/components/')) return null;
  return path.join(ROOT, ref.replace(/^\//, ''), `${path.basename(ref)}.js`);
}

function collectComponentsFromJson(jsonPath, queue) {
  const json = readJsonSafe(jsonPath);
  if (!json || !json.usingComponents) return;
  Object.values(json.usingComponents).forEach((ref) => {
    const compJs = componentPathFromRef(ref);
    if (compJs && fs.existsSync(compJs)) queue.push(compJs);
  });
}

function computeMainReachable() {
  const visited = new Set();
  const queue = [path.join(ROOT, 'app.js'), ...MAIN_PAGES.map((p) => `${p}.js`)];
  while (queue.length) {
    const file = queue.pop();
    if (!file || visited.has(file) || !fs.existsSync(file)) continue;
    visited.add(file);
    const jsonPath = file.replace(/\.js$/, '.json');
    if (fs.existsSync(jsonPath)) collectComponentsFromJson(jsonPath, queue);
    extractRequires(file).forEach((req) => {
      const resolved = resolveRequire(file, req);
      if (resolved) queue.push(resolved);
    });
  }
  return visited;
}

function walkDir(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkDir(full, acc);
    else acc.push(full);
  }
  return acc;
}

function ensureDir(dir) {
  if (!DRY_RUN && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function movePath(from, to) {
  if (from === to) return;
  ensureDir(path.dirname(to));
  if (DRY_RUN) {
    console.log('[dry-run] move', path.relative(ROOT, from), '->', path.relative(ROOT, to));
    return;
  }
  fs.renameSync(from, to);
  console.log('moved', path.relative(ROOT, from), '->', path.relative(ROOT, to));
}

function patchFileContent(filePath, patches) {
  if (!fs.existsSync(filePath)) return false;
  let src = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of patches) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    if (DRY_RUN) console.log('[dry-run] patch', path.relative(ROOT, filePath));
    else fs.writeFileSync(filePath, src, 'utf8');
  }
  return changed;
}

function patchAll(files, patches) {
  files.forEach((f) => patchFileContent(f, patches));
}

// ── 1. 迁移 config/utils ──
const mainReachable = computeMainReachable();
const toMove = [];
for (const f of walkDir(path.join(ROOT, 'utils'))) {
  if (!mainReachable.has(f)) toMove.push(f);
}
for (const f of walkDir(path.join(ROOT, 'config'))) {
  if (!mainReachable.has(f)) toMove.push(f);
}

console.log(`Step 1: moving ${toMove.length} config/utils files...`);
for (const abs of toMove.sort()) {
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('utils/')) {
    movePath(abs, path.join(PKG, 'utils', rel.slice('utils/'.length)));
  } else if (rel.startsWith('config/')) {
    movePath(abs, path.join(PKG, 'config', rel.slice('config/'.length)));
  }
}

// ── 2. 迁移仅分包使用的 components ──
const compRoot = path.join(ROOT, 'components');
const toMoveComponents = fs.readdirSync(compRoot).filter((name) => {
  const full = path.join(compRoot, name);
  return fs.statSync(full).isDirectory() && !MAIN_PACKAGE_COMPONENTS.has(name);
});

console.log(`Step 2: moving ${toMoveComponents.length} components...`);
const pkgCompRoot = path.join(PKG, 'components');
for (const name of toMoveComponents) {
  movePath(path.join(compRoot, name), path.join(pkgCompRoot, name));
}

// ── 3. 更新引用路径 ──
const pkgJsJsonWxml = walkDir(PKG).filter((f) => /\.(js|json|wxml)$/.test(f));
const movedCompJs = walkDir(pkgCompRoot).filter((f) => f.endsWith('.js'));
const movedUtilsConfig = walkDir(path.join(PKG, 'utils')).concat(walkDir(path.join(PKG, 'config')));

// 分包页面 ../../utils|config -> ../utils|config
patchAll(pkgJsJsonWxml, [
  ["require('../../utils/", "require('../utils/"],
  ["require('../../config/", "require('../config/"],
]);

// 迁入分包的 utils/config 内部
patchAll(movedUtilsConfig.filter((f) => f.endsWith('.js')), [
  ["require('../../config/", "require('../config/"],
  ["require('../../utils/", "require('../utils/"],
]);

// 迁入分包的 components：../../utils -> ../utils
patchAll(movedCompJs, [
  ["require('../../utils/", "require('../utils/"],
  ["require('../../config/", "require('../config/"],
]);

// 分包 json：/components/foo -> /packageBusiness/components/foo（保留主包共用组件路径）
for (const jsonFile of pkgJsJsonWxml.filter((f) => f.endsWith('.json'))) {
  const json = readJsonSafe(jsonFile);
  if (!json || !json.usingComponents) continue;
  let changed = false;
  const next = { ...json, usingComponents: { ...json.usingComponents } };
  Object.entries(next.usingComponents).forEach(([key, ref]) => {
    if (typeof ref === 'string' && ref.startsWith('/components/') && !ref.startsWith('/packageBusiness/')) {
      const compName = ref.split('/')[2];
      if (!MAIN_PACKAGE_COMPONENTS.has(compName)) {
        next.usingComponents[key] = `/packageBusiness/components/${compName}/${compName}`;
        changed = true;
      }
    }
  });
  if (changed) {
    if (DRY_RUN) console.log('[dry-run] patch json', path.relative(ROOT, jsonFile));
    else fs.writeFileSync(jsonFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

// 文档与规则中的路径提示（可选，仅 patch .mdc 若存在旧路径）
const docsAndRules = walkDir(path.join(ROOT, '..', '.cursor', 'rules')).concat(
  walkDir(path.join(ROOT, '..', 'docs')),
).filter((f) => f.endsWith('.md') || f.endsWith('.mdc'));

patchAll(docsAndRules, [
  ['miniprogram/utils/saveNavigation.js', 'miniprogram/packageBusiness/utils/saveNavigation.js'],
]);

console.log('Done.', DRY_RUN ? '(dry-run)' : '');
