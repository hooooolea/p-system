// esc, pliceApiUrl, riskClass 已移至 utils.js

function setKpis(k) {
  const map = [
    ["kpiTotal", k.total],
    ["kpiInvestigating", k.investigating],
    ["kpiClosed", k.closed],
    ["kpiSuspended", k.suspended],
  ];
  map.forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v ?? 0);
  });
}

function renderCases(cases) {
  const root = document.getElementById("opsCards");
  const empty = document.getElementById("casesEmpty");
  const err = document.getElementById("casesError");
  if (!root) return;
  err.hidden = true;
  err.textContent = "";
  if (!cases.length) {
    root.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  root.innerHTML = cases
    .map((c) => {
      const id = esc(c.analysis_id);
      const rawSt = String(c.status || "investigating");
      return `<article class="ops-case" data-analysis-id="${id}">
  <p class="ops-case__id">${esc(c.display_no)}</p>
  <h2 class="ops-case__title">${esc(c.title)}</h2>
  <p class="ops-case__desc">${esc(c.description)}</p>
  <div class="ops-case__progress"><span style="width: ${Number(c.progress) || 0}%"></span></div>
  <p class="ops-case__meta">进度 ${Number(c.progress) || 0}% · ${esc(c.status_label || "")}${c.status_reason ? ` · ${esc(c.status_reason)}` : ""}</p>
  <p class="ops-case__meta ops-case__meta--sub">${esc(c.time || "—")} · ${esc(c.incident_type || "")} · <span class="risk-pill risk-pill--rail ${riskClass(c.risk_level)}">${esc(c.risk_level || "未知")}</span></p>
  <div class="ops-case__actions">
    <a class="ghost-btn ops-case__link" href="/judgments.html?id=${encodeURIComponent(c.analysis_id)}">打开研判</a>
    <a class="ghost-btn ops-case__link" href="/command-map.html">地图</a>
    <label class="ops-case__status-label muted">状态</label>
    <select class="ops-case__status" data-analysis-id="${id}" aria-label="案件状态">
      <option value="investigating"${rawSt === "investigating" ? " selected" : ""}>调查中</option>
      <option value="closed"${rawSt === "closed" ? " selected" : ""}>已结案</option>
      <option value="suspended"${rawSt === "suspended" ? " selected" : ""}>已搁置</option>
    </select>
  </div>
</article>`;
    })
    .join("");
}

async function patchCaseStatus(analysisId, status) {
  const res = await fetch(pliceApiUrl(`/api/cases/${encodeURIComponent(analysisId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function loadCases() {
  const err = document.getElementById("casesError");
  const empty = document.getElementById("casesEmpty");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const res = await fetch(pliceApiUrl("/api/cases?limit=120"));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    setKpis(data.kpis || {});
    renderCases(Array.isArray(data.cases) ? data.cases : []);
  } catch (e) {
    if (empty) empty.hidden = true;
    if (err) {
      err.hidden = false;
      err.textContent = e.message || String(e);
    }
  }
}

document.getElementById("casesRefreshBtn")?.addEventListener("click", () => void loadCases());
document.getElementById("newCaseBtn")?.addEventListener("click", () => {
  window.location.href = "/";
});

document.getElementById("opsCards")?.addEventListener("change", async (e) => {
  const sel = e.target.closest("select.ops-case__status");
  if (!sel) return;
  const aid = sel.getAttribute("data-analysis-id");
  const status = sel.value;
  if (!aid) return;
  try {
    await patchCaseStatus(aid, status);
    await loadCases();
  } catch (err) {
    const errEl = document.getElementById("casesError");
    if (errEl) { errEl.textContent = err.message || String(err); errEl.hidden = false; }
    await loadCases();
  }
});

void loadCases();
