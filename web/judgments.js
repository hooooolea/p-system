// esc, pliceApiUrl, riskClass 已移至 utils.js

function displayCaseId(id) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return `PJ-${s.slice(0, 8)}`;
  }
  const tail = s.replace(/^analysis_/, "");
  return tail.length > 10 ? `PJ-${tail.slice(-10)}` : `PJ-${tail}`;
}

const JD_AR_IDS = {
  caseId: "jdArCaseId",
  riskBadge: "jdArRiskBadge",
  confidence: "jdArConfidence",
  type: "jdArType",
  location: "jdArLocation",
  time: "jdArTime",
  assign: "jdArAssign",
  desc: "jdArDesc",
  workflow: "jdArWorkflow",
  gaugeRing: "jdArGaugeRing",
  gaugeNum: "jdArGaugeNum",
  factors: "jdArFactors",
  primarySuggest: "jdArPrimarySuggest",
  secondarySuggest: "jdArSecondarySuggest",
  related: "jdArRelated",
  feedbackState: "jdArFeedbackState",
  btnAdopt: "jdArBtnAdopt",
  btnIgnore: "jdArBtnIgnore",
};

let selectedAnalysisId = "";
let allItems = [];        // 原始全部数据
let currentFilter = "all"; // 当前筛选条件

/* ===== 统计概览 ===== */
function renderStats(items) {
  const all = items.length;
  const high = items.filter((i) => i.risk_level === "高" || i.risk_level === "紧急").length;
  const adopted = items.filter((i) => i.user_feedback === "adopt").length;
  const pending = items.filter((i) => !i.user_feedback || i.user_feedback === "pending").length;

  // 筛选标签上的数字
  document.getElementById("filterCountAll").textContent = all ? ` ${all}` : "";
  document.getElementById("filterCountHigh").textContent = high ? ` ${high}` : "";
  document.getElementById("filterCountAdopted").textContent = adopted ? ` ${adopted}` : "";
  document.getElementById("filterCountPending").textContent = pending ? ` ${pending}` : "";
}

/* ===== 筛选逻辑 ===== */
function filterItems(items, filter) {
  if (filter === "all") return items;
  if (filter === "high") return items.filter((i) => i.risk_level === "高" || i.risk_level === "紧急");
  if (filter === "adopted") return items.filter((i) => i.user_feedback === "adopt");
  if (filter === "pending") return items.filter((i) => !i.user_feedback || i.user_feedback === "pending");
  return items;
}

/* ===== 渲染条目列表 ===== */
function renderStack(items) {
  const stack = document.getElementById("judgmentStack");
  const empty = document.getElementById("judgmentsEmpty");
  if (!stack) return;

  stack.innerHTML = "";
  empty.hidden = items.length > 0;

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }

  stack.innerHTML = items
    .map((item) => {
      const id = item.id || "";
      const elapsed = Number(item.elapsed) || 0;
      const typeFull = String(item.incident_type || "—").replace(/\s+/g, " ").trim();
      return `<button type="button" class="judgment-rail-item judgment-rail-item--selectable" data-analysis-id="${esc(id)}"${
        id ? "" : " disabled"
      }>
  <span class="judgment-rail-item__row1">
    <span class="judgment-rail-item__id">${esc(displayCaseId(id))}</span>
    <span class="risk-pill risk-pill--rail ${riskClass(item.risk_level)}">${esc(item.risk_level || "未知")}</span>
  </span>
  <span class="judgment-rail-item__row2">${esc(item.time || "—")}</span>
  <span class="judgment-rail-item__row3">${esc(typeFull)} · ${elapsed.toFixed(1)}s</span>
</button>`;
    })
    .join("");
}

/* ===== 详情状态切换 ===== */
function setDetailState(mode) {
  const ph = document.getElementById("jdDetailPlaceholder");
  const loading = document.getElementById("jdDetailLoading");
  const err = document.getElementById("jdDetailError");
  const content = document.getElementById("jdDetailContent");
  if (!ph || !loading || !err || !content) return;
  ph.hidden = mode !== "placeholder";
  loading.hidden = mode !== "loading";
  err.hidden = mode !== "error";
  content.hidden = mode !== "ready";
}

function showDetailError(msg) {
  const err = document.getElementById("jdDetailError");
  if (err) err.textContent = msg;
  setDetailState("error");
}

async function fetchPresentation(id) {
  return apiGetPresentation(id);
}

async function openDetail(analysisId) {
  const PR = window.pliceArPresentation;
  if (!PR || !analysisId) return;
  selectedAnalysisId = analysisId;
  setDetailState("loading");
  document.getElementById("jdDetailError").textContent = "";
  try {
    const data = await fetchPresentation(analysisId);
    setDetailState("ready");
    PR.renderAnalysisPresentation(data.presentation, data.analysis_id, data.user_feedback, JD_AR_IDS);
    PR.bindArFeedback(analysisId, JD_AR_IDS);
  } catch (e) {
    showDetailError(e.message || String(e));
  }
}

function setActiveRailItem(btn) {
  document.querySelectorAll(".judgment-rail-item--active").forEach((el) => el.classList.remove("judgment-rail-item--active"));
  if (btn) btn.classList.add("judgment-rail-item--active");
}

/* ===== 标签筛选 ===== */
function applyFilter(filter) {
  currentFilter = filter;
  // 更新标签高亮
  document.querySelectorAll(".jd-filter__btn").forEach((btn) => {
    btn.classList.toggle("jd-filter__btn--active", btn.getAttribute("data-filter") === filter);
  });
  // 筛选并渲染
  const filtered = filterItems(allItems, filter);
  renderStack(filtered);
  document.getElementById("judgmentsMeta").textContent = filtered.length ? `共 ${filtered.length} 条` : "共 0 条";
  // 清除详情选中
  setActiveRailItem(null);
  selectedAnalysisId = "";
  setDetailState("placeholder");
}

/* ===== 加载数据 ===== */
async function loadJudgments() {
  const meta = document.getElementById("judgmentsMeta");
  const errEl = document.getElementById("judgmentsError");
  if (!meta) return;
  errEl.hidden = true;
  errEl.textContent = "";
  meta.textContent = "加载中…";
  document.getElementById("judgmentStack").innerHTML = "";
  document.getElementById("judgmentsEmpty").hidden = true;
  selectedAnalysisId = "";
  setActiveRailItem(null);
  setDetailState("placeholder");

  try {
    const data = await apiGetHistory(120);
    allItems = Array.isArray(data.history) ? data.history : [];
    const reversed = [...allItems].reverse();

    renderStats(reversed);

    const filtered = filterItems(reversed, currentFilter);
    renderStack(filtered);
    meta.textContent = filtered.length ? `共 ${filtered.length} 条` : "共 0 条";

    // URL 参数预打开
    const preOpen = new URLSearchParams(window.location.search).get("id");
    if (preOpen && allItems.length) {
      const sid = preOpen.trim();
      const btn = Array.from(document.querySelectorAll("button.judgment-rail-item--selectable[data-analysis-id]")).find(
        (b) => b.getAttribute("data-analysis-id") === sid,
      );
      if (btn && !btn.disabled) {
        setActiveRailItem(btn);
        void openDetail(sid);
      }
    }
  } catch (e) {
    meta.textContent = "";
    errEl.hidden = false;
    errEl.textContent = e.message || String(e);
  }
}

/* ===== 事件绑定 ===== */
function onStackClick(e) {
  const btn = e.target.closest(".judgment-rail-item--selectable");
  if (!btn || btn.disabled) return;
  const id = btn.getAttribute("data-analysis-id");
  if (!id) return;
  setActiveRailItem(btn);
  void openDetail(id);
}

document.getElementById("judgmentsRefreshBtn")?.addEventListener("click", () => void loadJudgments());
document.getElementById("judgmentStack")?.addEventListener("click", onStackClick);

// 标签筛选
document.getElementById("jdFilter")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".jd-filter__btn");
  if (!btn) return;
  applyFilter(btn.getAttribute("data-filter"));
});

void loadJudgments();
