#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = [
  'formStandardControlClass',
  'formStandardControlIconClass',
  'formStandardTextareaClass',
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', 'dist', 'print-editor'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let n = 0;
for (const file of [...walk(path.join(root, 'views')), ...walk(path.join(root, 'components'))]) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const t of TOKENS) {
    const re = new RegExp(
      `(className|controlClassName|inputClassName)=\\{${t}\\}\\s+([^\\n>]+)`,
      'g',
    );
    c = c.replace(re, (_, attr, extras) => `${attr}={\`\${${t}} ${extras.trim()}\`}`);
  }
  if (c !== orig) {
    fs.writeFileSync(file, c);
    n++;
    console.log(path.relative(root, file));
  }
}
console.log(`Fixed ${n} files`);
