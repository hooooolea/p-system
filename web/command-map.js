// pliceApiUrl 已移至 utils.js

async function loadMapEventsByRange() {
  const startEl = document.getElementById("mapRangeStart");
  const endEl = document.getElementById("mapRangeEnd");
  const hintEl = document.getElementById("mapRangeHint");
  const btn = document.getElementById("mapRangeApplyBtn");
  if (typeof window.pliceMountOfficerBriefMap !== "function" || !startEl || !endEl) return;

  const toApiTime = (v) => (v ? `${v.replace("T", " ")}:00` : "");
  const qs = new URLSearchParams({ limit: "200" });
  const s = toApiTime(startEl.value);
  const e = toApiTime(endEl.value);
  if (s) qs.set("start", s);
  if (e) qs.set("end", e);

  if (btn) btn.disabled = true;
  if (hintEl) hintEl.textContent = "正在加载地图案件点位...";
  try {
    const url = pliceApiUrl(`/api/map-events?${qs.toString()}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`加载失败 (${res.status})`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const rawText = await res.text();
    if (!ct.includes("application/json") && rawText.trimStart().startsWith("<")) {
      throw new Error(
        "接口返回了 HTML 而非 JSON（常见于静态站未指向 Flask）。请在 command-map.html 里取消注释并设置 window.PLICE_API_ORIGIN 为你的 API 根地址；跨域时请在服务端设置 PLICE_CORS_ALLOW_ORIGIN。"
      );
    }
    const data = JSON.parse(rawText);
    const events = Array.isArray(data.events) ? data.events : [];
    const skipped = Number(data.skipped_without_coord || 0);
    const stubEmpty = (res.headers.get("X-Plice-Map-Events") || "").toLowerCase() === "stub-empty";
    const features = events.map((ev) => {
      const notes = String(ev.geo_notes || "").trim();
      const notesLine = notes ? `<p><strong>坐标说明：</strong>${esc(notes)}</p>` : "";
      const pct = Math.round(Number(ev.geo_confidence || 0) * 100);
      return {
        kind: "history",
        lon: Number(ev.lon),
        lat: Number(ev.lat),
        title: `${ev.incident_type || "案件"} · ${ev.risk_level || "未知"}`,
        detailHtml: `<p><strong>时间：</strong>${esc(ev.time || "—")}</p>
<p><strong>位置：</strong>${esc(ev.location_text || "待核实")}</p>
<p><strong>摘要：</strong>${esc(ev.summary || "无摘要")}</p>
<p><strong>坐标来源：</strong>${esc(ev.geo_source || "unknown")}</p>
<p><strong>坐标置信：</strong>${esc(pct)}%</p>
${notesLine}
<p><strong>分析ID：</strong>${esc(ev.analysis_id || "—")}</p>`,
      };
    });
    window.pliceMountOfficerBriefMap({
      mapTargetId: "commandMapCanvas",
      detailPanelId: "commandMapDetail",
      detailTitleId: "commandMapDetailTitle",
      detailBodyId: "commandMapDetailBody",
      features,
      emptyMessage: "该时间段内暂无案件点位。",
    });
    if (hintEl) {
      if (stubEmpty && features.length === 0) {
        hintEl.textContent =
          "静态站演示：未接后端。请在 Cloudflare Worker 变量中设置 PLICE_BACKEND_URL（见 wrangler.toml 注释），或在 command-map.html 中设置 window.PLICE_API_ORIGIN 指向已部署的 Flask。";
      } else {
        const skipPart = skipped > 0 ? `；另有 ${skipped} 条因缺少有效坐标未上图（请接警/研判补充地点）` : "";
        hintEl.textContent = `已加载 ${features.length} 个案件点位${skipPart}`;
      }
    }
  } catch (err) {
    if (hintEl) hintEl.textContent = err.message || String(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initCommandMapPage() {
  // 默认使用 OpenStreetMap 底图。专网/无外网时请在 command-map.html 里先于本脚本设置：
  // window.PLICE_OL_XYZ_URL = "https://…/{z}/{x}/{y}.png"; 或 window.PLICE_MAP_OFFLINE_NO_TILES = true（仅点位、无瓦片）。

  const hintEl = document.getElementById("mapRangeHint");
  const detailPanel = document.getElementById("commandMapDetail");
  const detailTitle = document.getElementById("commandMapDetailTitle");
  const detailBody = document.getElementById("commandMapDetailBody");
  if (typeof window.ol === "undefined" || typeof window.pliceMountOfficerBriefMap !== "function") {
    if (hintEl) hintEl.textContent = "地图引擎加载失败，请检查网络或 OpenLayers 资源。";
    if (detailPanel && detailTitle && detailBody) {
      detailPanel.hidden = false;
      detailTitle.textContent = "地图未就绪";
      detailBody.innerHTML = "<p class='hint muted'>OpenLayers 脚本未加载，当前无法渲染地图画面。</p>";
    }
    return;
  }

  const now = new Date();
  const before = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const startEl = document.getElementById("mapRangeStart");
  const endEl = document.getElementById("mapRangeEnd");
  if (startEl && !startEl.value) startEl.value = fmt(before);
  if (endEl && !endEl.value) endEl.value = fmt(now);
  document.getElementById("mapRangeApplyBtn")?.addEventListener("click", loadMapEventsByRange);
  loadMapEventsByRange();
}

initCommandMapPage();
