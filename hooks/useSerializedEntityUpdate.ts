import { useRef } from 'react';

/**
 * 串行化设置项更新，避免「先发后至」的旧请求覆盖新的扩展字段选项。
 * 对 customFields 类全量数组更新，始终提交该实体最新一份草稿。
 */
export function useSerializedEntityUpdate<TUpdates extends object>(
  persist: (id: string, updates: TUpdates) => Promise<void>,
) {
  const chainRef = useRef(Promise.resolve());
  const latestCustomFieldsRef = useRef<Map<string, unknown>>(new Map());

  return (id: string, updates: TUpdates) => {
    const u = updates as TUpdates & { customFields?: unknown; reportTemplate?: unknown; reportDisplayTemplate?: unknown };
    if (u.customFields !== undefined) latestCustomFieldsRef.current.set(`${id}:customFields`, u.customFields);
    if (u.reportTemplate !== undefined) latestCustomFieldsRef.current.set(`${id}:reportTemplate`, u.reportTemplate);
    if (u.reportDisplayTemplate !== undefined) {
      latestCustomFieldsRef.current.set(`${id}:reportDisplayTemplate`, u.reportDisplayTemplate);
    }

    chainRef.current = chainRef.current
      .catch(() => undefined)
      .then(async () => {
        const payload = { ...updates } as TUpdates & Record<string, unknown>;
        if ('customFields' in payload) {
          payload.customFields = latestCustomFieldsRef.current.get(`${id}:customFields`) ?? payload.customFields;
        }
        if ('reportTemplate' in payload) {
          payload.reportTemplate = latestCustomFieldsRef.current.get(`${id}:reportTemplate`) ?? payload.reportTemplate;
        }
        if ('reportDisplayTemplate' in payload) {
          payload.reportDisplayTemplate =
            latestCustomFieldsRef.current.get(`${id}:reportDisplayTemplate`) ?? payload.reportDisplayTemplate;
        }
        await persist(id, payload as TUpdates);
      });

    return chainRef.current;
  };
}
