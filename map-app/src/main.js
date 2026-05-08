import "ol/ol.css";
import "./style.css";
import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import { defaults as defaultInteractions } from "ol/interaction.js";
import MouseWheelZoom from "ol/interaction/MouseWheelZoom.js";
import OSM from "ol/source/OSM.js";
import XYZ from "ol/source/XYZ.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import { fromLonLat } from "ol/proj.js";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

const mapCommandRoot = document.getElementById("mapCommandRoot");
if (!mapCommandRoot) {
  throw new Error("缺少 #mapCommandRoot，请使用 map-app/index.html 壳页面");
}
mapCommandRoot.innerHTML = `
  <section class="panel panel--stream command-app-panel map-command-panel">
    <header class="ops-board-head map-command-panel__head">
      <h1 class="ops-board-head__title">地图中心</h1>
    </header>
    <section class="map-filters">
      <label>开始时间 <input id="startTime" type="datetime-local" /></label>
      <label>结束时间 <input id="endTime" type="datetime-local" /></label>
      <button id="loadBtn" type="button">加载点位</button>
      <span id="hint"></span>
    </section>
    <section class="map-layout">
      <div class="map-canvas-wrap" id="mapCanvasWrap">
        <p class="map-canvas-wrap__hint" id="mapInteractHint">圆点会轻微律动；鼠标移上放大高亮，点击查看右侧详情。</p>
        <div id="map" class="map-canvas-wrap__map" role="application" aria-label="警情点位地图，可点击圆点"></div>
      </div>
      <aside class="detail" id="detail">
        <h2 id="detailTitle">未选中点位</h2>
        <div id="detailBody">将鼠标移到圆点上会高亮并变为手型指针，点击后在右侧展示详情。</div>
      </aside>
    </section>
  </section>
`;

const vectorSource = new VectorSource();
/** @type {import("ol/Feature.js").default | null} */
let hoveredFeature = null;
/** @type {import("ol/Feature.js").default | null} */
let selectedFeature = null;
let pulsePhase = 0;
let pulseRaf = 0;

function stopMarkerPulse() {
  if (pulseRaf) {
    cancelAnimationFrame(pulseRaf);
    pulseRaf = 0;
  }
}

function startMarkerPulse() {
  if (pulseRaf) return;
  let frame = 0;
  const loop = () => {
    pulsePhase += 0.07;
    frame += 1;
    // 每 4 帧刷新一次样式，减轻与缩放/平移抢主线程（律动仍可见）
    if (frame % 4 === 0) vectorLayer.changed();
    pulseRaf = requestAnimationFrame(loop);
  };
  pulseRaf = requestAnimationFrame(loop);
}

/** @param {import("ol/Feature.js").default} feature */
function pointStylesForFeature(feature) {
  const isSelected = feature === selectedFeature;
  const isHovered = feature === hoveredFeature;
  const breathe = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(pulsePhase));
  let radius = 7.5 * breathe;
  if (isSelected) radius = 12;
  else if (isHovered) radius = 10.5;
  const ringPulse = isHovered || isSelected ? 0 : Math.sin(pulsePhase) * 1.8;
  const ringR = radius + 5 + ringPulse;
  const coreFill = isSelected ? "rgba(251, 191, 36, 0.5)" : "rgba(56, 189, 248, 0.42)";
  const coreStroke = isSelected ? "#fbbf24" : "#38bdf8";
  const ringAlpha = isHovered || isSelected ? 0.26 : 0.09 + 0.08 * (0.5 + 0.5 * Math.sin(pulsePhase));

  return [
    new Style({
      image: new CircleStyle({
        radius: ringR,
        fill: new Fill({ color: `rgba(56, 189, 248, ${ringAlpha})` }),
        stroke: new Stroke({ color: `rgba(56, 189, 248, ${ringAlpha * 1.6})`, width: 1 }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: coreFill }),
        stroke: new Stroke({ color: coreStroke, width: isHovered || isSelected ? 3 : 2 }),
      }),
    }),
  ];
}

const vectorLayer = new VectorLayer({
  source: vectorSource,
  style: (feature) => pointStylesForFeature(feature),
});

const xyz = (window.PLICE_OL_XYZ_URL || "").trim();
const noTiles = window.PLICE_MAP_OFFLINE_NO_TILES === true;
const baseLayer =
  noTiles
    ? null
    : new TileLayer({
        source: xyz
          ? new XYZ({ url: xyz, crossOrigin: "anonymous", transition: 0 })
          : new OSM({ transition: 0 }),
      });

const interactions = defaultInteractions({
  altShiftDragRotate: false,
  pinchRotate: false,
  mouseWheelZoom: false,
}).extend([new MouseWheelZoom({ duration: 90, maxDelta: 1 })]);

const map = new Map({
  target: "map",
  layers: baseLayer ? [baseLayer, vectorLayer] : [vectorLayer],
  interactions,
  view: new View({
    center: fromLonLat([116.4074, 39.9042]),
    zoom: 11,
    minZoom: 4,
    maxZoom: 18,
    constrainResolution: true,
  }),
});

const hint = document.getElementById("hint");
const mapInteractHint = document.getElementById("mapInteractHint");
const detailTitle = document.getElementById("detailTitle");
const detailBody = document.getElementById("detailBody");

const toApiTime = (v) => (v ? `${v.replace("T", " ")}:00` : "");

async function loadEvents() {
  const start = toApiTime(document.getElementById("startTime").value);
  const end = toApiTime(document.getElementById("endTime").value);
  const qs = new URLSearchParams({ limit: "300" });
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  hint.textContent = "加载中...";
  const res = await fetch(`/api/map-events?${qs.toString()}`);
  if (!res.ok) throw new Error(`接口失败: ${res.status}`);
  const data = await res.json();
  const events = Array.isArray(data.events) ? data.events : [];
  const skipped = Number(data.skipped_without_coord || 0);
  hoveredFeature = null;
  selectedFeature = null;
  stopMarkerPulse();
  vectorSource.clear();
  events.forEach((e) => {
    const f = new Feature({
      geometry: new Point(fromLonLat([Number(e.lon), Number(e.lat)])),
      meta: e,
    });
    vectorSource.addFeature(f);
  });
  if (events.length) {
    startMarkerPulse();
    map.getView().fit(vectorSource.getExtent(), { padding: [32, 32, 32, 32], maxZoom: 18, duration: 0 });
  }
  hint.textContent = `已加载 ${events.length} 个点位${skipped > 0 ? `（${skipped} 条缺少坐标未上图）` : ""}`;
  if (mapInteractHint) {
    mapInteractHint.hidden = events.length === 0;
  }
}

const hitOpts = { hitTolerance: 12 };

let lastMapMoveKey = "";
map.on("pointermove", (evt) => {
  const px = evt.pixel;
  const key = `${Math.round(px[0])}|${Math.round(px[1])}`;
  if (key === lastMapMoveKey) return;
  lastMapMoveKey = key;
  const hit = map.forEachFeatureAtPixel(px, (ft) => ft, hitOpts);
  if (hit !== hoveredFeature) {
    hoveredFeature = hit;
    vectorLayer.changed();
  }
  const el = map.getTargetElement();
  if (el) el.style.cursor = hit ? "pointer" : "";
});

map.on("singleclick", (evt) => {
  const hit = map.forEachFeatureAtPixel(evt.pixel, (ft) => ft, hitOpts);
  if (!hit) {
    selectedFeature = null;
    vectorLayer.changed();
    return;
  }
  selectedFeature = hit;
  vectorLayer.changed();
  const m = hit.get("meta") || {};
  detailTitle.textContent = `${m.incident_type || "案件"} · ${m.risk_level || "未知"}`;
  const notesLine = (m.geo_notes || "").trim()
    ? `<p><strong>坐标说明：</strong>${escHtml(m.geo_notes)}</p>`
    : "";
  detailBody.innerHTML = `
    <p><strong>时间：</strong>${m.time || "—"}</p>
    <p><strong>位置：</strong>${m.location_text || "待核实"}</p>
    <p><strong>摘要：</strong>${m.summary || "无摘要"}</p>
    <p><strong>坐标来源：</strong>${m.geo_source || "unknown"}（研判 LLM 优先，其次规则/兜底）</p>
    <p><strong>坐标置信：</strong>${Math.round(Number(m.geo_confidence || 0) * 100)}%</p>
    ${notesLine}
    <p><strong>ID：</strong>${m.analysis_id || "—"}</p>
  `;
});

function initRangeDefault() {
  const now = new Date();
  const before = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  document.getElementById("startTime").value = fmt(before);
  document.getElementById("endTime").value = fmt(now);
}

document.getElementById("loadBtn").addEventListener("click", async () => {
  try {
    await loadEvents();
  } catch (e) {
    hint.textContent = e.message || String(e);
  }
});

initRangeDefault();
loadEvents().catch((e) => {
  hint.textContent = e.message || String(e);
});
