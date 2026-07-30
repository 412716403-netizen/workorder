const { request } = require('../../utils/request.js');

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function listDevStyles(params) {
  const qs = buildQs(params || {});
  return request({ path: `/dev/styles${qs}`, method: 'GET' }).then((body) =>
    Array.isArray(body) ? body : [],
  );
}

function getDevStyle(id) {
  if (!id) return Promise.resolve(null);
  return request({
    path: `/dev/styles/${encodeURIComponent(id)}`,
    method: 'GET',
  });
}

function createDevStyle(data) {
  return request({
    path: '/dev/styles',
    method: 'POST',
    data,
  });
}

function updateDevStyle(id, data) {
  return request({
    path: `/dev/styles/${encodeURIComponent(id)}`,
    method: 'PUT',
    data,
  });
}

function deleteDevStyle(id) {
  return request({
    path: `/dev/styles/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

function publishDevStyle(id) {
  return request({
    path: `/dev/styles/${encodeURIComponent(id)}/publish`,
    method: 'POST',
  });
}

function addDevSample(styleId, data) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/samples`,
    method: 'POST',
    data: data || {},
  });
}

function deleteDevSample(sampleId) {
  return request({
    path: `/dev/styles/samples/${encodeURIComponent(sampleId)}`,
    method: 'DELETE',
  });
}

function updateDevStage(stageId, data) {
  return request({
    path: `/dev/styles/stages/${encodeURIComponent(stageId)}`,
    method: 'PUT',
    data: data || {},
  });
}

function syncVariantNodeBoms(styleId, variantId, nodeBoms) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/variants/${encodeURIComponent(variantId)}/node-boms`,
    method: 'PUT',
    data: { nodeBoms: nodeBoms || {} },
  });
}

function listDevBoms(params) {
  const qs = buildQs({ all: 'true', ...(params || {}) });
  return request({ path: `/dev/styles/boms/all${qs}`, method: 'GET' }).then((body) =>
    Array.isArray(body) ? body : [],
  );
}

function getDevBom(id) {
  if (!id) return Promise.resolve(null);
  return request({
    path: `/dev/styles/boms/${encodeURIComponent(id)}`,
    method: 'GET',
  });
}

function createDevBom(data) {
  return request({
    path: '/dev/styles/boms',
    method: 'POST',
    data,
  });
}

function updateDevBom(id, data) {
  return request({
    path: `/dev/styles/boms/${encodeURIComponent(id)}`,
    method: 'PUT',
    data,
  });
}

function deleteDevBom(id) {
  return request({
    path: `/dev/styles/boms/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

function listDevStageTemplates() {
  return request({ path: '/dev/stage-templates', method: 'GET' }).then((body) =>
    Array.isArray(body) ? body : [],
  );
}

function createDevStageTemplate(data) {
  return request({
    path: '/dev/stage-templates',
    method: 'POST',
    data,
  });
}

function updateDevStageTemplate(id, data) {
  return request({
    path: `/dev/stage-templates/${encodeURIComponent(id)}`,
    method: 'PUT',
    data,
  });
}

function deleteDevStageTemplate(id) {
  return request({
    path: `/dev/stage-templates/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

function listDevMaterialRecords(styleId) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/material-records`,
    method: 'GET',
  });
}

function createDevMaterialIssueBatch(styleId, body) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/material-issues/batch`,
    method: 'POST',
    data: body,
  });
}

function createDevMaterialReturnBatch(styleId, body) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/material-returns/batch`,
    method: 'POST',
    data: body,
  });
}

function updateDevMaterialDoc(styleId, docNo, body) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/material-docs/${encodeURIComponent(docNo)}`,
    method: 'PUT',
    data: body,
  });
}

function deleteDevMaterialDoc(styleId, docNo) {
  return request({
    path: `/dev/styles/${encodeURIComponent(styleId)}/material-docs/${encodeURIComponent(docNo)}`,
    method: 'DELETE',
  });
}

module.exports = {
  listDevStyles,
  getDevStyle,
  createDevStyle,
  updateDevStyle,
  deleteDevStyle,
  publishDevStyle,
  addDevSample,
  deleteDevSample,
  updateDevStage,
  syncVariantNodeBoms,
  listDevBoms,
  getDevBom,
  createDevBom,
  updateDevBom,
  deleteDevBom,
  listDevStageTemplates,
  createDevStageTemplate,
  updateDevStageTemplate,
  deleteDevStageTemplate,
  listDevMaterialRecords,
  createDevMaterialIssueBatch,
  createDevMaterialReturnBatch,
  updateDevMaterialDoc,
  deleteDevMaterialDoc,
};
