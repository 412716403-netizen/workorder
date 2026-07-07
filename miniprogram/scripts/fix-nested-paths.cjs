const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(d, acc = []) {
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f, acc);
    else if (n.endsWith('.js')) acc.push(f);
  }
  return acc;
}

function patchDir(dir, patches) {
  let count = 0;
  for (const f of walk(dir)) {
    let s = fs.readFileSync(f, 'utf8');
    const o = s;
    for (const [from, to] of patches) s = s.split(from).join(to);
    if (s !== o) {
      fs.writeFileSync(f, s);
      count += 1;
    }
  }
  return count;
}

const a = patchDir(path.join(ROOT, 'packageBusiness/components'), [
  ["require('../utils/", "require('../../utils/"],
  ["require('../config/", "require('../../config/"],
]);

const b = patchDir(path.join(ROOT, 'packageBusiness/utils/scanHandlers'), [
  ["require('../../utils/", "require('../../../utils/"],
]);

console.log('components:', a, 'scanHandlers:', b);
