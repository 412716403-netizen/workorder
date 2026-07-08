/**
 * 将 ?. / ?? / 数组解构 转为 loose ES5 写法（不依赖 @babel/runtime），便于 es6:false + minified:true。
 * 用法：node scripts/compat-modern-syntax.js
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'miniprogram_npm', 'scripts', '__debug__']);

const PLUGINS = [
  ['@babel/plugin-transform-optional-chaining', { loose: true }],
  ['@babel/plugin-transform-nullish-coalescing-operator', { loose: true }],
  ['@babel/plugin-transform-destructuring', { loose: true, arrayLikeIsIterable: true }],
];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (SKIP_DIRS.has(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      return;
    }
    if (entry.name.endsWith('.js')) out.push(full);
  });
}

function needsTransform(code) {
  return (
    code.includes('?.')
    || code.includes('??')
    || /\bconst\s*\[/.test(code)
    || /\blet\s*\[/.test(code)
    || /\bvar\s*\[/.test(code)
    || /\.then\(\(\[/.test(code)
    || /await\s+Promise\.all\([\s\S]*?\)\s*;?\s*\n[\s\S]*?\bconst\s*\[/.test(code)
  );
}

function transformFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  if (!needsTransform(code)) return false;
  const result = babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: PLUGINS,
    retainLines: true,
    compact: false,
  });
  if (!result || !result.code || result.code === code) return false;
  fs.writeFileSync(file, result.code);
  return true;
}

function main() {
  const files = [];
  ['pages', 'components', 'utils', 'config', 'packageBusiness'].forEach((dir) => {
    const full = path.join(ROOT, dir);
    if (fs.existsSync(full)) walk(full, files);
  });
  let changed = 0;
  files.forEach((file) => {
    if (transformFile(file)) {
      changed += 1;
      console.log('updated', path.relative(ROOT, file));
    }
  });
  console.log(`done, ${changed} file(s) updated`);
}

main();
