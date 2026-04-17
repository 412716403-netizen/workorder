/**
 * 打印模版多标签页同步通道
 * =================================================================
 *
 * 背景
 *   打印模版保存在后端 `SystemSetting.printTemplates`，但前端多处做了本地缓存
 *   （AppDataContext.printTemplates，以及各 FormConfigModal 的草稿）。当用户在
 *   标签 A 的「打印模版编辑器」保存后，标签 B 的缓存仍然是旧的，会出现：
 *     - 打印预览字段丢失 / 旧字段名
 *     - FormConfigModal 的「可用模版白名单」不显示新模版
 *     - 直接打印时以旧模版渲染
 *
 * 方案
 *   用 BroadcastChannel 在同源多标签页间广播一个 `{ type: 'updated' }`
 *   轻量消息（只传 senderTabId，不传数据），订阅方收到后主动调一次
 *   `api.settings.getConfig('printTemplates')` 拉最新。不用 storage 事件是因为：
 *     - storage 事件只在 localStorage 变化时触发，强耦合持久化
 *     - BroadcastChannel 语义更清晰，浏览器兼容面足够（非 BC 环境下降级为 no-op）
 *
 * 语义
 *   - broadcastPrintTemplatesSaved：保存成功后「我通知别人」
 *   - subscribePrintTemplatesChanged：订阅「别人通知我」；会过滤掉同 tabId，
 *     防止本标签发出的广播回到自身造成无意义的重拉
 *
 * 失败降级
 *   - 不支持 BroadcastChannel：getChannel() 返回 null，广播/订阅均 no-op，
 *     不影响主流程，用户只是拿不到跨标签实时刷新
 *   - postMessage 抛异常：吞掉，主流程继续
 */

const CHANNEL_NAME = 'smarttrack-pro-print-templates-v1';

export type PrintTemplatesCrossTabMessage = { type: 'updated'; senderTabId: string };

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === null) return null;
  if (typeof BroadcastChannel === 'undefined') {
    channel = null;
    return null;
  }
  if (channel === undefined) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

/** 当前标签保存打印模版成功后调用，通知其他标签刷新 */
export function broadcastPrintTemplatesSaved(senderTabId: string): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'updated', senderTabId } satisfies PrintTemplatesCrossTabMessage);
  } catch {
    // ignore
  }
}

/** 在其他标签更新了打印模版时回调（不含本标签发出的广播） */
export function subscribePrintTemplatesChanged(onRemoteUpdate: (senderTabId: string) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent<PrintTemplatesCrossTabMessage>) => {
    const d = ev?.data;
    if (d?.type === 'updated' && typeof d.senderTabId === 'string') onRemoteUpdate(d.senderTabId);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
