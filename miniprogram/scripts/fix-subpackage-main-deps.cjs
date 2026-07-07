#!/usr/bin/env node
/** 修复分包 utils 中对主包 utils/config 的错误相对路径 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_UTILS = new Set(
  fs.readdirSync(path.join(ROOT, 'utils')).filter((f) => f.endsWith('.js')),
);
const MAIN_CONFIG = new Set(
  fs.readdirSync(path.join(ROOT, 'config')).filter((f) => f.endsWith('.js')),
);

function walkDir(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkDir(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function resolveLocal(fromFile, req) {
  if (!req.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), req);
  for (const c of [`${base}.js`, base, path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const targets = walkDir(path.join(ROOT, 'packageBusiness'));
let fixed = 0;

for (const file of targets) {
  let src = fs.readFileSync(file, 'utf8');
  const re = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  let next = src;
  const replacements = [];

  while ((m = re.exec(src)) !== null) {
    const req = m[1];
    const baseName = path.basename(req, '.js');
    if (resolveLocal(file, req)) continue;

    if (MAIN_UTILS.has(`${baseName}.js`)) {
      replacements.push([m[0], `require('../../utils/${baseName}.js')`]);
    } else if (MAIN_CONFIG.has(`${baseName}.js`)) {
      replacements.push([m[0], `require('../../config/${baseName}.js')`]);
    }
  }

  for (const [from, to] of replacements) {
    if (next.includes(from)) {
      next = next.split(from).join(to);
      fixed += 1;
    }
  }

  if (next !== src) fs.writeFileSync(file, next, 'utf8');
}

console.log('Fixed', fixed, 'require paths');
