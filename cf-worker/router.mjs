/**
 * Cloudflare Workers：静态资源在 web/；将 Flask 同款的「无 .html」路径重写为真实文件。
 * 可选环境变量 PLICE_BACKEND_URL（Dashboard → Worker → 变量）：Flask 根 URL，无尾斜杠；
 * 设置后同源的 GET /api/map-events 会反向代理到该后端；未设置则返回空 events，避免静态站 404。
 * @param {Request} request
 * @param {{ ASSETS: Fetcher; PLICE_BACKEND_URL?: string }} env
 */

/** @type {Array<[string, string]>} 路径 → 静态文件名（均以 / 开头） */
const HTML_REWRITES = [
  ["/command-map", "/command-map.html"],
  ["/command-situation", "/command-situation.html"],
  ["/judgments", "/judgments.html"],
  ["/tech-route", "/tech-route.html"],
];

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);

    // 根路径：高版本 compatibility_date 下「导航请求」可能不经 Worker 直走静态层，
    // html_handling=none 时 / 不会自动落到 index.html → 404。此处显式取首页。
    if (pathname === "/" || pathname === "") {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url.toString(), request));
    }

    if (pathname === "/workbench/core-metrics" || pathname === "/workbench/review-dimensions") {
      return Response.redirect(new URL("/performance", request.url).toString(), 302);
    }
    if (pathname === "/workbench/core-metrics.js" || pathname === "/workbench/review-dimensions.js") {
      return Response.redirect(new URL("/performance.js", request.url).toString(), 302);
    }

    // 视频态势：代理到 Flask 后端（streams + events）
    if (pathname.startsWith("/api/video/streams") || pathname.startsWith("/api/video/events")) {
      const backend =
        typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim().replace(/\/$/, "") : "";
      if (backend) {
        const upstream = `${backend}${url.pathname}${url.search}`;
        return fetch(new Request(upstream, request), { redirect: "follow" });
      }
      return new Response(JSON.stringify({ error: "backend not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 研判记录 /api/history
    if (request.method === "GET" && pathname.startsWith("/api/history")) {
      const backend =
        typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim().replace(/\/$/, "") : "";
      if (backend) {
        const upstream = `${backend}${url.pathname}${url.search}`;
        return fetch(new Request(upstream, request), { redirect: "follow" });
      }
      return new Response(JSON.stringify({ history: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 地图页：前端默认请求同源 /api/map-events；静态 web 下无此文件 → 404。此处代理或返回空 JSON。
    if (request.method === "GET" && pathname.startsWith("/api/map-events")) {
      const backend =
        typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim().replace(/\/$/, "") : "";
      if (backend) {
        const upstream = `${backend}${url.pathname}${url.search}`;
        return fetch(upstream, { method: "GET", redirect: "follow" });
      }
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Plice-Map-Events": "stub-empty",
        },
      });
    }

    // 返回当前配置的 tunnel URL（供前端 plice-env.js 动态获取）
    if (request.method === "GET" && pathname === "/api/tunnel-url") {
      const backend = typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim() : "";
      return new Response(backend, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    // 工具带性能指标
    if (request.method === "GET" && pathname === "/api/performance") {
      const backend =
        typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim().replace(/\/$/, "") : "";
      if (backend) {
        const upstream = `${backend}${url.pathname}${url.search}`;
        return fetch(new Request(upstream, request), { redirect: "follow" });
      }
      return new Response(JSON.stringify({ total: 0, high: 0, medium: 0, low: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 研判分析
    if (request.method === "POST" && pathname === "/api/analyze") {
      const backend =
        typeof env.PLICE_BACKEND_URL === "string" ? env.PLICE_BACKEND_URL.trim().replace(/\/$/, "") : "";
      if (backend) {
        const upstream = `${backend}${url.pathname}${url.search}`;
        return fetch(new Request(upstream, request), { redirect: "follow" });
      }
      return new Response(JSON.stringify({ error: "backend not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    for (const [from, to] of HTML_REWRITES) {
      if (pathname === from) {
        url.pathname = to;
        return env.ASSETS.fetch(new Request(url.toString(), request));
      }
    }

    return env.ASSETS.fetch(request);
  },
};
