(function () {
  const API_ORIGIN = (window.PLICE_API_ORIGIN || "").trim().replace(/\/$/, "");
  let lastEventSeq = 0;
  let sseConnected = false;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  async function api(path, init) {
    const target = API_ORIGIN ? `${API_ORIGIN}${path}` : path;
    const res = await fetch(target, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  }

  function setHint(msg, isErr) {
    const el = document.getElementById("videoSituationHint");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "#ef4444" : "";
  }

  function apiPathLabel(path) {
    return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
  }

  function syncVideo(src) {
    const video = document.getElementById("commandSituationStandaloneVideo");
    const ph = document.getElementById("commandSituationStandalonePlaceholder");
    if (!video || !ph) return;
    if (!src) {
      video.removeAttribute("src");
      video.load();
      ph.hidden = false;
      return;
    }
    if ((video.getAttribute("src") || "").trim() !== src) {
      video.src = src;
      video.load();
    }
    ph.hidden = false;
    video.onloadeddata = () => {
      ph.hidden = true;
    };
    video.onerror = () => {
      ph.hidden = false;
    };
  }

  function renderAlerts(alerts) {
    const tbody = document.querySelector("#videoAlertsTable tbody");
    const empty = document.getElementById("videoAlertsEmpty");
    if (!tbody || !empty) return;
    tbody.innerHTML = "";
    if (!alerts.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    alerts.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(a.event_time || "")}</td>
        <td>${esc(a.camera_id || "")}</td>
        <td>${esc(a.target_id || "")}</td>
        <td>${esc(a.alert_type || "")}</td>
        <td>${esc(a.suspect_traits || "")}</td>
        <td>${esc(a.score || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function applyIncomingAlerts(alerts) {
    if (!Array.isArray(alerts) || !alerts.length) return;
    const tbody = document.querySelector("#videoAlertsTable tbody");
    const empty = document.getElementById("videoAlertsEmpty");
    if (!tbody || !empty) return;
    const rows = alerts.map(
      (a) => `
        <tr>
          <td>${esc(a.event_time || "")}</td>
          <td>${esc(a.camera_id || "")}</td>
          <td>${esc(a.target_id || "")}</td>
          <td>${esc(a.alert_type || "")}</td>
          <td>${esc(a.suspect_traits || "")}</td>
          <td>${esc(a.score || 0)}</td>
        </tr>
      `
    );
    tbody.insertAdjacentHTML("afterbegin", rows.join(""));
    while (tbody.children.length > 20) tbody.removeChild(tbody.lastElementChild);
    empty.hidden = tbody.children.length > 0;
  }

  async function refreshSituation() {
    const streamData = await api("/api/video/streams");
    const k = streamData.kpis || {};
    setText("videoKpiOnline", k.online_streams ?? 0);
    setText("videoKpiAlerts", k.alert_total ?? 0);
    setText("videoKpiTargets", k.active_targets_30m ?? 0);
    setText("videoKpiOffline", k.offline_streams ?? 0);
    const streams = Array.isArray(streamData.streams) ? streamData.streams : [];
    const active = streams.find((s) => String(s.status || "online") === "online") || streams[0];
    syncVideo(active?.stream_url || "");
    if (active) {
      const cam = document.getElementById("videoCameraId");
      const url = document.getElementById("videoStreamUrl");
      const zone = document.getElementById("videoZone");
      if (cam && !cam.value) cam.value = active.camera_id || "";
      if (url && !url.value) url.value = active.stream_url || "";
      if (zone && !zone.value) zone.value = active.zone || "";
    }
    const alertData = await api("/api/video/alerts?limit=20");
    const alerts = Array.isArray(alertData.alerts) ? alertData.alerts : [];
    renderAlerts(alerts);
    if (alerts.length) {
      lastEventSeq = Math.max(lastEventSeq, Number(alerts[0]?.event_seq || 0));
    }
  }

  async function saveStream() {
    const camera_id = (document.getElementById("videoCameraId")?.value || "").trim();
    const stream_url = (document.getElementById("videoStreamUrl")?.value || "").trim();
    const zone = (document.getElementById("videoZone")?.value || "").trim();
    if (!camera_id || !stream_url) {
      setHint("请填写摄像头ID与视频地址。", true);
      return;
    }
    await api("/api/video/streams", {
      method: "POST",
      body: JSON.stringify({ camera_id, stream_url, zone, status: "online" }),
    });
    setHint(`已保存视频源 ${camera_id}`);
    await refreshSituation();
  }

  async function pushAlert() {
    const camera_id = (document.getElementById("videoCameraId")?.value || "").trim();
    const alert_type = (document.getElementById("videoAlertType")?.value || "").trim() || "可疑行为";
    const suspect_traits = (document.getElementById("videoTraits")?.value || "").trim();
    const stream_url = (document.getElementById("videoStreamUrl")?.value || "").trim();
    const zone = (document.getElementById("videoZone")?.value || "").trim();
    const score = Number(document.getElementById("videoScore")?.value || 0.78);
    if (!camera_id) {
      setHint("请先填写摄像头ID。", true);
      return;
    }
    const data = await api("/api/video/alerts", {
      method: "POST",
      body: JSON.stringify({ camera_id, alert_type, suspect_traits, score, stream_url, zone }),
    });
    setHint(`告警已上报：${data.alert?.target_id || ""} @ ${camera_id}`);
    await refreshSituation();
  }

  async function pushBatchDetections() {
    const camera_id = (document.getElementById("videoCameraId")?.value || "").trim();
    const stream_url = (document.getElementById("videoStreamUrl")?.value || "").trim();
    const zone = (document.getElementById("videoZone")?.value || "").trim();
    if (!camera_id) {
      setHint("请先填写摄像头ID。", true);
      return;
    }
    const sample = [
      { label: "person", score: 0.84, traits: "黑衣 口罩 电动车" },
      { label: "person", score: 0.79, traits: "黑色外套 口罩 电瓶车" },
      { label: "vehicle", score: 0.88, traits: "白色SUV 车牌尾号27" },
    ];
    const data = await api("/api/video/detections", {
      method: "POST",
      body: JSON.stringify({ camera_id, stream_url, zone, detections: sample }),
    });
    setHint(`已接收批量检测 ${data.accepted || 0} 条。`);
    await refreshSituation();
  }

  async function tick() {
    try {
      await refreshSituation();
    } catch (e) {
      setHint(e?.message || String(e), true);
    }
  }

  function startSse() {
    if (!window.EventSource) return;
    // EventSource 不支持自定义 headers，因此同样通过绝对 API 源跨域连接。
    const es = new EventSource(`${apiPathLabel("/api/video/events")}?since=${encodeURIComponent(String(lastEventSeq || 0))}`);
    es.addEventListener("open", () => {
      sseConnected = true;
      setHint(`实时告警流已连接（SSE）：${apiPathLabel("/api/video/events")}`);
    });
    es.addEventListener("video_alerts", (ev) => {
      try {
        const payload = JSON.parse(ev.data || "{}");
        const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
        applyIncomingAlerts(alerts);
        if (payload.last_event_seq) lastEventSeq = Number(payload.last_event_seq) || lastEventSeq;
        void refreshSituation();
      } catch {
        // ignore malformed payload
      }
    });
    es.addEventListener("error", () => {
      if (sseConnected) setHint("实时流短暂中断，已回退轮询。", true);
      sseConnected = false;
      es.close();
      setTimeout(() => startSse(), 5000);
    });
  }

  document.getElementById("videoSaveStreamBtn")?.addEventListener("click", () => void saveStream());
  document.getElementById("videoPushAlertBtn")?.addEventListener("click", () => void pushAlert());
  document.getElementById("videoPushBatchBtn")?.addEventListener("click", () => void pushBatchDetections());
  document.getElementById("videoAddBtn")?.addEventListener("click", () => {
    document.getElementById("videoCameraId")?.focus();
  });
  if (API_ORIGIN) {
    setHint(`已使用独立 API 源：${API_ORIGIN}`);
  }
  void tick();
  startSse();
  setInterval(() => void tick(), 5000);
})();

