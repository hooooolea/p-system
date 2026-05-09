/**
 * 警擎 · API 调用层
 * 所有前端 JS 应调用此模块，而非直接 fetch。
 * 依赖：utils.js（pliceApiUrl / callApi / callApiNoTimeout）
 * 此文件必须在其他业务 JS 之前加载。
 */

/* ===== 研判记录 ===== */

/**
 * 获取研判历史列表
 * @param {number} limit
 * @returns {Promise<{history: Array}>}
 */
async function apiGetHistory(limit = 120) {
  return callApi(`/api/history?limit=${limit}`);
}

/**
 * 获取研判分析报告详情
 * @param {string} id - 分析ID
 * @returns {Promise<object>}
 */
async function apiGetPresentation(id) {
  return callApi(`/api/analysis-presentation/${encodeURIComponent(id)}`);
}

/**
 * 提交研判反馈
 * @param {string} id - 分析ID
 * @param {object} feedback - 反馈数据 {type: 'adopt'|'ignore', ...}
 * @returns {Promise<object>}
 */
async function apiSubmitFeedback(id, feedback) {
  return callApiNoTimeout(
    `/api/analysis-presentation/${encodeURIComponent(id)}/feedback`,
    { method: "POST", body: JSON.stringify(feedback), headers: { "Content-Type": "application/json" } }
  );
}

/* ===== 案件 ===== */

/**
 * 获取案件列表
 * @param {number} limit
 * @returns {Promise<{cases: Array}>}
 */
async function apiGetCases(limit = 120) {
  return callApi(`/api/cases?limit=${limit}`);
}

/**
 * 获取案件详情
 * @param {string} caseId
 * @returns {Promise<object>}
 */
async function apiGetCase(caseId) {
  return callApi(`/api/cases/${encodeURIComponent(caseId)}`);
}

/**
 * 更新案件状态
 * @param {string} caseId
 * @param {object} body - 如 {status: 'resolved'}
 * @returns {Promise<object>}
 */
async function apiPatchCase(caseId, body) {
  return callApi(
    `/api/cases/${encodeURIComponent(caseId)}`,
    { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
  );
}

/* ===== 地图 ===== */

/**
 * 获取地图事件
 * @param {object} params - {since, until, limit}
 * @returns {Promise<{events: Array}>}
 */
async function apiGetMapEvents(params = {}) {
  const qs = new URLSearchParams();
  if (params.since) qs.set("since", params.since);
  if (params.until) qs.set("until", params.until);
  if (params.limit) qs.set("limit", params.limit);
  return callApi(`/api/map-events?${qs.toString()}`);
}
