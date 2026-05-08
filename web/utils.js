/**
 * 警擎前端公共工具函数
 * 所有页面共享，请确保在其他脚本之前加载
 */

/**
 * HTML转义，防止XSS
 */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

/**
 * 获取API地址（兼容环境变量注入）
 */
function pliceApiUrl(path) {
  if (typeof window !== "undefined" && typeof window.pliceResolveApiUrl === "function") {
    return window.pliceResolveApiUrl(path);
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  const raw =
    typeof window !== "undefined" && window.PLICE_API_ORIGIN ? String(window.PLICE_API_ORIGIN).trim() : "";
  const base = raw.replace(/\/$/, "");
  return base ? `${base}${p}` : p;
}

/**
 * 风险等级对应的CSS类名
 */
function riskClass(risk) {
  if (risk === "低") return "risk-low";
  if (risk === "中") return "risk-mid";
  if (risk === "高") return "risk-high";
  if (risk === "紧急") return "risk-critical";
  return "";
}

/**
 * 统一设置元素文本（支持id或直接传元素）
 */
function setText(idOrEl, text) {
  const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
  if (el) el.textContent = text || "";
}

/**
 * 带超时的fetch封装
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs 默认15000ms
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`请求超时（${timeoutMs / 1000}秒）`);
    }
    throw err;
  }
}

/**
 * 统一的API调用（带超时）
 */
async function callApi(path, options = {}) {
  const url = pliceApiUrl(path);
  const res = await fetchWithTimeout(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

/**
 * 统一的API调用（无超时，用于可能长时间运行的请求）
 */
async function callApiNoTimeout(path, options = {}) {
  const url = pliceApiUrl(path);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
