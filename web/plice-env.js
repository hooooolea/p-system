/**
/**
 * 须在其它访问 /api 的脚本之前加载。
 * 换 tunnel 时只需更新 PLICE_BACKEND_URL 环境变量（或等自动同步）。
 *
 * 注意：trycloudflare 隧道 URL 仅供演示，正式部署请替换为稳定域名！
 */
(function () {
  // 从 CF Worker 获取当前 tunnel URL（/api/tunnel-url 由 router.mjs 返回 PLICE_BACKEND_URL）
  const TUNNEL_FETCH_TIMEOUT = 3000;

  function looksLikeStaticPagesHost(hostname) {
    const h = String(hostname || "").toLowerCase();
    // workers.dev 上的页面走 CF Worker 同源代理，不需要 tunnel URL
    return h.endsWith(".pages.dev") || h === "pages.dev" || h.endsWith(".github.io") || (h.endsWith(".workers.dev") && h !== "workers.dev");
  }

  if (typeof window !== "undefined" && !window.PLICE_API_ORIGIN) {
    try {
      const pageOrigin = window.location.origin.replace(/\/$/, "");
      const h = window.location.hostname;
      if (looksLikeStaticPagesHost(h)) {
        // 不再从 /api/tunnel-url 获取 tunnel URL；
        // 所有 API 走 CF Worker 同源代理（/api/* 被 router.mjs 全局反向代理），
        // 浏览器始终用相对路径，无 CORS 问题。
        window.PLICE_API_ORIGIN = ""; // 空字符串 → pliceResolveApiUrl 返回相对路径
      }
    } catch (e) {
      /* ignore */
    }
  }

  window.pliceResolveApiUrl = function (path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const raw =
      typeof window !== "undefined" && window.PLICE_API_ORIGIN ? String(window.PLICE_API_ORIGIN).trim() : "";
    const base = raw.replace(/\/$/, "");
    return base ? `${base}${p}` : p;
  };
})();
