/**
 * 将 @babel/runtime 复制到 miniprogram_npm，并写入微信构建 npm 所需的 package.json。
 * 仅在 project.config.json 开启 es6 转 ES5 时需要；默认已关闭 es6 转译。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules/@babel/runtime');
const dest = path.join(root, 'miniprogram_npm/@babel/runtime');

if (!fs.existsSync(src)) {
  console.error('请先执行: cd miniprogram && npm install');
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

fs.rmSync(path.join(root, 'miniprogram_npm/@babel'), { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
copyDir(src, dest);

const version = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
const wxPkg = {
  name: '@babel/runtime',
  version,
  miniprogram: '.',
};
fs.writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(wxPkg, null, 2)}\n`);
console.log(`miniprogram_npm/@babel/runtime@${version} ready`);
