import { useFeaturePlugins } from './useFeaturePlugins';

/** 追溯码插件：控制追溯页、扫码累加与扫码称重校验（不含工序「报工时记录重量」设置） */
export function useTraceabilityPlugin() {
  const { isPluginEnabled } = useFeaturePlugins();
  const enabled = isPluginEnabled('traceability');
  return {
    traceEnabled: enabled,
    /** 扫码累加依赖单品码/批次码 */
    scanEnabled: enabled,
    /** 扫码会话中的秤读数比对、容差、单件标准重量等 */
    weightEnabled: enabled,
  };
}
