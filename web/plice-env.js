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
    return h.endsWith(".pages.dev") || h === "pages.dev" || h.endsWith(".github.io") || h.endsWith(".workers.dev");
  }

  if (typeof window !== "undefined" && !window.PLICE_API_ORIGIN) {
    try {
      const pageOrigin = window.location.origin.replace(/\/$/, "");
      const h = window.location.hostname;
      if (looksLikeStaticPagesHost(h)) {
        // 先尝试从 CF Worker 获取 tunnel URL
        fetch(`${pageOrigin}/api/tunnel-url`, { signal: AbortSignal.timeout(TUNNEL_FETCH_TIMEOUT) })
          .then(r => r.ok ? r.text() : null)
          .then(url => {
            if (url) {
              window.PLICE_API_ORIGIN = url.replace(/\/$/, "");
            }
          })
          .catch(() => { /* ignore */ });
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
