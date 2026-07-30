#!/usr/bin/env node
/**
 * 按微信「代码质量」指南收敛主包：
 * 1. 把仅由分包使用的组件复制到各自分包并删除主包副本；
 * 2. 把单分包独占的工具迁入所属分包；
 * 3. 删除已确认无引用的兼容文件；
 * 4. 校验所有被改写的组件注册路径都存在。
 *
 * 本脚本只处理显式白名单，避免把跨分包共享 utils 错迁到单一分包。
 * 用法：node miniprogram/scripts/optimize-main-package.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.join(__dirname, '..');

const COMPONENT_PACKAGES = {
  'datetime-calendar-select': ['packageBusiness', 'packagePsi', 'packageFinance'],
  'searchable-product-select': ['packageBusiness', 'packagePsi', 'packageFinance'],
  'searchable-partner-select': ['packageBusiness', 'packagePsi', 'packageFinance'],
  'searchable-worker-select': ['packageBusiness', 'packageFinance'],
  'plan-form-custom-field': ['packageBusiness', 'packagePsi', 'packageFinance'],
  'matrix-qty-keyboard': ['packageBusiness', 'packagePsi'],
  'finance-category-tag-select': ['packagePsi', 'packageFinance'],
  'finance-account-select': ['packagePsi', 'packageFinance'],
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function ensureDir(dir) {
  if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(from, to) {
  if (DRY_RUN) {
    console.log('[dry-run] copy', path.relative(ROOT, from), '->', path.relative(ROOT, to));
    return;
  }
  fs.cpSync(from, to, { recursive: true });
}

function removePath(target) {
  if (!fs.existsSync(target)) return;
  if (DRY_RUN) {
    console.log('[dry-run] remove', path.relative(ROOT, target));
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function patchFile(file, replacements) {
  if (!fs.existsSync(file)) return false;
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (!source.includes(from)) continue;
    source = source.split(from).join(to);
    changed = true;
  }
  if (!changed) return false;
  if (DRY_RUN) console.log('[dry-run] patch', path.relative(ROOT, file));
  else fs.writeFileSync(file, source, 'utf8');
  return true;
}

function moveFile(from, to) {
  if (!fs.existsSync(from)) {
    if (fs.existsSync(to)) {
      console.log('skip already moved', path.relative(ROOT, to));
      return;
    }
    throw new Error(`待迁移文件不存在：${path.relative(ROOT, from)}`);
  }
  ensureDir(path.dirname(to));
  if (DRY_RUN) {
    console.log('[dry-run] move', path.relative(ROOT, from), '->', path.relative(ROOT, to));
    return;
  }
  fs.renameSync(from, to);
}

// 1. 组件按实际使用分包复制；复制后的组件引用主包 utils/config 要多退一级。
for (const [component, packages] of Object.entries(COMPONENT_PACKAGES)) {
  const sourceDir = path.join(ROOT, 'components', component);
  if (!fs.existsSync(sourceDir)) {
    console.log('skip missing component', component);
    continue;
  }
  for (const packageName of packages) {
    const targetDir = path.join(ROOT, packageName, 'components', component);
    ensureDir(path.dirname(targetDir));
    copyDir(sourceDir, targetDir);
    if (!DRY_RUN) {
      for (const file of walk(targetDir).filter((f) => f.endsWith('.js'))) {
        patchFile(file, [
          ["require('../../utils/", "require('../../../utils/"],
          ["require('../../config/", "require('../../../config/"],
        ]);
      }
    }
  }
}

// 2. 各分包 json 改为引用自己包内的组件。
for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
  for (const jsonFile of walk(path.join(ROOT, packageName)).filter((f) => f.endsWith('.json'))) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    } catch {
      continue;
    }
    if (!json.usingComponents) continue;
    let changed = false;
    for (const [key, value] of Object.entries(json.usingComponents)) {
      if (typeof value !== 'string') continue;
      for (const component of Object.keys(COMPONENT_PACKAGES)) {
        if (value !== `/components/${component}/${component}`) continue;
        if (!COMPONENT_PACKAGES[component].includes(packageName)) {
          throw new Error(`${packageName} 使用了未复制组件 ${component}`);
        }
        json.usingComponents[key] = `/${packageName}/components/${component}/${component}`;
        changed = true;
      }
    }
    if (changed) {
      if (DRY_RUN) console.log('[dry-run] patch json', path.relative(ROOT, jsonFile));
      else fs.writeFileSync(jsonFile, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    }
  }
}

// 3. 删除主包组件副本。
for (const component of Object.keys(COMPONENT_PACKAGES)) {
  removePath(path.join(ROOT, 'components', component));
}

// 4. 两个单分包独占工具迁移并修改调用方。
moveFile(
  path.join(ROOT, 'utils', 'todoNavigate.js'),
  path.join(ROOT, 'packageBusiness', 'utils', 'todoNavigate.js'),
);
for (const file of [
  path.join(ROOT, 'packageBusiness', 'todos', 'todos.js'),
  path.join(ROOT, 'packageBusiness', 'todo-edit', 'todo-edit.js'),
]) {
  patchFile(file, [["require('../../utils/todoNavigate.js')", "require('../utils/todoNavigate.js')"]]);
}

moveFile(
  path.join(ROOT, 'utils', 'psiDocFinanceEntry.js'),
  path.join(ROOT, 'packagePsi', 'utils', 'psiDocFinanceEntry.js'),
);
patchFile(path.join(ROOT, 'packagePsi', 'utils', 'psiDocFinancePanel.js'), [
  ["require('../../utils/psiDocFinanceEntry.js')", "require('./psiDocFinanceEntry.js')"],
]);
patchFile(path.join(ROOT, 'packagePsi', 'psi-doc-finance-entry', 'psi-doc-finance-entry.js'), [
  ["require('../../utils/psiDocFinanceEntry.js')", "require('../utils/psiDocFinanceEntry.js')"],
]);

// 已穷举引用：该文件只是 todoNavigate 的旧路径 re-export，当前零调用。
removePath(path.join(ROOT, 'utils', 'devTodoNavigate.js'));

// 5. 将主包不可达、仅分包使用的共享样式按需复制到各分包。
const STYLE_ROOT = path.join(ROOT, 'styles');

function extractStyleImports(file) {
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, 'utf8');
  const refs = [];
  const re = /@import\s+(['"])([^'"]+)\1\s*;/g;
  let match;
  while ((match = re.exec(source)) !== null) refs.push(match[2]);
  return refs;
}

function resolveRootStyle(fromFile, ref) {
  let candidate = null;
  if (ref.startsWith('/styles/')) {
    candidate = path.join(ROOT, ref.slice(1));
  } else if (ref.startsWith('.')) {
    candidate = path.resolve(path.dirname(fromFile), ref);
  }
  if (!candidate || !candidate.startsWith(`${STYLE_ROOT}${path.sep}`)) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

function collectReachableRootStyles(entryFiles) {
  const reachable = new Set();
  const visited = new Set();
  const queue = entryFiles.slice();
  while (queue.length) {
    const file = queue.pop();
    if (!file || visited.has(file) || !fs.existsSync(file)) continue;
    visited.add(file);
    if (file.startsWith(`${STYLE_ROOT}${path.sep}`)) reachable.add(file);
    for (const ref of extractStyleImports(file)) {
      const resolved = resolveRootStyle(file, ref);
      if (resolved) queue.push(resolved);
    }
  }
  return reachable;
}

const mainStyleEntries = [
  path.join(ROOT, 'app.wxss'),
  ...walk(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.wxss')),
  ...walk(path.join(ROOT, 'components')).filter((f) => f.endsWith('.wxss')),
  ...walk(path.join(ROOT, 'custom-tab-bar')).filter((f) => f.endsWith('.wxss')),
];
const mainStyles = collectReachableRootStyles(mainStyleEntries);
const packageStyleUsage = {};
for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
  const entries = walk(path.join(ROOT, packageName))
    .filter((f) => f.endsWith('.wxss') && !f.includes(`${path.sep}styles${path.sep}`));
  packageStyleUsage[packageName] = collectReachableRootStyles(entries);
}

const movableStyles = new Set();
for (const styles of Object.values(packageStyleUsage)) {
  for (const style of styles) {
    if (!mainStyles.has(style)) movableStyles.add(style);
  }
}

function rewriteStyleSource(sourceFile, source, packageName) {
  return source.replace(/@import\s+(['"])([^'"]+)\1\s*;/g, (full, quote, ref) => {
    const resolved = resolveRootStyle(sourceFile, ref);
    if (!resolved || !movableStyles.has(resolved)) return full;
    return `@import '${`/${packageName}/styles/${path.basename(resolved)}`}';`;
  });
}

for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
  const used = packageStyleUsage[packageName];
  const targetStyleDir = path.join(ROOT, packageName, 'styles');
  ensureDir(targetStyleDir);
  for (const sourceStyle of used) {
    if (!movableStyles.has(sourceStyle)) continue;
    const target = path.join(targetStyleDir, path.basename(sourceStyle));
    if (DRY_RUN) {
      console.log('[dry-run] copy style', path.relative(ROOT, sourceStyle), '->', path.relative(ROOT, target));
    } else {
      const source = fs.readFileSync(sourceStyle, 'utf8');
      fs.writeFileSync(target, rewriteStyleSource(sourceStyle, source, packageName), 'utf8');
    }
  }
  for (const wxss of walk(path.join(ROOT, packageName)).filter(
    (f) => f.endsWith('.wxss') && !f.includes(`${path.sep}styles${path.sep}`),
  )) {
    if (!fs.existsSync(wxss)) continue;
    const source = fs.readFileSync(wxss, 'utf8');
    const next = rewriteStyleSource(wxss, source, packageName);
    if (next === source) continue;
    if (DRY_RUN) console.log('[dry-run] patch style import', path.relative(ROOT, wxss));
    else fs.writeFileSync(wxss, next, 'utf8');
  }
}
for (const style of movableStyles) removePath(style);

// 6. 修复复制组件 / 既有分包样式因目录加深产生的相对路径偏移。
for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
  for (const wxss of walk(path.join(ROOT, packageName)).filter((f) => f.endsWith('.wxss'))) {
    let source = fs.readFileSync(wxss, 'utf8');
    let changed = false;
    source = source.replace(/@import\s+(['"])([^'"]+)\1\s*;/g, (full, quote, ref) => {
      let resolved;
      if (ref.startsWith('/')) resolved = path.join(ROOT, ref.slice(1));
      else resolved = path.resolve(path.dirname(wxss), ref);
      if (fs.existsSync(resolved)) return full;

      const componentMatch = ref.match(/(?:^|\/)components\/([^/]+)\/([^/]+\.wxss)$/);
      if (componentMatch) {
        const componentCandidate = path.join(
          ROOT,
          packageName,
          'components',
          componentMatch[1],
          componentMatch[2],
        );
        if (fs.existsSync(componentCandidate)) {
          changed = true;
          return `@import '/${packageName}/components/${componentMatch[1]}/${componentMatch[2]}';`;
        }
      }

      const basename = path.basename(ref);
      const packageCandidate = path.join(ROOT, packageName, 'styles', basename);
      const mainCandidate = path.join(ROOT, 'styles', basename);
      if (fs.existsSync(packageCandidate)) {
        changed = true;
        return `@import '/${packageName}/styles/${basename}';`;
      }
      if (fs.existsSync(mainCandidate)) {
        changed = true;
        return `@import '/styles/${basename}';`;
      }
      return full;
    });
    if (!changed) continue;
    if (DRY_RUN) console.log('[dry-run] repair style import', path.relative(ROOT, wxss));
    else fs.writeFileSync(wxss, source, 'utf8');
  }
}

// 7. 校验改写后的绝对组件路径与所有样式路径都真实存在。
if (!DRY_RUN) {
  const missing = [];
  for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
    for (const jsonFile of walk(path.join(ROOT, packageName)).filter((f) => f.endsWith('.json'))) {
      let json;
      try {
        json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      } catch {
        continue;
      }
      for (const value of Object.values(json.usingComponents || {})) {
        if (typeof value !== 'string' || !value.startsWith(`/${packageName}/components/`)) continue;
        const jsPath = path.join(ROOT, `${value.slice(1)}.js`);
        if (!fs.existsSync(jsPath)) missing.push(`${path.relative(ROOT, jsonFile)} -> ${value}`);
      }
    }
  }
  for (const packageName of ['packageBusiness', 'packagePsi', 'packageFinance']) {
    for (const wxss of walk(path.join(ROOT, packageName)).filter((f) => f.endsWith('.wxss'))) {
      for (const ref of extractStyleImports(wxss)) {
        const target = ref.startsWith('/')
          ? path.join(ROOT, ref.slice(1))
          : path.resolve(path.dirname(wxss), ref);
        if (!fs.existsSync(target)) {
          missing.push(`${path.relative(ROOT, wxss)} -> ${ref}`);
        }
      }
    }
  }
  for (const jsFile of walk(ROOT).filter(
    (f) => f.endsWith('.js') && !f.includes(`${path.sep}scripts${path.sep}`),
  )) {
    const source = fs.readFileSync(jsFile, 'utf8');
    const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const base = path.resolve(path.dirname(jsFile), match[1]);
      const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        missing.push(`${path.relative(ROOT, jsFile)} -> require('${match[1]}')`);
      }
    }
  }
  if (missing.length) throw new Error(`组件或样式路径不存在：\n${missing.join('\n')}`);
}

console.log('main package optimization complete', DRY_RUN ? '(dry-run)' : '');
