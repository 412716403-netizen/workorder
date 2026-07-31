/** 从微信推送的简易 XML 中提取 CDATA / 纯文本字段（不引入 XML 解析依赖） */
export function parseWechatXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!xml || typeof xml !== 'string') return out;
  const re = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1];
    if (!key || key === 'xml') continue;
    out[key] = (m[2] ?? m[3] ?? '').trim();
  }
  return out;
}

export function extractBindScene(eventKey: string | undefined): string | null {
  if (!eventKey) return null;
  const raw = eventKey.trim();
  if (!raw) return null;
  if (raw.startsWith('qrscene_')) {
    const scene = raw.slice('qrscene_'.length).trim();
    return scene || null;
  }
  return raw;
}
