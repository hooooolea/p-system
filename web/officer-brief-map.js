/**
 * 出警前简报：OpenLayers 地图 + 点击要素看详情（依赖全局 ol，自 index.html 先于 app.js 加载）。
 *
 * 专网 / 离线底图（不访问互联网）——任选其一，在加载本文件之前设置全局变量：
 *
 * 1) 内网 XYZ 瓦片（最常见）
 *    window.PLICE_OL_XYZ_URL = "http://地图服务器IP或域名/路径/{z}/{x}/{y}.png";
 *    或同域静态目录：window.PLICE_OL_XYZ_URL = "/tiles/{z}/{x}/{y}.png";
 *    瓦片需按标准 Web 墨卡托目录存放：tiles/缩放级别/z/x/y.png（与 OSM 切片约定一致）。
 *
 * 2) 不要底图（仅看点位，背景为页面 CSS 深色底）
 *    window.PLICE_MAP_OFFLINE_NO_TILES = true;
 *
 * 未设置时仍使用 OpenStreetMap（需能访问外网）。
 *
 * 可选：window.PLICE_OL_ATTRIBUTION = "© 本单位"; （XYZ 时建议写清数据来源）
 */
(function (global) {
  let map = null;
  let vectorSource = null;
  let resizeObserver = null;

  function destroy() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (map) {
      map.setTarget(null);
      map = null;
    }
    vectorSource = null;
  }

  function createRasterLayer(ol) {
    const xyz = typeof global.PLICE_OL_XYZ_URL === "string" ? global.PLICE_OL_XYZ_URL.trim() : "";
    if (xyz) {
      const attr = global.PLICE_OL_ATTRIBUTION ? String(global.PLICE_OL_ATTRIBUTION) : undefined;
      return new ol.layer.Tile({
        source: new ol.source.XYZ({
          url: xyz,
          crossOrigin: "anonymous",
          attributions: attr,
          transition: 0,
        }),
      });
    }
    if (global.PLICE_MAP_OFFLINE_NO_TILES === true) {
      return null;
    }
    return new ol.layer.Tile({
      source: new ol.source.OSM({ transition: 0 }),
    });
  }

  /** 像素命中容差：高 DPI / 小圆点时点准更容易 */
  const FEATURE_HIT_TOLERANCE = 14;

  function makeStyle(kind) {
    const ol = global.ol;
    const fill =
      kind === "history"
        ? new ol.style.Fill({ color: "rgba(56, 189, 248, 0.45)" })
        : new ol.style.Fill({ color: "rgba(251, 146, 60, 0.5)" });
    const stroke =
      kind === "history"
        ? new ol.style.Stroke({ color: "#38bdf8", width: 2.5 })
        : new ol.style.Stroke({ color: "#fb923c", width: 2.5 });
    return new ol.style.Style({
      image: new ol.style.Circle({ radius: 11, fill, stroke }),
    });
  }

  function makeStyleSelected(kind) {
    const ol = global.ol;
    const fill =
      kind === "history"
        ? new ol.style.Fill({ color: "rgba(56, 189, 248, 0.65)" })
        : new ol.style.Fill({ color: "rgba(251, 146, 60, 0.65)" });
    const stroke =
      kind === "history"
        ? new ol.style.Stroke({ color: "#7dd3fc", width: 3 })
        : new ol.style.Stroke({ color: "#fdba74", width: 3 });
    return [
      new ol.style.Style({
        image: new ol.style.Circle({
          radius: 18,
          fill: new ol.style.Fill({ color: "rgba(0,0,0,0)" }),
          stroke: new ol.style.Stroke({ color: "rgba(255,255,255,0.9)", width: 3 }),
        }),
      }),
      new ol.style.Style({
        image: new ol.style.Circle({ radius: 12, fill, stroke }),
      }),
    ];
  }

  /**
   * @param {object} opts
   * @param {string} opts.mapTargetId
   * @param {string} opts.detailPanelId
   * @param {string} opts.detailTitleId
   * @param {string} opts.detailBodyId
   * @param {Array<{ kind: string, lon: number, lat: number, title: string, detailHtml: string }>} opts.features
   * @param {string} [opts.emptyMessage]
   */
  function mount(opts) {
    destroy();
    const ol = global.ol;
    if (!ol) {
      return;
    }
    const mapEl = document.getElementById(opts.mapTargetId);
    const panel = document.getElementById(opts.detailPanelId);
    const titleEl = document.getElementById(opts.detailTitleId);
    const bodyEl = document.getElementById(opts.detailBodyId);
    if (!mapEl || !panel || !titleEl || !bodyEl) return;

    vectorSource = new ol.source.Vector();
    const feats = opts.features || [];
    for (let i = 0; i < feats.length; i += 1) {
      const f = feats[i];
      const lon = Number(f.lon);
      const lat = Number(f.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const feature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
        meta: f,
      });
      const k = f.kind === "hotspot" ? "hotspot" : "history";
      feature.set("kindKey", k);
      feature.setStyle(makeStyle(k));
      vectorSource.addFeature(feature);
    }

    const raster = createRasterLayer(ol);
    const vectorLayer = new ol.layer.Vector({
      source: vectorSource,
    });
    const layers = raster ? [raster, vectorLayer] : [vectorLayer];

    /* CDN 全量 ol.js 未必挂载 ol.interaction.defaults，此处不自定义 interactions，避免运行时 TypeError。 */
    map = new ol.Map({
      target: mapEl,
      layers,
      view: new ol.View({
        center: ol.proj.fromLonLat([116.4074, 39.9042]),
        zoom: 13,
        minZoom: 3,
        maxZoom: 18,
        constrainResolution: true,
      }),
    });

    resizeObserver = new ResizeObserver(() => {
      if (map) map.updateSize();
    });
    resizeObserver.observe(mapEl);

    if (vectorSource.getFeatures().length > 0) {
      try {
        map.getView().fit(vectorSource.getExtent(), { padding: [28, 28, 28, 28], maxZoom: 15, duration: 0 });
      } catch (_) {
        map.getView().setCenter(ol.proj.fromLonLat([116.4074, 39.9042]));
        map.getView().setZoom(12);
      }
    } else {
      map.getView().setCenter(ol.proj.fromLonLat([116.4074, 39.9042]));
      map.getView().setZoom(12);
    }

    if (!feats.length) {
      panel.hidden = false;
      titleEl.textContent = "暂无标注点";
      bodyEl.innerHTML = `<p class="hint muted">${opts.emptyMessage || "无历史相似记录或关注点时，地图仅作底图示意。"}</p>`;
    } else {
      panel.hidden = true;
      titleEl.textContent = "";
      bodyEl.innerHTML = "";
    }

    let selectedFeature = null;
    const hitOpts = { hitTolerance: FEATURE_HIT_TOLERANCE };

    function applyDefaultStyleTo(ft) {
      const k = ft.get("kindKey") || "history";
      ft.setStyle(makeStyle(k));
    }

    function clearPointSelection() {
      if (selectedFeature) {
        applyDefaultStyleTo(selectedFeature);
        selectedFeature = null;
      }
    }

    function flashDetailPanel() {
      panel.classList.remove("officer-brief-map-detail--flash");
      // 强制重流动画
      void panel.offsetWidth;
      panel.classList.add("officer-brief-map-detail--flash");
    }

    let lastMovePixelKey = "";
    map.on("pointermove", (evt) => {
      const el = map.getTargetElement();
      if (!el) return;
      const px = evt.pixel;
      const key = `${Math.round(px[0])}|${Math.round(px[1])}`;
      if (key === lastMovePixelKey) return;
      lastMovePixelKey = key;
      const hit = map.forEachFeatureAtPixel(px, (ft) => ft, hitOpts);
      el.style.cursor = hit ? "pointer" : "";
    });

    map.on("singleclick", (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (ft) => ft, hitOpts);
      clearPointSelection();
      if (hit) {
        const m = hit.get("meta");
        if (m) {
          selectedFeature = hit;
          const k = hit.get("kindKey") || "history";
          hit.setStyle(makeStyleSelected(k));
          panel.hidden = false;
          titleEl.textContent = m.title || "详情";
          bodyEl.innerHTML = m.detailHtml || "";
          flashDetailPanel();
          try {
            panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch (_) {
            panel.scrollIntoView();
          }
        }
      } else if (feats.length) {
        panel.hidden = false;
        titleEl.textContent = "提示";
        bodyEl.innerHTML =
          '<p class="hint muted" style="margin:0">未选中点位。请点击地图上的 <strong style="color:#38bdf8">彩色圆点</strong> 查看案件详情；圆点略大可点周边空白处也算命中。</p>';
        flashDetailPanel();
      }
    });
  }

  global.pliceDestroyOfficerBriefMap = destroy;
  global.pliceMountOfficerBriefMap = mount;
  global.pliceOfficerBriefMapUpdateSize = function () {
    if (map) map.updateSize();
  };
})(window);
