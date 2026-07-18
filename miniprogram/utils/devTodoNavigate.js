/**
 * 将 Web 待办 href（如 /development?styleId=&devStageId=）转为小程序详情页路径。
 * @returns {string|null}
 */
function resolveDevTodoMiniPath(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  if (pathPart.indexOf('development') < 0) {
    return null;
  }
  const params = {};
  query.split('&').forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : '';
    if (!k) return;
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    } catch {
      params[k] = v || '';
    }
  });
  const styleId = params.styleId || '';
  if (!styleId) return null;
  const qs = [`styleId=${encodeURIComponent(styleId)}`];
  if (params.devStageId) qs.push(`devStageId=${encodeURIComponent(params.devStageId)}`);
  if (params.devSampleId) {
    qs.push(`devSampleId=${encodeURIComponent(params.devSampleId)}`);
    qs.push('openBom=1');
  }
  return `/packageBusiness/development-style-detail/development-style-detail?${qs.join('&')}`;
}

module.exports = {
  resolveDevTodoMiniPath,
};
