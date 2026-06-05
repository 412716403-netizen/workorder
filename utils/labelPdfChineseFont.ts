import type { jsPDF } from 'jspdf';

const LABEL_PDF_FONT_NORMAL_URLS = [
  'https://cdn.jsdelivr.net/gh/dolbydu/font@master/unicode/SimHei.ttf',
  'https://fastly.jsdelivr.net/gh/dolbydu/font@master/unicode/SimHei.ttf',
] as const;

/** SimHei 无独立 Bold 文件；粗体使用同仓库的 Microsoft Yahei Bold */
const LABEL_PDF_FONT_BOLD_URLS = [
  'https://cdn.jsdelivr.net/gh/dolbydu/font@master/unicode/Microsoft%20Yahei%20Bold.ttf',
  'https://fastly.jsdelivr.net/gh/dolbydu/font@master/unicode/Microsoft%20Yahei%20Bold.ttf',
] as const;

const LABEL_PDF_FONT_NORMAL_FILE = 'SimHei.ttf';
const LABEL_PDF_FONT_BOLD_FILE = 'YaheiBold.ttf';
export const LABEL_PDF_FONT_NAME = 'LabelZh';

let cachedNormalBase64: string | null = null;
let cachedBoldBase64: string | null = null;
let normalLoadPromise: Promise<string> | null = null;
let boldLoadPromise: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('字体读取失败'));
          return;
        }
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('字体读取失败'));
      reader.readAsDataURL(new Blob([buffer]));
    });
  }
  const bytes = new Uint8Array(buffer);
  const chunk = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return Promise.resolve(btoa(binary));
}

async function fetchFontBase64(urls: readonly string[], label: string): Promise<string> {
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 1024) {
        throw new Error('字体文件无效');
      }
      return await arrayBufferToBase64(buf);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`${label}加载失败，请检查网络后重试${lastErr?.message ? `（${lastErr.message}）` : ''}`);
}

async function loadNormalFontBase64(): Promise<string> {
  if (cachedNormalBase64) return cachedNormalBase64;
  if (!normalLoadPromise) {
    normalLoadPromise = fetchFontBase64(LABEL_PDF_FONT_NORMAL_URLS, '常规中文字体').then(b64 => {
      cachedNormalBase64 = b64;
      return b64;
    });
  }
  return normalLoadPromise;
}

async function loadBoldFontBase64(): Promise<string> {
  if (cachedBoldBase64) return cachedBoldBase64;
  if (!boldLoadPromise) {
    boldLoadPromise = fetchFontBase64(LABEL_PDF_FONT_BOLD_URLS, '粗体中文字体').then(b64 => {
      cachedBoldBase64 = b64;
      return b64;
    });
  }
  return boldLoadPromise;
}

/** 预加载常规 + 粗体字体（可与二维码生成并行） */
export function preloadLabelPdfChineseFont(): Promise<void> {
  return Promise.all([loadNormalFontBase64(), loadBoldFontBase64()]).then(() => undefined);
}

/** 向 jsPDF 实例注册并激活中文字体（同一 doc 调用一次即可） */
export async function applyLabelPdfChineseFont(doc: jsPDF): Promise<void> {
  const [normalB64, boldB64] = await Promise.all([loadNormalFontBase64(), loadBoldFontBase64()]);
  doc.addFileToVFS(LABEL_PDF_FONT_NORMAL_FILE, normalB64);
  doc.addFileToVFS(LABEL_PDF_FONT_BOLD_FILE, boldB64);
  doc.addFont(LABEL_PDF_FONT_NORMAL_FILE, LABEL_PDF_FONT_NAME, 'normal');
  doc.addFont(LABEL_PDF_FONT_BOLD_FILE, LABEL_PDF_FONT_NAME, 'bold');
  doc.setFont(LABEL_PDF_FONT_NAME, 'normal');
}
