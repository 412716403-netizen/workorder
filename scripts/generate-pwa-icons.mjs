/**
 * 从 public/wanpu-logo.png 生成 PWA 方形图标（192 / 512）。
 * 需本机 Python3 + Pillow：`pip install Pillow`
 * 用法：node scripts/generate-pwa-icons.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = `
from PIL import Image
src = 'public/wanpu-logo.png'
img = Image.open(src).convert('RGBA')
# 留边距防裁切；0.15 较 0.22 更大且云朵仍完整
PADDING_RATIO = 0.15
for size in (192, 512):
    canvas = Image.new('RGBA', (size, size), (241, 245, 249, 255))
    inner = int(size * (1 - 2 * PADDING_RATIO))
    ratio = min(inner / img.width, inner / img.height)
    nw, nh = int(img.width * ratio), int(img.height * ratio)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    out = f'public/icons/icon-{size}.png'
    canvas.convert('RGB').save(out, 'PNG')
    print('wrote', out)
`;

const r = spawnSync('python3', ['-c', py], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
