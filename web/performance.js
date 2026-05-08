function apiUrl(path) {
  return typeof window !== "undefined" && typeof window.pliceResolveApiUrl === "function"
    ? window.pliceResolveApiUrl(path)
    : path;
}

async function callApi(path) {
  const res = await fetch(apiUrl(path), { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refreshPerformancePage() {
  const PR = window.plicePerfRender;
  if (!PR) return;
  try {
    const data = await callApi("/api/performance");
    PR.applyFullPerformanceDom(data);
    applyAlertEvaluationDom(data.alert_evaluation || null);
  } catch (err) {
    PR.applyPerformanceDomError(err);
    applyAlertEvaluationDom(null);
  }
}

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function applyAlertEvaluationDom(alertEval) {
  const m = (alertEval && alertEval.metrics) || {};
  const c = (alertEval && alertEval.counts) || {};
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("alertEvalPrecision", pct(m.precision));
  set("alertEvalFpr", pct(m.false_alarm_rate));
  set("alertEvalRecall", pct(m.recall_proxy));
  set("alertEvalF1", pct(m.f1_proxy));
  set("alertEvalSample", String(c.judged_reviews ?? 0));
  const note = document.getElementById("alertEvalNote");
  if (note) {
    const notes = Array.isArray(alertEval?.notes) ? alertEval.notes : [];
    note.textContent = notes.length ? notes[0] : "暂无评测数据。";
  }
}

// esc 已移至 utils.js

async function runNonfaceSearch() {
  const qEl = document.getElementById("nonfaceQueryInput");
  const kEl = document.getElementById("nonfaceTopKInput");
  const hint = document.getElementById("nonfaceSearchHint");
  const tbody = document.querySelector("#nonfaceSearchTable tbody");
  const empty = document.getElementById("nonfaceSearchEmpty");
  if (!qEl || !kEl || !hint || !tbody || !empty) return;

  const query = String(qEl.value || "").trim();
  const topK = Math.max(1, Math.min(20, Number(kEl.value || 5)));
  if (!query) {
    hint.textContent = "请输入检索线索。";
    tbody.innerHTML = "";
    empty.hidden = false;
    return;
  }

  hint.textContent = "检索中...";
  try {
    const data = await callApi(`/api/nonface/search?query=${encodeURIComponent(query)}&top_k=${topK}`);
    const items = Array.isArray(data.items) ? data.items : [];
    tbody.innerHTML = "";
    if (!items.length) {
      empty.hidden = false;
      hint.textContent = "未命中候选，请换一组衣着/体态/车辆线索。";
      return;
    }
    empty.hidden = true;
    items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(item.analysis_id || "")}</td>
        <td>${esc(item.score || 0)}</td>
        <td>${esc(item.incident_type || "未知")}</td>
        <td>${esc((item.matched_terms || []).join(", "))}</td>
        <td>${esc(item.summary || "")}</td>
      `;
      tbody.appendChild(tr);
    });
    hint.textContent = data.note || `命中 ${items.length} 条`;
  } catch (err) {
    tbody.innerHTML = "";
    empty.hidden = false;
    hint.textContent = err?.message || String(err);
  }
}

document.getElementById("refreshPerfBtn")?.addEventListener("click", () => void refreshPerformancePage());
document.getElementById("nonfaceSearchBtn")?.addEventListener("click", () => void runNonfaceSearch());
void refreshPerformancePage();
