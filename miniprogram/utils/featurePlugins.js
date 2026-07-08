const { fetchFeaturePlugins } = require('./financeApi.js');
const { isTraceabilityEnabled } = require('./productionConfig.js');

/** @type {Record<string, boolean> | null} */
let cachedPlugins = null;
/** @type {Promise<Record<string, boolean>> | null} */
let cachePromise = null;

function isPluginEnabled(plugins, pluginId) {
  if (!pluginId) return true;
  if (!plugins || typeof plugins !== 'object') return true;
  return plugins[pluginId] !== false;
}

function filterByPlugin(items, plugins) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => isPluginEnabled(plugins, item.pluginId));
}

/**
 * 加载租户 featurePlugins（与 Web parseFeaturePlugins 语义一致：仅 explicit false 为关）
 * @param {boolean} [forceRefresh]
 */
function loadFeaturePlugins(forceRefresh) {
  if (!forceRefresh && cachedPlugins) {
    return Promise.resolve(cachedPlugins);
  }
  if (!forceRefresh && cachePromise) {
    return cachePromise;
  }
  cachePromise = fetchFeaturePlugins()
    .then((raw) => {
      cachedPlugins = raw && typeof raw === 'object' ? raw : {};
      return cachedPlugins;
    })
    .catch(() => {
      cachedPlugins = {};
      return cachedPlugins;
    })
    .finally(() => {
      cachePromise = null;
    });
  return cachePromise;
}

function clearFeaturePluginsCache() {
  cachedPlugins = null;
  cachePromise = null;
}

function loadTraceabilityScanEnabled(forceRefresh) {
  return loadFeaturePlugins(forceRefresh).then(isTraceabilityEnabled);
}

module.exports = {
  isPluginEnabled,
  isTraceabilityEnabled,
  filterByPlugin,
  loadFeaturePlugins,
  loadTraceabilityScanEnabled,
  clearFeaturePluginsCache,
};
