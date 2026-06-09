/**
 * 「资料库」类型自定义字段（CustomDocFieldType='knowledge'）的存值编解码。
 *
 * 存储格式：JSON 字符串 `{"id":"<docId>","title":"<文档标题快照>"}`。
 * title 仅作离线/列表展示用的快照；点击查看时仍以 id 为准从资料库实时读取。
 */

export interface KnowledgeFieldRef {
  id: string;
  title: string;
}

/** 解析存值；非法/空值返回 null */
export function parseKnowledgeFieldValue(raw: unknown): KnowledgeFieldRef | null {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id) {
      return { id: obj.id, title: typeof obj.title === 'string' ? obj.title : '' };
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>;
      if (typeof obj.id === 'string' && obj.id) {
        return { id: obj.id, title: typeof obj.title === 'string' ? obj.title : '' };
      }
    } catch {
      return null;
    }
    return null;
  }
  // 兼容仅存了 docId 的旧格式
  return { id: s, title: '' };
}

export function stringifyKnowledgeFieldValue(ref: KnowledgeFieldRef | null): string {
  if (!ref || !ref.id) return '';
  return JSON.stringify({ id: ref.id, title: ref.title ?? '' });
}
