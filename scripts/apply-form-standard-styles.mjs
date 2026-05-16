#!/usr/bin/env node
/**
 * One-off: replace common inline form control/label classes with formStandard* tokens.
 * Skips PrintTemplateEditorView and print-editor/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const REPLACEMENTS = [
  [
    'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-lg py-2.5 px-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none',
    '{formStandardControlClass}',
  ],
  [
    'flex-1 bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none',
    '{formStandardControlClass} flex-1',
  ],
  [
    'w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all',
    '{formStandardControlClass}',
  ],
  [
    'text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1',
    '{formStandardLabelClass}',
  ],
  [
    'text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1',
    '{formStandardLabelClass}',
  ],
  [
    'text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest',
    '{formStandardLabelClass}',
  ],
  [
    'text-[10px] font-black text-slate-400 uppercase block ml-1 tracking-widest',
    '{formStandardLabelClass}',
  ],
  [
    'text-[10px] font-bold text-slate-400 uppercase',
    '{formStandardLabelClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] tabular-nums',
    '{formStandardControlClass} font-mono tabular-nums',
  ],
  [
    'w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer',
    '{formStandardControlClass} cursor-pointer',
  ],
  [
    'w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500',
    '{formStandardControlIconClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500',
    '{formStandardControlIconClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 resize-none',
    '{formStandardTextareaClass}',
  ],
  [
    'w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm',
    '{formStandardControlIconClass} bg-white pr-10 shadow-sm',
  ],
  [
    'w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between h-[52px]',
    '{formStandardControlClass} flex items-center justify-between',
  ],
  [
    'h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500',
    '{formStandardControlClass} bg-white',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]',
    '{formStandardControlClass}',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] disabled:opacity-60 disabled:cursor-not-allowed',
    '{formStandardControlClass} disabled:opacity-60 disabled:cursor-not-allowed',
  ],
  [
    'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] font-mono text-sm',
    '{formStandardControlClass} font-mono',
  ],
  [
    'w-full max-w-[200px] bg-slate-50 border-none rounded-xl py-3 px-4 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] tabular-nums',
    '{formStandardControlClass} max-w-[200px] font-mono tabular-nums',
  ],
  [
    'controlClassName="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]"',
    'controlClassName={formStandardControlClass}',
  ],
  [
    'controlClassName="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"',
    'controlClassName={formStandardControlClass}',
  ],
];

const SKIP_DIRS = ['print-editor', 'node_modules', 'dist'];
const SKIP_FILES = [
  'PrintTemplateEditorView.tsx',
  'apply-form-standard-styles.mjs',
  'fix-form-classname-syntax.mjs',
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.some(s => name === s)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function relImport(fromFile) {
  const dir = path.dirname(fromFile);
  let rel = path.relative(dir, path.join(root, 'styles/uiDensity')).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function ensureImport(content, fromFile) {
  if (content.includes('formStandardControlClass') || content.includes('formStandardLabelClass')) {
    if (!content.includes("from '../") && !content.includes('formStandard')) {
      // already uses token name in JSX but missing import — still add
    } else if (content.includes('styles/uiDensity')) return content;
  }
  const needsControl = content.includes('{formStandardControlClass}');
  const needsLabel = content.includes('{formStandardLabelClass}');
  const needsIcon = content.includes('{formStandardControlIconClass}');
  const needsTextarea = content.includes('{formStandardTextareaClass}');
  if (!needsControl && !needsLabel && !needsIcon && !needsTextarea) return content;

  const names = [];
  if (needsControl) names.push('formStandardControlClass');
  if (needsLabel) names.push('formStandardLabelClass');
  if (needsIcon) names.push('formStandardControlIconClass');
  if (needsTextarea) names.push('formStandardTextareaClass');
  const importLine = `import { ${names.join(', ')} } from '${relImport(fromFile)}';\n`;

  if (content.includes('styles/uiDensity')) {
    return content.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*styles\/uiDensity['"];/,
      (m, inner) => {
        const existing = inner.split(',').map(s => s.trim()).filter(Boolean);
        const merged = [...new Set([...existing, ...names])];
        return `import { ${merged.join(', ')} } from '${relImport(fromFile)}';`;
      },
    );
  }

  const lastImport = content.lastIndexOf('\nimport ');
  if (lastImport === -1) return importLine + content;
  const end = content.indexOf('\n', lastImport + 1);
  const insertAt = end === -1 ? content.length : end + 1;
  return content.slice(0, insertAt) + importLine + content.slice(insertAt);
}

function fixClassNameQuotes(content) {
  const tokens = [
    'formStandardControlClass',
    'formStandardLabelClass',
    'formStandardControlIconClass',
    'formStandardTextareaClass',
  ];
  let out = content;
  for (const t of tokens) {
    out = out.replace(new RegExp(`className="\\{${t}\\}([^"]*)"`, 'g'), 'className={`${' + t + '}$1`}');
    out = out.replace(new RegExp(`className="\\{${t}\\}"`, 'g'), `className={${t}}`);
    out = out.replace(new RegExp(`inputClassName="\\{${t}\\}([^"]*)"`, 'g'), 'inputClassName={`${' + t + '}$1`}');
    out = out.replace(new RegExp(`inputClassName="\\{${t}\\}"`, 'g'), `inputClassName={${t}}`);
  }
  return out;
}

let changed = 0;
for (const file of [...walk(path.join(root, 'views')), ...walk(path.join(root, 'components'))]) {
  if (SKIP_FILES.some(s => file.endsWith(s))) continue;
  if (file.includes('print-editor')) continue;
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  for (const [from, to] of REPLACEMENTS) {
    if (content.includes(from)) {
      content = content.split(`className="${from}"`).join(`className=${to}`);
      content = content.split(`inputClassName="${from}"`).join(`inputClassName={formStandardControlClass}`);
    }
  }
  content = fixClassNameQuotes(content);
  content = ensureImport(content, file);
  if (content !== orig) {
    fs.writeFileSync(file, content);
    changed++;
    console.log(path.relative(root, file));
  }
}
console.log(`Updated ${changed} files`);
