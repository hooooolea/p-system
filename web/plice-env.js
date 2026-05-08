/**
 * 须在其它访问 /api 的脚本之前加载。
 * 换 trycloudflare 隧道时：只改下面 DEFAULT_REMOTE_API；或在加载本文件之前执行 window.PLICE_API_ORIGIN = "…".
 *
 * 注意：trycloudflare 隧道 URL 仅供演示，正式部署请替换为稳定域名！
 */
(function () {
  const DEFAULT_REMOTE_API = "https://score-martin-thumbnail-slowly.trycloudflare.com".replace(/\/$/, "");

  function looksLikeStaticPagesHost(hostname) {
    const h = String(hostname || "").toLowerCase();
    return h.endsWith(".pages.dev") || h === "pages.dev" || h.endsWith(".github.io");
  }

  if (typeof window !== "undefined" && !window.PLICE_API_ORIGIN) {
    try {
      const pageOrigin = window.location.origin.replace(/\/$/, "");
      if (DEFAULT_REMOTE_API && pageOrigin !== DEFAULT_REMOTE_API) {
        const h = window.location.hostname;
        if (looksLikeStaticPagesHost(h)) {
          window.PLICE_API_ORIGIN = DEFAULT_REMOTE_API;
          // 提醒：trycloudflare 隧道 URL 每次重启后会变化
          console.warn("[警擎] 当前使用临时隧道 API 地址，重启后需更新 plice-env.js 中的 DEFAULT_REMOTE_API");
        }
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
