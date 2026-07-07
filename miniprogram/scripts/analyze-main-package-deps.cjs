/**
 * 分析主包可达的 JS 文件（pages + 主包页注册的 components 递归 require）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
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
  const candidates = [
    base,
    `${base}.js`,
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
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

const visited = new Set();
const queue = [
  path.join(ROOT, 'app.js'),
  ...MAIN_PAGES.map((p) => `${p}.js`),
];

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

const allUtils = fs.readdirSync(path.join(ROOT, 'utils')).filter((f) => f.endsWith('.js'));
const allConfig = fs.readdirSync(path.join(ROOT, 'config')).filter((f) => f.endsWith('.js'));

function isVisited(relPath) {
  const abs = path.join(ROOT, relPath);
  return visited.has(abs);
}

const unusedUtils = allUtils.filter((f) => !isVisited(`utils/${f}`));
const unusedConfig = allConfig.filter((f) => !isVisited(`config/${f}`));

console.log('=== Main package reachable JS count:', visited.size);
console.log('\n=== Unused utils (' + unusedUtils.length + ') ===');
unusedUtils.sort().forEach((f) => console.log('utils/' + f));
console.log('\n=== Unused config (' + unusedConfig.length + ') ===');
unusedConfig.sort().forEach((f) => console.log('config/' + f));
