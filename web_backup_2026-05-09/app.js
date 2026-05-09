const state = {
  latestResult: null,
  latestAnalysisId: "",
  latestMarkdown: "",
  latestBukongMarkdown: "",
  /** 最近一次布控结构化结果（用于预览；下载仍用 latestBukongMarkdown） */
  latestBukongPlan: null,
  /** 语音/内部流水线：当前 CanonicalIncident ID */
  ingestCanonicalId: "",
  /** 人工校正后的警情类型；空表示未改类（可与「采纳」系统判别并存） */
  incidentTypeOverride: "",
  /** 最近一次「研判成功」响应用于刷新摘要表头（改类时不必重算） */
  lastAnalyzeResponse: null,
};

/** 与后端 `INCIDENT_ANALYSIS_PROMPT` 中枚举一致，供改类下拉 */
const INCIDENT_TYPE_OPTIONS = [
  "打架斗殴",
  "盗窃抢劫",
  "交通事故",
  "诈骗",
  "家庭纠纷",
  "失踪人口",
  "火灾",
  "医疗急救",
  "噪音扰民",
  "涉毒案件",
  "反恐处置",
  "其他",
];

const THEME_STORAGE_KEY = "plice-docs-theme";

// pliceApiUrl, esc, riskClass, setText 已移至 utils.js

const INTERNAL_TOKEN_KEY = "plice_internal_token";

function internalRequestHeaders(extra = {}) {
  const h = {
    "Content-Type": "application/json",
    "X-Caller-Service": "plice-web-demo",
    "X-Request-Id": typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`,
    ...extra,
  };
  const t = localStorage.getItem(INTERNAL_TOKEN_KEY);
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** 默认90秒超时（MiniMax M2.7 较慢） v20260509b */
const DEFAULT_FETCH_TIMEOUT_MS = 90000;

async function callInternalApi(path, options = {}) {
  const { headers = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: internalRequestHeaders(headers),
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || (typeof data.error === "string" ? data.error : null) || res.statusText;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("请求超时（已超过1.5分钟）");
    throw e;
  }
}

/** multipart 上传：勿带 Content-Type，由浏览器自动带 boundary */
function internalAuthOnlyHeaders(extra = {}) {
  const h = {
    "X-Caller-Service": "plice-web-demo",
    "X-Request-Id":
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`,
    ...extra,
  };
  const t = localStorage.getItem(INTERNAL_TOKEN_KEY);
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function callInternalForm(path, formData) {
  const res = await fetch(path, { method: "POST", headers: internalAuthOnlyHeaders(), body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || (typeof data.error === "string" ? data.error : null) || res.statusText;
    throw new Error(msg);
  }
  return data;
}

function appendIngestContextFields(formData) {
  const alarmNo = document.getElementById("ingestAlarmNoInput")?.value.trim();
  const alarmText = document.getElementById("ingestAlarmTextInput")?.value.trim() || "";
  if (alarmNo) formData.append("alarm_no", alarmNo);
  if (alarmText) formData.append("alarm_text", alarmText);
  if (state.ingestCanonicalId) formData.append("canonical_incident_id", state.ingestCanonicalId);
}

function setWorkVoiceHint(text) {
  const el = document.getElementById("ingestVoiceWorkbenchHint");
  if (el) el.textContent = text || "";
}

function getEffectiveIncidentType() {
  const o = (state.incidentTypeOverride || "").trim();
  if (o) return o;
  return state.latestResult?.incident_type || "未知";
}

function buildResultMetaHtml(data) {
  const risk = data.result?.risk_level || "未知";
  const ragEl = document.getElementById("useRag");
  const useRag = ragEl?.checked ?? true;
  const ragStatus = useRag ? "已启用" : "未启用";
  const effType = getEffectiveIncidentType();
  const modelType = data.result?.incident_type || "未知";
  const corrected = Boolean((state.incidentTypeOverride || "").trim());
  const typeCell = corrected
    ? `${esc(effType)} <span class="type-corrected-badge" title="系统判别类别为「${esc(modelType)}」">人工校正</span>`
    : esc(effType);
  return `
      <table class="summary-table">
        <tr>
          <th>警情类型</th>
          <td>${typeCell}</td>
          <th>风险等级</th>
          <td><span class="risk-tag ${riskClass(risk)}">${esc(risk)}</span></td>
        </tr>
        <tr>
          <th>处理耗时</th>
          <td>${esc((Number(data.elapsed) || 0).toFixed(1))} s</td>
          <th>检索增强</th>
          <td>${esc(ragStatus)}</td>
        </tr>
      </table>
    `;
}

function refreshResultMetaDisplay() {
  if (!state.lastAnalyzeResponse) return;
  const el = document.getElementById("resultMeta");
  if (el) el.innerHTML = buildResultMetaHtml(state.lastAnalyzeResponse);
}

function ensureIncidentTypeSelectOptions() {
  const sel = document.getElementById("incidentTypeOverrideSelect");
  if (!sel || sel.dataset.populated === "1") return;
  sel.innerHTML = `<option value="">选择要改成的类别…</option>${INCIDENT_TYPE_OPTIONS.map(
    (t) => `<option value="${esc(t)}">${esc(t)}</option>`
  ).join("")}`;
  sel.dataset.populated = "1";
}

function syncIncidentTypeOverrideSelect() {
  const sel = document.getElementById("incidentTypeOverrideSelect");
  if (!sel) return;
  ensureIncidentTypeSelectOptions();
  const val = (state.incidentTypeOverride || "").trim();
  sel.value = val && INCIDENT_TYPE_OPTIONS.includes(val) ? val : "";
}

function updateIncidentTypeConfirmPanel(data) {
  const panel = document.getElementById("incidentTypeConfirmPanel");
  const hint = document.getElementById("incidentTypeConfirmHint");
  const label = document.getElementById("modelIncidentTypeLabel");
  const adoptBtn = document.getElementById("confirmIncidentTypeBtn");
  if (!panel) return;
  if (!data?.result) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const modelType = data.result.incident_type || "未知";
  if (label) label.textContent = modelType;
  if (adoptBtn) adoptBtn.setAttribute("aria-label", `采纳系统判别类别「${modelType}」`);
  if (hint) hint.textContent = "";
  syncIncidentTypeOverrideSelect();
}

/** 与「开始研判」成功后的界面更新一致（供 /api/analyze 与内部研判结果复用） */
function renderAnalyzeResultFromApi(data) {
  const ragEl = document.getElementById("useRag");
  if (data.use_rag !== undefined && ragEl) {
    ragEl.checked = Boolean(data.use_rag);
  }
  const atEl = document.getElementById("alarmText");
  if (data.alarm_text != null && atEl) {
    atEl.value = String(data.alarm_text);
  }
  const useRag = ragEl?.checked ?? true;
  state.incidentTypeOverride = "";
  state.latestResult = data.result;
  state.latestAnalysisId = data.analysis_id || "";
  state.latestMarkdown = data.markdown || "";
  state.lastAnalyzeResponse = data;

  // 更新顶部三格结果栏
  const typeEl = document.getElementById("resultIncidentType");
  if (typeEl) typeEl.textContent = data.result?.incident_type || "未知";
  const riskEl = document.getElementById("resultRiskLevel");
  if (riskEl) {
    const lvl = data.result?.risk_level || "未知";
    riskEl.textContent = lvl;
    // 移除旧颜色 class，加新的
    riskEl.className = "risk-tag";
    if (lvl === "高" || lvl === "紧急" || lvl === "极高") riskEl.classList.add("risk-tag--高");
    else if (lvl === "中" || lvl === "较大") riskEl.classList.add("risk-tag--中");
    else if (lvl === "低" || lvl === "一般") riskEl.classList.add("risk-tag--低");
  }
  const durEl = document.getElementById("resultDuration");
  if (durEl) durEl.textContent = data.elapsed != null ? `${Number(data.elapsed).toFixed(1)}s` : "—";

  // 渲染 AI 研判卡片
  const card = document.getElementById("analyzeCard");
  if (card) {
    card.hidden = false;
    const idEl = document.getElementById("cardAnalysisId");
    if (idEl) idEl.textContent = data.analysis_id ? `#${data.analysis_id}` : "";
    const conf = data.result?.analysis_confidence ?? 0;
    const fillEl = document.getElementById("cardConfFill");
    if (fillEl) fillEl.style.width = `${conf}%`;
    const pctEl = document.getElementById("cardConfPct");
    if (pctEl) pctEl.textContent = `${conf}%`;
    const rationEl = document.getElementById("cardConfRation");
    if (rationEl) rationEl.textContent = data.result?.confidence_rationale || "";
    const ki = data.result?.key_info || {};
    document.getElementById("cardKeyInfo").innerHTML =
      `<span class="analyze-card__keyinfo-item"><span class="ki-label">地点</span>${ki.location || "未知"}</span>` +
      `<span class="analyze-card__keyinfo-item"><span class="ki-label">人数</span>${ki.persons_involved || "未知"}</span>` +
      `<span class="analyze-card__keyinfo-item"><span class="ki-label">敏感</span>${ki.time_sensitivity || "未知"}</span>` +
      `<span class="analyze-card__keyinfo-item"><span class="ki-label">武器</span>${ki.has_weapon || "未知"}</span>`;
    const stepsEl = document.getElementById("cardSteps");
    if (stepsEl) {
      const steps = data.disposal_nav?.steps || [];
      stepsEl.innerHTML = steps.map(s =>
        `<span class="analyze-card__step">` +
        `<span class="analyze-card__step-num">${s.id}</span>` +
        `<span class="analyze-card__step-title">${s.title}</span>` +
        `</span>`
      ).join("");
    }
  }

  // 保留 resultMeta 更新逻辑（tech-route 页面用）
  if (document.getElementById("resultMeta")) document.getElementById("resultMeta").innerHTML = buildResultMetaHtml(data);
  setText("summaryBox", data.result?.summary || "暂无摘要");
  const sug = data.result?.disposal_suggestion;
  const sugEl = document.getElementById("suggestionBox");
  if (sugEl) {
    sugEl.textContent = sug && String(sug).trim() ? sug : "暂无。";
    sugEl.classList.toggle("prose--muted", !(sug && String(sug).trim()));
  }
  setText("lawBox", data.result?.law_reference || "暂无");
  renderKeyInfo(data.result || {});
  renderOfficerBrief(data.officer_brief || null);
  mergeBukongFromAnalyze(data);
  void loadWorkbenchBukongSnapshot().then(() => syncWorkBukongSectionVisibility());
  syncWorkBukongSectionVisibility();
  updateIncidentTypeConfirmPanel(data);
  revealWorkbenchResults({ scroll: true });
  updateWorkbenchResultsToggleHint();
}

function workbenchResultsPanelContainsId(fragmentId) {
  if (!fragmentId) return false;
  const el = document.getElementById(fragmentId);
  return Boolean(el && el.closest("#workbenchResultsPanel"));
}

function updateWorkbenchResultsToggleHint() {
  const el = document.getElementById("workbenchResultsToggleHint");
  if (!el) return;
  el.textContent = state.latestResult
    ? "已有研判结果，可展开查看或收起；新研判完成后会自动展开至此。"
    : "摘要、关键信息、布控与导出均在此区域内；默认收起以便专注输入。";
}

function revealWorkbenchResults({ scroll = false } = {}) {
  const panel = document.getElementById("workbenchResultsPanel");
  const btn = document.getElementById("workbenchToggleResultsBtn");
  if (!panel) return;
  const wasHidden = panel.hidden;
  panel.hidden = false;
  if (btn) {
    btn.textContent = "收起研判区";
    btn.setAttribute("aria-expanded", "true");
  }
  if (scroll) {
    requestAnimationFrame(() => {
      const target = document.getElementById("work-review-heading") || panel;
      if (target) scrollDocsAnchorIntoView(target, "smooth");
    });
  } else if (wasHidden) {
    requestAnimationFrame(() => {
      const target = document.getElementById("work-review-heading") || panel;
      if (target) scrollDocsAnchorIntoView(target, "auto");
    });
  }
  if (typeof window.pliceOfficerBriefMapUpdateSize === "function") {
    requestAnimationFrame(() => {
      window.pliceOfficerBriefMapUpdateSize();
      setTimeout(() => window.pliceOfficerBriefMapUpdateSize(), 220);
    });
  }
}

function collapseWorkbenchResults() {
  const panel = document.getElementById("workbenchResultsPanel");
  const btn = document.getElementById("workbenchToggleResultsBtn");
  if (panel) {
    panel.hidden = true;
    const card = document.getElementById("analyzeCard");
    if (card) card.hidden = true;
  }
  if (btn) {
    btn.textContent = "查看研判结果与复核";
    btn.setAttribute("aria-expanded", "false");
  }
}

function toggleWorkbenchResultsPanel() {
  const panel = document.getElementById("workbenchResultsPanel");
  if (!panel) return;
  if (panel.hidden) revealWorkbenchResults({ scroll: true });
  else collapseWorkbenchResults();
}

function initWorkbenchResultsToggle() {
  const btn = document.getElementById("workbenchToggleResultsBtn");
  if (!btn || btn.dataset.resultsToggleBound === "1") return;
  btn.dataset.resultsToggleBound = "1";
  btn.addEventListener("click", () => toggleWorkbenchResultsPanel());
}

function syncWorkBukongSectionVisibility() {
  const wrap = document.getElementById("workBukongSection");
  if (!wrap) return;
  const hasAnalysis = Boolean(state.latestAnalysisId || state.latestResult);
  const box = document.getElementById("bukongBox");
  let hasBukongSurface = false;
  if (box && !box.hidden) {
    const t = (box.textContent || "").trim();
    const h = (box.innerHTML || "").trim();
    hasBukongSurface = Boolean(t || h);
  }
  wrap.hidden = !(hasAnalysis || hasBukongSurface);
}



function setWorkBukongHint(text) {
  const el = document.getElementById("workBukongHint");
  if (el) el.textContent = text || "";
}

function applyBukongInputsToForm(inputs) {
  const ins = inputs || {};
  const bg = document.getElementById("incidentBg");
  const sd = document.getElementById("suspectDesc");
  if (bg && ins.incident_bg != null) bg.value = ins.incident_bg;
  if (sd && ins.suspect_desc != null) sd.value = ins.suspect_desc;
}

/** 手动重算布控后，把「研判部分」与最新布控再拼成主下载用 Markdown */
function mergeLatestMarkdownWithBukong(bukongMd) {
  const b = (bukongMd || "").trim();
  const sep = "\n\n---\n\n";
  const cur = state.latestMarkdown || "";
  const base = cur.includes(sep) ? cur.split(sep)[0] : cur;
  const baseTrim = base.replace(/\s+$/, "");
  state.latestMarkdown = b ? (baseTrim ? `${baseTrim}${sep}${b}` : b) : baseTrim;
}

function clearWorkbenchBukongView() {
  const el = document.getElementById("bukongBox");
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
  el.innerHTML = "";
  el.className = "box bukong-preview";
}

/** 纯文本提示（加载中、校验错误等），避免 innerHTML */
function setWorkbenchBukongPlain(text) {
  const el = document.getElementById("bukongBox");
  if (!el) return;
  const t = text == null ? "" : String(text);
  if (!t.trim()) {
    clearWorkbenchBukongView();
    return;
  }
  el.className = "box bukong-preview bukong-preview--plain";
  el.textContent = t;
  el.hidden = false;
}

function bukongRenderUl(items, ulClass = "bukong-preview__ul") {
  const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim()) : [];
  if (!arr.length) return '<p class="bukong-preview__empty">暂无。</p>';
  return `<ul class="${ulClass}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

/** 封控点位：序号 + 地点条，便于按点布警 */
function bukongRenderCheckpoints(items) {
  const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim()) : [];
  if (!arr.length) {
    return '<p class="bukong-preview__empty">暂无。请结合地图与辖区预案自行划定卡口、视频与巡逻路线。</p>';
  }
  return `<ul class="bukong-preview__checkpoints" role="list">
    ${arr
      .map(
        (x, i) => `<li class="bukong-preview__checkpoint">
      <span class="bukong-preview__checkpoint-no" aria-hidden="true">${i + 1}</span>
      <span class="bukong-preview__checkpoint-txt">${esc(x)}</span>
    </li>`
      )
      .join("")}
  </ul>`;
}

/** 盘查要点：有序步骤，突出「先做什么、再查什么」 */
function bukongRenderInspectionSteps(items) {
  const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim()) : [];
  if (!arr.length) return '<p class="bukong-preview__empty">暂无。</p>';
  return `<ol class="bukong-preview__inspect-steps">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
}

function bukongPreviewCard(stepNum, tag, title, modifierClass, bodyHtml) {
  const mod = modifierClass ? ` ${modifierClass}` : "";
  return `<section class="bukong-preview__card${mod}">
    <header class="bukong-preview__card-head">
      <span class="bukong-preview__step" aria-hidden="true">${stepNum}</span>
      <span class="bukong-preview__tag">${esc(tag)}</span>
      <h4 class="bukong-preview__card-title">${esc(title)}</h4>
    </header>
    <div class="bukong-preview__card-body">${bodyHtml}</div>
  </section>`;
}

function bukongPlanToPreviewHtml(plan) {
  const notice = String(plan.dispatch_notice || "").trim();
  const suspect = String(plan.suspect_profile || "").trim() || "—";
  const heroBody = `<p class="bukong-preview__hero-lead">按序执行：<strong>封控点位</strong>布警 → <strong>盘查要点</strong>控人控物 → <strong>通讯通报</strong>同步各组；文末处理<strong>缺失信息</strong>与<strong>指挥复核</strong>。</p>`;
  const cards = [
    bukongPreviewCard(1, "识别", "嫌疑人特征摘要", "bukong-preview__card--object", `<p class="bukong-preview__lead">${esc(suspect)}</p>`),
    bukongPreviewCard(
      2,
      "封控",
      "布控重点点位",
      "bukong-preview__card--points",
      `<p class="bukong-preview__hintline">卡口 / 重点部位：优先视频巡查与机动警力叠加。</p>${bukongRenderCheckpoints(plan.key_checkpoints)}`
    ),
    bukongPreviewCard(
      3,
      "勤务",
      "盘查要点",
      "bukong-preview__card--inspect",
      `<p class="bukong-preview__hintline">现场动作顺序（对人对车对物）：</p>${bukongRenderInspectionSteps(plan.inspection_points)}`
    ),
    bukongPreviewCard(
      4,
      "电台",
      "通讯通报建议",
      "bukong-preview__card--radio",
      `<p class="bukong-preview__broadcast" role="text">${esc(notice || "—")}</p><p class="bukong-preview__microhint">可直接用于电台 / 对讲原文通报（视情脱敏）。</p>`
    ),
    bukongPreviewCard(
      5,
      "缺口",
      "待补全信息",
      "bukong-preview__card--gap",
      `<p class="bukong-preview__hintline">下列要素影响布控精度，请接警 / 现场同步核实：</p>${bukongRenderUl(plan.missing_info, "bukong-preview__ul bukong-preview__ul--checks")}`
    ),
    bukongPreviewCard(
      6,
      "复核",
      "指挥与人工复核建议",
      "bukong-preview__card--review",
      `<p class="bukong-preview__hintline">队领导 / 指挥台在收束前建议逐项确认：</p>${bukongRenderUl(plan.review_tips, "bukong-preview__ul bukong-preview__ul--checks")}`
    ),
  ].join("");
  return `<article class="bukong-preview__article">
    <header class="bukong-preview__hero">
      <div class="bukong-preview__hero-top">
        <span class="bukong-preview__hero-kicker">勤务执行卡</span>
        <span class="bukong-preview__hero-badge">与研判同步生成</span>
      </div>
      <h3 class="bukong-preview__hero-title">目标布控方案</h3>
      ${heroBody}
    </header>
    <div class="bukong-preview__grid">${cards}</div>
  </article>`;
}

/** 无 plan 时（如旧会话）：解析新版 Markdown（标题 / 列表 / 有序步骤 / 引用通报）为只读 HTML */
function bukongMarkdownFallbackHtml(md) {
  const lines = String(md).split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;
  const quoteLines = [];

  const closeUl = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
  };
  const closeOl = () => {
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };
  const flushQuote = () => {
    if (!quoteLines.length) return;
    const text = quoteLines.map((l) => l.replace(/^>\s?/, "").trimEnd()).join("\n");
    html += `<p class="bukong-preview__broadcast">${esc(text)}</p>`;
    quoteLines.length = 0;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();
    if (!t) {
      closeUl();
      closeOl();
      flushQuote();
      continue;
    }
    if (/^>/.test(t)) {
      closeUl();
      closeOl();
      quoteLines.push(t);
      continue;
    }
    flushQuote();

    if (t.startsWith("# ") && !t.startsWith("## ")) {
      closeUl();
      closeOl();
      html += `<h3 class="bukong-preview__title">${esc(t.slice(2).trim())}</h3>`;
    } else if (t.startsWith("## ")) {
      closeUl();
      closeOl();
      html += `<h4 class="bukong-preview__h">${esc(t.slice(3).trim())}</h4>`;
    } else if (t.startsWith("- ")) {
      closeOl();
      if (!inUl) {
        html += '<ul class="bukong-preview__ul">';
        inUl = true;
      }
      let item = t.slice(2).replace(/^\[[ xX]\]\s*/, "").replace(/\*\*/g, "");
      html += `<li>${esc(item)}</li>`;
    } else if (/^\d+\.\s/.test(t)) {
      closeUl();
      if (!inOl) {
        html += '<ol class="bukong-preview__inspect-steps">';
        inOl = true;
      }
      html += `<li>${esc(t.replace(/^\d+\.\s+/, ""))}</li>`;
    } else if (t.startsWith("_") && t.endsWith("_") && t.length > 2) {
      closeUl();
      closeOl();
      html += `<p class="bukong-preview__hintline">${esc(t.replace(/^_|_$/g, ""))}</p>`;
    } else if (t === "---") {
      /* 与研判主文拼接分隔线 */
    } else {
      closeUl();
      closeOl();
      const plain = t.replace(/\*\*(.+?)\*\*/g, "$1");
      html += `<p class="bukong-preview__p">${esc(plain)}</p>`;
    }
  }
  closeUl();
  closeOl();
  flushQuote();
  return `<article class="bukong-preview__article">${html}</article>`;
}

function setWorkbenchBukongPreview(plan, markdown) {
  const el = document.getElementById("bukongBox");
  if (!el) return;
  const md = (markdown || "").trim();
  if (!md && !(plan && typeof plan === "object")) {
    clearWorkbenchBukongView();
    return;
  }
  el.className = "box bukong-preview";
  el.innerHTML =
    plan && typeof plan === "object" ? bukongPlanToPreviewHtml(plan) : bukongMarkdownFallbackHtml(md || "");
  el.hidden = false;
}

function mergeBukongFromAnalyze(data) {
  const bk = data.bukong;
  if (!bk) {
    setWorkBukongHint("");
    state.latestBukongMarkdown = "";
    state.latestBukongPlan = null;
    clearWorkbenchBukongView();
    setWorkbenchBukongDownloadEnabled(false);
    syncWorkBukongSectionVisibility();
    return;
  }
  applyBukongInputsToForm(bk.inputs);
  const md = (bk.markdown && String(bk.markdown).trim()) || "";
  const plan = bk.plan && typeof bk.plan === "object" ? bk.plan : null;
  if (md) {
    state.latestBukongMarkdown = md;
    state.latestBukongPlan = plan;
    setWorkbenchBukongPreview(plan, md);
    setWorkbenchBukongDownloadEnabled(true);
    setWorkBukongHint("");
    syncWorkBukongSectionVisibility();
    return;
  }
  state.latestBukongMarkdown = "";
  state.latestBukongPlan = null;
  setWorkbenchBukongDownloadEnabled(false);
  if (bk.error) {
    setWorkbenchBukongPlain(`布控未生成：${bk.error}`);
  } else {
    clearWorkbenchBukongView();
  }
  setWorkBukongHint("");
  syncWorkBukongSectionVisibility();
}

const BUKONG_EXAMPLES = [
  {
    bg: "刚才三里屯附近发生抢包案，被害人钱包被抢。",
    desc: "男性，约30岁，身高175左右，黑色羽绒服，戴黑色帽子，骑电动车往东边跑了。",
  },
  {
    bg: "便利店刚发生持械抢劫，嫌疑人逃离现场。",
    desc: "男，约20多岁，口罩遮脸，手持小刀，穿灰色连帽衫，朝地铁站方向跑。",
  },
  {
    bg: "商场内疑似扒窃，被害人发现手机不见了。",
    desc: "一名女性，短发，背红色双肩包，穿白色运动鞋，频繁贴近人群。",
  },
];

function setWorkbenchBukongDownloadEnabled(enabled) {
  const btn = document.getElementById("downloadBukongBtn");
  if (btn) btn.disabled = !enabled;
}

function applySessionBukongToWorkbench(d) {
  const ins = (d.bukong && d.bukong.inputs) || {};
  applyBukongInputsToForm(ins);
  const md = (d.bukong && d.bukong.markdown) || "";
  const plan = d.bukong && d.bukong.plan && typeof d.bukong.plan === "object" ? d.bukong.plan : null;
  if (md.trim()) {
    state.latestBukongMarkdown = md;
    state.latestBukongPlan = plan;
    setWorkbenchBukongPreview(plan, md);
    setWorkbenchBukongDownloadEnabled(true);
  } else if (d.bukong && d.bukong.error) {
    state.latestBukongMarkdown = "";
    state.latestBukongPlan = null;
    setWorkbenchBukongPlain(`布控：${d.bukong.error}`);
    setWorkbenchBukongDownloadEnabled(false);
  } else {
    state.latestBukongMarkdown = "";
    state.latestBukongPlan = null;
    clearWorkbenchBukongView();
    setWorkbenchBukongDownloadEnabled(false);
  }
  syncWorkBukongSectionVisibility();
  if (d.officer_brief) renderOfficerBrief(d.officer_brief);
}

async function loadWorkbenchBukongSnapshot() {
  if (!document.getElementById("bukongBtn")) return;
  try {
    const d = await callApi("/api/session-snapshot");
    applySessionBukongToWorkbench(d);
  } catch {
    /* ignore */
  }
  syncWorkBukongSectionVisibility();
}

function initWorkbenchBukong() {
  if (!document.getElementById("bukongBtn")) return;
  document.querySelectorAll(".js-bukong-ex").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.ex);
      const ex = BUKONG_EXAMPLES[i];
      if (!ex) return;
      const bg = document.getElementById("incidentBg");
      const sd = document.getElementById("suspectDesc");
      if (bg) bg.value = ex.bg;
      if (sd) sd.value = ex.desc;
    });
  });
  document.getElementById("bukongBtn").addEventListener("click", async () => {
    const incidentBg = document.getElementById("incidentBg").value.trim();
    const suspectDesc = document.getElementById("suspectDesc").value.trim();
    if (!incidentBg && !suspectDesc) {
      setWorkbenchBukongPlain("请先完成研判以自动带出案情与特征，或至少填写其中一项后再生成。");
      return;
    }
    setButtonLoading("bukongBtn", true, "生成中…");
    setWorkbenchBukongPlain("生成中…");
    try {
      const data = await callApi("/api/bukong", {
        method: "POST",
        body: JSON.stringify({ incident_bg: incidentBg, suspect_desc: suspectDesc }),
      });
      const md = data.markdown || "";
      const plan = data.plan && typeof data.plan === "object" ? data.plan : null;
      state.latestBukongMarkdown = md;
      state.latestBukongPlan = plan;
      setWorkbenchBukongPreview(plan, md || "暂无布控结果");
      setWorkbenchBukongDownloadEnabled(Boolean(md.trim()));
      mergeLatestMarkdownWithBukong(md);
      await loadWorkbenchBukongSnapshot();
      await refreshToolbarMetrics();
    } catch (err) {
      setWorkbenchBukongPlain(err.message);
      setWorkbenchBukongDownloadEnabled(false);
    } finally {
      setButtonLoading("bukongBtn", false, "按下方要素重新生成布控");
    }
  });
  document.getElementById("downloadBukongBtn").addEventListener("click", () => {
    const text = (state.latestBukongMarkdown || "").trim();
    if (!text) {
      setWorkbenchBukongPlain("暂无可下载。");
      return;
    }
    downloadText("bukong_plan.md", text, "text/markdown;charset=utf-8");
  });
}

// setText, esc 已移至 utils.js

function setButtonLoading(id, loading, loadingText) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }
}

function downloadText(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applyTheme(theme) {
  const body = document.body;
  const themeText = document.getElementById("themeToggleText");
  const themeIcon = document.getElementById("themeToggleIcon");
  const themeBtn = document.getElementById("themeToggleBtn");
  const nextTheme = "light";
  body.dataset.theme = nextTheme;
  if (themeText) themeText.textContent = "浅色";
  if (themeIcon) themeIcon.textContent = "◑";
  if (themeBtn) {
    themeBtn.setAttribute("aria-pressed", "true");
    themeBtn.setAttribute("title", "当前浅色主题");
  }
}

function initThemeToggle() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme || "light");
  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    // 始终浅色，切换无意义
    applyTheme("light");
  });
}

function initOfficerBadgeLogin() {
  const form = document.getElementById("officerBadgeForm");
  const input = document.getElementById("officerBadgeInput");
  const display = document.getElementById("officerBadgeDisplay");
  const logoutBtn = document.getElementById("officerLogoutBtn");
  if (!form || !input) return;
  const key = "plice-officer-badge";
  const sync = (badge) => {
    const v = (badge || "").trim();
    const loggedIn = Boolean(v);
    form.hidden = loggedIn;
    if (display) {
      display.hidden = !loggedIn;
      display.textContent = loggedIn ? `警号 ${v}` : "";
    }
    if (logoutBtn) logoutBtn.hidden = !loggedIn;
  };
  try {
    const saved = localStorage.getItem(key) || "";
    if (saved) input.value = saved;
    sync(saved);
  } catch {
    /* ignore */
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const badge = (input.value || "").trim();
    if (!badge) return;
    try {
      localStorage.setItem(key, badge);
    } catch {
      /* ignore */
    }
    sync(badge);
  });
  logoutBtn?.addEventListener("click", () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    input.value = "";
    sync("");
    input.focus();
  });
}

function renderHistory(history) {
  const container = document.getElementById("historyList");
  if (!history || history.length === 0) {
    container.textContent = "无历史";
    return;
  }
  container.innerHTML = "";
  [...history].reverse().forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "history-item";
    btn.innerHTML = `
      <span class="history-item__type">${esc(item.incident_type || "未知")}</span>
      <span class="history-item__time">${esc(item.time || "")}</span>
      <span class="history-item__risk"><span class="risk-pill ${riskClass(item.risk_level)}">${esc(
      item.risk_level || "未知"
    )}</span></span>
    `;
    btn.addEventListener("click", async () => {
      if (!item.id) {
        document.getElementById("alarmText").value = item.original_text || "";
        setText("analyzeHint", "已回填文本（无记录 id，请重新研判）");
        return;
      }
      setText("analyzeHint", "正在恢复…");
      try {
        const data = await callApi(`/api/analysis/${encodeURIComponent(item.id)}`);
        renderAnalyzeResultFromApi(data);
        await refreshHistory();
        void loadWorkbenchBukongSnapshot();
        refreshToolbarMetrics();
        setText("analyzeHint", "已恢复该条研判与布控");
      } catch (e) {
        setText("analyzeHint", e.message || String(e));
      }
    });
    container.appendChild(btn);
  });
}

// riskClass 已移至 utils.js

function renderKeyInfo(result) {
  const keyInfo = result.key_info || {};
  const fields = [
    ["发案地点", keyInfo.location || "未知"],
    ["涉事人数", keyInfo.persons_involved || "未知"],
    ["涉及武器", keyInfo.has_weapon || "未知"],
    ["人员受伤", keyInfo.injuries_reported || "未知"],
    ["时间紧迫", keyInfo.time_sensitivity || "未知"],
  ];
  const box = document.getElementById("keyInfoBox");
  box.innerHTML = `
    <div class="block-title">关键信息提取</div>
    <table class="summary-table">
      ${fields.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
    </table>
  `;

  const missing = [];
  if (!keyInfo.location || keyInfo.location === "未知") missing.push("发案地点");
  if (!keyInfo.persons_involved || keyInfo.persons_involved === "未知") missing.push("涉事人数");
  if (!keyInfo.has_weapon || keyInfo.has_weapon === "未知") missing.push("是否涉及武器");
  setText("missingHint", missing.length ? `关键信息缺失：${missing.join("、")}` : "");
}

function formatOfficerBriefCount(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

function renderOfficerBrief(ob) {
  const panel = document.getElementById("officerBriefPanel");
  if (!panel) return;
  if (typeof window.pliceDestroyOfficerBriefMap === "function") {
    window.pliceDestroyOfficerBriefMap();
  }
  if (!ob || typeof ob !== "object") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const hist = Array.isArray(ob.same_address_history) ? ob.same_address_history : [];
  const hr = ob.high_risk_nearby && typeof ob.high_risk_nearby === "object" ? ob.high_risk_nearby : {};
  const hotspots = Array.isArray(hr.hotspots) ? hr.hotspots : [];
  const pr = hr.personnel_risk && typeof hr.personnel_risk === "object" ? hr.personnel_risk : {};
  const equip = Array.isArray(ob.equipment_checklist) ? ob.equipment_checklist : [];
  const radiusStr = hr.radius_hint_m != null && hr.radius_hint_m !== "" ? String(hr.radius_hint_m) : "—";
  const nHot = hotspots.length;
  const taggedStr = formatOfficerBriefCount(pr.tagged_nearby);
  const fugStr = formatOfficerBriefCount(pr.fugitive_watch_hit);
  const riskFoot =
    (pr.note ? String(pr.note).trim() : "「重点人」为半径内登记/布控命中演示计数。") + " 非实时地图。";
  const riskLead =
    nHot > 0
      ? `约 <strong>${esc(radiusStr)}</strong> m 范围；地图标出 <strong>${nHot}</strong> 处关注点，点击橙点查看。`
      : `约 <strong>${esc(radiusStr)}</strong> m 检索范围；本次<strong>无</strong>关注点标注。`;

  const mapFeatures = [];
  for (let hi = 0; hi < hist.length; hi += 1) {
    const r = hist[hi];
    const lon = Number(r.lon);
    const lat = Number(r.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const title = `${r.category || "历史警情"} · ${r.alarm_no || "—"}`;
    const detailHtml = `<dl class="officer-brief-map-dl">
      <dt>警情号</dt><dd>${esc(r.alarm_no || "—")}</dd>
      <dt>时间</dt><dd>${esc(r.received_at || "—")}</dd>
      <dt>类别</dt><dd>${esc(r.category || "—")}</dd>
      <dt>地点</dt><dd>${esc(r.location_text || "—")}</dd>
      <dt>风险</dt><dd>${esc(r.risk_level || "—")}</dd>
      <dt>摘要</dt><dd>${esc(r.summary || "—")}</dd>
    </dl>`;
    mapFeatures.push({ kind: "history", lon, lat, title, detailHtml });
  }
  for (let hi = 0; hi < hotspots.length; hi += 1) {
    const h = hotspots[hi];
    const lon = Number(h.lon);
    const lat = Number(h.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const title = h.name || "关注点";
    const detailHtml = `<dl class="officer-brief-map-dl">
      <dt>名称</dt><dd>${esc(h.name || "—")}</dd>
      <dt>级别</dt><dd>${esc(h.level || "—")}</dd>
      <dt>距离参考</dt><dd>约 ${esc(String(h.distance_hint_m ?? "—"))} m</dd>
      <dt>说明</dt><dd>${esc(h.note || "—")}</dd>
    </dl>`;
    mapFeatures.push({ kind: "hotspot", lon, lat, title, detailHtml });
  }

  const equipRows = equip.length
    ? equip
        .map(
          (e) => `<tr><td>${esc(e.item || "—")}</td><td>${esc(e.level || "—")}</td><td>${esc(e.reason || "—")}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="officer-brief-panel__empty">暂无清单。</td></tr>`;

  const mapHint =
    hist.length === 0 && hotspots.length === 0
      ? "暂无历史相似记录与关注点；坐标为演示偏移，专网请对接实库与真实坐标。"
      : "坐标为演示用近似位置；点击圆点查看该条详情。";

  panel.innerHTML = `
    <div class="block-title" id="work-officer-brief-heading">出警前简报</div>
    <p class="hint muted officer-brief-panel__disclaimer">${esc(ob.disclaimer || "")}</p>
    <p class="officer-brief-panel__focus"><span class="officer-brief-panel__k">检索焦点</span> ${esc(
      ob.location_focus || "—"
    )}</p>
    <p class="hint muted officer-brief-panel__loc">${esc(ob.location_detail || "")}</p>

    <h4 class="officer-brief-panel__sub">态势示意（地图）</h4>
    <p class="hint muted officer-brief-map-hint">${esc(mapHint)} 图例：<span class="officer-brief-map-legend__dot officer-brief-map-legend__dot--hist">●</span> 历史警情 <span class="officer-brief-map-legend__dot officer-brief-map-legend__dot--hot">●</span> 关注点</p>
    <div class="officer-brief-map-layout">
      <div id="officerBriefMap" class="officer-brief-map" role="application" aria-label="简报地图"></div>
      <aside id="officerBriefMapDetail" class="officer-brief-map-detail" hidden>
        <div class="officer-brief-map-detail__title" id="officerBriefMapDetailTitle"></div>
        <div class="officer-brief-map-detail__body" id="officerBriefMapDetailBody"></div>
      </aside>
    </div>

    <h4 class="officer-brief-panel__sub">周边风险摘要（演示）</h4>
    <div class="officer-brief-panel__risk-card" role="region" aria-label="周边风险摘要">
      <div class="officer-brief-panel__risk-metrics">
        <div class="officer-brief-panel__risk-metric">
          <span class="officer-brief-panel__risk-metric-label">重点人 / 布控命中</span>
          <span class="officer-brief-panel__risk-metric-val">${esc(taggedStr)}</span>
        </div>
        <div class="officer-brief-panel__risk-metric">
          <span class="officer-brief-panel__risk-metric-label">在逃关注命中</span>
          <span class="officer-brief-panel__risk-metric-val">${esc(fugStr)}</span>
        </div>
      </div>
      <p class="officer-brief-panel__risk-lead">${riskLead}</p>
      <p class="hint muted officer-brief-panel__risk-foot">${esc(riskFoot)}</p>
    </div>

    <h4 class="officer-brief-panel__sub">建议携带装备清单</h4>
    <div class="officer-brief-panel__scroll">
      <table class="summary-table officer-brief-panel__table">
        <thead><tr><th>装备</th><th>级别</th><th>说明</th></tr></thead>
        <tbody>${equipRows}</tbody>
      </table>
    </div>
  `;
  panel.hidden = false;

  requestAnimationFrame(() => {
    if (typeof window.pliceMountOfficerBriefMap === "function") {
      window.pliceMountOfficerBriefMap({
        mapTargetId: "officerBriefMap",
        detailPanelId: "officerBriefMapDetail",
        detailTitleId: "officerBriefMapDetailTitle",
        detailBodyId: "officerBriefMapDetailBody",
        features: mapFeatures,
        emptyMessage:
          hist.length === 0 && hotspots.length === 0
            ? "暂无历史相似记录与关注点可标注。"
            : "",
      });
    }
    requestAnimationFrame(() => {
      if (typeof window.pliceOfficerBriefMapUpdateSize === "function") {
        window.pliceOfficerBriefMapUpdateSize();
      }
    });
  });
}

function applyToolbarFromPerformance(data) {
  const perf = data.performance || {};
  const risk = data.risk_counts || {};
  const high = (Number(risk["紧急"]) || 0) + (Number(risk["高"]) || 0);
  setText("metricTotal", String(perf.total ?? 0));
  setText("metricHigh", String(high));
}

async function refreshToolbarMetrics() {
  try {
    const data = await callApi("/api/performance");
    applyToolbarFromPerformance(data);
    const PR = window.plicePerfRender;
    if (PR) {
      if (document.getElementById("perfMeta")) {
        PR.applyPerformanceCoreDom(data);
      }
    }
  } catch (err) {
    setText("metricTotal", "—");
    setText("metricHigh", "—");
    window.plicePerfRender?.applyPerformanceDomError(err);
  }
}

/** 文档站 sticky 顶栏实际高度 + 空隙 */
function getDocsAnchorTopPadding() {
  const header = document.querySelector("body.docs-shell .site-header");
  if (!header) return 132;
  const h = Math.ceil(header.getBoundingClientRect().height);
  return Math.max(h + 28, 112);
}

function scrollDocsAnchorIntoView(element, behavior = "smooth") {
  if (!element) return;
  if (!document.body.classList.contains("docs-shell")) {
    element.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const pad = getDocsAnchorTopPadding();
  const top = window.scrollY + element.getBoundingClientRect().top - pad;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

function updateAsidePanelActive(panel, fragmentWithoutHash) {
  if (!panel) return;
  const links = [...panel.querySelectorAll("a.doc-aside__link")];
  if (!links.length) return;
  const frag = (fragmentWithoutHash || "").trim();
  const matched = links.find((ln) => (ln.getAttribute("href") || "").replace(/^#/, "") === frag) || links[0];
  links.forEach((ln) => ln.classList.toggle("doc-aside__link--active", ln === matched));
}

/** 将任意锚点 id 映射到左侧主导航中唯一的高亮项（子区块归入「智能分析」等） */
function commandNavTargetFromFragment(fragmentId) {
  const id = (fragmentId || "").trim();
  if (!id) return "work-overview";
  if (id === "command-situation-anchor") return "command-situation-anchor";
  if (
    id === "work-review-heading" ||
    id.startsWith("work-review-block") ||
    id === "work-bukong-adjust"
  ) {
    return "work-review-heading";
  }
  return "work-overview";
}

function updateCommandNavActive(fragmentId) {
  const nav = document.querySelector(".command-app-nav:not(.command-app-nav--footer)");
  if (!nav) return;
  const targetHref = commandNavTargetFromFragment(fragmentId);
  const links = [...nav.querySelectorAll('a.command-app-nav__link[href^="#"]')];
  links.forEach((ln) => {
    const href = (ln.getAttribute("href") || "").replace(/^#/, "");
    const isActive = href === targetHref;
    ln.classList.toggle("command-app-nav__link--active", isActive);
    if (isActive) ln.setAttribute("aria-current", "page");
    else ln.removeAttribute("aria-current");
  });
}

function navigateWorkbenchInPageHash(href, { panel, smooth = true } = {}) {
  if (!href.startsWith("#")) return;
  const id = href.slice(1);
  const target = document.getElementById(id);
  if (workbenchResultsPanelContainsId(id)) {
    revealWorkbenchResults({ scroll: false });
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (target) scrollDocsAnchorIntoView(target, smooth ? "smooth" : "auto");
      else {
        const main = document.querySelector(".doc-main");
        if (main) main.scrollTop = 0;
      }
    });
  });
  if (window.location.hash !== href) history.replaceState(null, "", href);
  if (panel) updateAsidePanelActive(panel, id);
  updateCommandNavActive(id);
}

function initWorkbenchInPageNav() {
  const aside = document.querySelector(".doc-aside");
  const panel = aside?.querySelector(".doc-aside-panel");
  const commandNav = document.querySelector(".command-app-nav:not(.command-app-nav--footer)");

  if (aside && panel) {
    aside.addEventListener("click", (e) => {
      const a = e.target.closest("a.doc-aside__link");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#")) return;
      e.preventDefault();
      navigateWorkbenchInPageHash(href, { panel, smooth: true });
    });
  } else if (commandNav) {
    commandNav.addEventListener("click", (e) => {
      const a = e.target.closest('a.command-app-nav__link[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") || "";
      navigateWorkbenchInPageHash(href, { panel: null, smooth: true });
    });
  }

  const raw = (window.location.hash || "").replace(/^#/, "");
  const defaultFrag = "work-overview";
  if (raw && document.getElementById(raw)) {
    if (workbenchResultsPanelContainsId(raw)) {
      revealWorkbenchResults({ scroll: false });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollDocsAnchorIntoView(document.getElementById(raw), "auto");
      });
    });
    if (panel) updateAsidePanelActive(panel, raw);
    updateCommandNavActive(raw);
  } else {
    if (panel) updateAsidePanelActive(panel, defaultFrag);
    updateCommandNavActive(defaultFrag);
  }

  window.addEventListener("hashchange", () => {
    const h = (window.location.hash || "").replace(/^#/, "");
    const t = h && document.getElementById(h);
    if (workbenchResultsPanelContainsId(h)) {
      revealWorkbenchResults({ scroll: false });
    }
    if (t) scrollDocsAnchorIntoView(t, "smooth");
    else {
      const main = document.querySelector(".doc-main");
      if (main) main.scrollTop = 0;
    }
    if (panel) updateAsidePanelActive(panel, h || defaultFrag);
    updateCommandNavActive(h || defaultFrag);
  });
}

async function refreshHistory() {
  try {
    const data = await callApi("/api/history");
    renderHistory(data.history || []);
  } catch (err) {
    setText("historyList", err.message);
  }
  refreshToolbarMetrics();
  void loadWorkbenchBukongSnapshot();
  updateWorkbenchResultsToggleHint();
}

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const alarmText = document.getElementById("alarmText").value.trim();
  const useRag = document.getElementById("useRag").checked;
  if (!alarmText) {
    setText("analyzeHint", "请输入报警内容");
    return;
  }
  setButtonLoading("analyzeBtn", true, "研判中...");
  setText("analyzeHint", "研判中...");
  let elapsed = 0;
  const timerId = setInterval(() => {
    elapsed += 1;
    setText("analyzeHint", `研判中... 已耗时 ${elapsed} 秒`);
  }, 1000);
  try {
    const data = await callApi("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ alarm_text: alarmText, use_rag: useRag }),
    });
    clearInterval(timerId);
    renderAnalyzeResultFromApi(data);
    renderHistory(data.history || []);
    refreshToolbarMetrics();
    setText("analyzeHint", `研判完成，耗时 ${elapsed} 秒`);
  } catch (err) {
    clearInterval(timerId);
    setText("analyzeHint", err.message);
  } finally {
    setButtonLoading("analyzeBtn", false, "开始研判");
  }
});

document.getElementById("saveReviewBtn").addEventListener("click", async () => {
  if (!state.latestResult) {
    setText("reviewHint", "暂无可复核结果");
    return;
  }
  try {
    await callApi("/api/review", {
      method: "POST",
      body: JSON.stringify(buildReviewPayload()),
    });
    setText("reviewHint", "复核结论已保存");
    refreshToolbarMetrics();
  } catch (err) {
    setText("reviewHint", err.message);
  }
});

function getSelectedReviewChoice() {
  return document.querySelector('input[name="reviewChoice"]:checked')?.value || "同意系统结果";
}

function buildReviewPayload() {
  return {
    review_choice: getSelectedReviewChoice(),
    review_note: document.getElementById("reviewNote").value.trim(),
    analysis_id: state.latestAnalysisId,
    incident_type_override: (state.incidentTypeOverride || "").trim(),
  };
}

document.getElementById("exampleSelect").addEventListener("change", (e) => {
  if (e.target.value) {
    document.getElementById("alarmText").value = e.target.value;
  }
});

document.getElementById("downloadMdBtn").addEventListener("click", () => {
  if (!state.latestMarkdown) {
    setText("analyzeHint", "暂无可下载的研判结果");
    return;
  }
  downloadText("incident_analysis.md", state.latestMarkdown, "text/markdown;charset=utf-8");
});

document.getElementById("downloadJsonBtn")?.addEventListener("click", () => {
  if (!state.latestResult) {
    setText("reviewHint", "暂无可下载的复核记录");
    return;
  }
  const payload = {
    ...buildReviewPayload(),
    incident_type: getEffectiveIncidentType(),
    incident_type_model: state.latestResult.incident_type || "未知",
    risk_level: state.latestResult.risk_level || "未知",
  };
  downloadText("review_record.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
});

async function pollMediaPipelineJob(pipelineJobId, onProgress) {
  const pj = pipelineJobId;
  for (let i = 0; i < 400; i += 1) {
    await new Promise((r) => setTimeout(r, 300));
    const st = await callInternalApi(`/internal/v1/media-jobs/${pj}`);
    if (st.status === "completed") {
      return st;
    }
    if (st.status === "failed") {
      throw new Error(st.error || "媒体处理失败");
    }
    if (onProgress) onProgress(i, 400, "媒体处理中…");
  }
  throw new Error("媒体处理轮询超时");
}

async function pollInternalAnalyzeJob(jobId, onProgress) {
  for (let i = 0; i < 240; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const st = await callInternalApi(`/internal/v1/jobs/${jobId}`);
    if (st.status === "completed") return st;
    if (st.status === "failed") throw new Error(st.error || "研判失败");
    if (onProgress) onProgress(i, 240, "AI研判中…");
  }
  throw new Error("研判轮询超时");
}

async function applyLatestInternalAnalysis(canonicalId) {
  const j = await callInternalApi(`/internal/v1/incidents/${canonicalId}/analyze/latest`);
  const la = j.analysis;
  if (!la || !la.result) {
    setWorkVoiceHint("无研判结果；检查内部 API。");
    return;
  }
  const buk =
    la.bukong_markdown && String(la.bukong_markdown).trim()
      ? {
          markdown: la.bukong_markdown,
          plan: la.bukong_plan,
          error: la.bukong_error,
          inputs: {
            incident_bg: la.bukong_incident_bg || "",
            suspect_desc: la.bukong_suspect_desc || "",
          },
        }
      : la.bukong_error
        ? { markdown: "", plan: null, error: la.bukong_error, inputs: {} }
        : null;
  renderAnalyzeResultFromApi({
    result: la.result,
    elapsed: la.elapsed,
    markdown: la.markdown,
    analysis_id: la.analysis_id,
    bukong: buk,
    officer_brief: la.officer_brief || null,
  });
  await refreshHistory();
  refreshToolbarMetrics();
  setText("analyzeHint", "语音流程完成");
}

/** 实战工作台：选文件即上传 → ASR → 异步研判 → 回填下方研判区 */
async function runVoiceWorkbenchPipeline(file) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("kind", "audio");
  fd.append("auto_process", "1");
  fd.append("auto_analyze", "1");
  const useRag = document.getElementById("useRag")?.checked ?? true;
  fd.append("use_rag", useRag ? "1" : "0");
  appendIngestContextFields(fd);
  setWorkVoiceHint("上传与识别中…");
  const data = await callInternalForm("/internal/v1/uploads", fd);
  state.ingestCanonicalId = data.canonical_incident_id;
  setWorkVoiceHint("已上传，语音识别与研判进行中…");
  if (!data.media_pipeline_job_id) {
    setWorkVoiceHint("未启动处理队列。");
    return;
  }
  const stFinal = await pollMediaPipelineJob(data.media_pipeline_job_id, (i, total, msg) => setWorkVoiceHint(`${msg} ${Math.round((i / total) * 100)}%`));
  const analyzeJobId = stFinal && stFinal.analyze_job_id;
  if (analyzeJobId) {
    setWorkVoiceHint("研判进行中…");
    await pollInternalAnalyzeJob(analyzeJobId, (i, total, msg) => setWorkVoiceHint(`${msg} ${Math.round((i / total) * 100)}%`));
  }
  await applyLatestInternalAnalysis(state.ingestCanonicalId);
  const inc = await callInternalApi(`/internal/v1/incidents/${state.ingestCanonicalId}`);
  const at = (inc.unstructured && inc.unstructured.asr_text) || "";
  if (at) {
    const prev = document.getElementById("alarmText")?.value?.trim();
    document.getElementById("alarmText").value = prev ? `${prev}\n${at}` : at;
  }
  setWorkVoiceHint("语音流程完成。");
}

function initWorkbenchVoice() {
  const input = document.getElementById("ingestAudioFile");
  if (!input) return;
  let busy = false;
  input.addEventListener("change", async () => {
    if (busy) return;
    const file = input.files && input.files[0];
    if (!file) return;
    busy = true;
    try {
      await runVoiceWorkbenchPipeline(file);
    } catch (e) {
      setWorkVoiceHint(e.message || String(e));
    } finally {
      busy = false;
      input.value = "";
    }
  });
}

function initWorkbenchVideo() {
  const input = document.getElementById("ingestVideoFile");
  if (!input) return;
  let busy = false;
  input.addEventListener("change", async () => {
    if (busy) return;
    const file = input.files && input.files[0];
    if (!file) return;
    busy = true;
    try {
      await runVideoWorkbenchPipeline(file);
    } catch (e) {
      setWorkVoiceHint(e.message || String(e));
    } finally {
      busy = false;
      input.value = "";
    }
  });
}

async function runVideoWorkbenchPipeline(file) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("kind", "video");
  fd.append("auto_process", "1");
  fd.append("auto_analyze", "1");
  const useRag = document.getElementById("useRag")?.checked ?? true;
  fd.append("use_rag", useRag ? "1" : "0");
  appendIngestContextFields(fd);
  setWorkVoiceHint("视频上传与分析中…");
  const data = await callInternalForm("/internal/v1/uploads", fd);
  state.ingestCanonicalId = data.canonical_incident_id;
  setWorkVoiceHint("已上传，视频分析进行中…");
  if (!data.media_pipeline_job_id) {
    setWorkVoiceHint("未启动处理队列。");
    return;
  }
  const stFinal = await pollMediaPipelineJob(data.media_pipeline_job_id, (i, total, msg) =>
    setWorkVoiceHint(`${msg} ${Math.round((i / total) * 100)}%`)
  );
  const analyzeJobId = stFinal && stFinal.analyze_job_id;
  if (analyzeJobId) {
    setWorkVoiceHint("研判进行中…");
    await pollInternalAnalyzeJob(analyzeJobId, (i, total, msg) =>
      setWorkVoiceHint(`${msg} ${Math.round((i / total) * 100)}%`)
    );
  }
  await applyLatestInternalAnalysis(state.ingestCanonicalId);
  setWorkVoiceHint("视频分析完成。");
}

function initIncidentTypeConfirm() {
  document.getElementById("confirmIncidentTypeBtn")?.addEventListener("click", () => {
    if (!state.lastAnalyzeResponse?.result) return;
    state.incidentTypeOverride = "";
    refreshResultMetaDisplay();
    const hint = document.getElementById("incidentTypeConfirmHint");
    const model = state.latestResult?.incident_type || "未知";
    if (hint) hint.textContent = `已采纳：${model}`;
    syncIncidentTypeOverrideSelect();
  });
  document.getElementById("applyIncidentTypeOverrideBtn")?.addEventListener("click", () => {
    if (!state.lastAnalyzeResponse?.result) return;
    const sel = document.getElementById("incidentTypeOverrideSelect");
    const hint = document.getElementById("incidentTypeConfirmHint");
    const v = (sel?.value || "").trim();
    if (!v) {
      if (hint) hint.textContent = "请先在「改列为」下拉中选择类别，再点应用修改。";
      return;
    }
    const model = state.latestResult?.incident_type || "";
    if (v === model) {
      state.incidentTypeOverride = "";
      if (hint) hint.textContent = "所选与系统类别一致，未产生校正。";
      refreshResultMetaDisplay();
      syncIncidentTypeOverrideSelect();
      return;
    }
    state.incidentTypeOverride = v;
    refreshResultMetaDisplay();
    if (hint) hint.textContent = `已记录人工校正为「${v}」；保存复核时将写入 incident_type_override。`;
  });
}

function initCommandSituationVideo() {
  const video = document.getElementById("commandSituationVideo");
  const ph = document.getElementById("commandSituationVideoPlaceholder");
  if (!video || !ph) return;
  const sync = () => {
    const src = (video.getAttribute("src") || "").trim() || (video.currentSrc || "").trim();
    const ready = src && video.readyState >= 2;
    ph.hidden = Boolean(ready);
  };
  video.addEventListener("loadeddata", sync);
  video.addEventListener("emptied", () => {
    ph.hidden = false;
  });
  video.addEventListener("error", () => {
    ph.hidden = false;
  });
  sync();
}

function initCommandShellClock() {
  const el = document.getElementById("commandShellClock");
  if (!el) return;
  const fmt = () => {
    const d = new Date();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    el.textContent = `${mo}/${da} ${h}:${m}:${s}`;
  };
  fmt();
  setInterval(fmt, 1000);
}

function initQuickExamplePills() {
  document.querySelectorAll(".js-quick-example").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sel = document.getElementById("exampleSelect");
      const i = Number(btn.dataset.optionIndex);
      if (!sel || !Number.isFinite(i) || i < 0 || i >= sel.options.length) return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

initThemeToggle();
initWorkbenchResultsToggle();
updateWorkbenchResultsToggleHint();
initWorkbenchInPageNav();
initWorkbenchBukong();
initWorkbenchVoice();
initWorkbenchVideo();
initIncidentTypeConfirm();
initCommandSituationVideo();
initCommandShellClock();
initOfficerBadgeLogin();
initQuickExamplePills();
refreshHistory();
syncWorkBukongSectionVisibility();
