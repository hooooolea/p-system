/**
 * 研判专页与总览右侧详情共用的 presentation 渲染（通过 idMap 区分 DOM id）。
 */
(function (global) {
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function pliceApiUrl(path) {
    return typeof global.pliceResolveApiUrl === "function"
      ? global.pliceResolveApiUrl(path)
      : path.startsWith("/")
        ? path
        : `/${path}`;
  }

  function riskSlug(r) {
    if (r === "紧急") return "critical";
    if (r === "高") return "high";
    if (r === "中") return "mid";
    if (r === "低") return "low";
    return "mid";
  }

  function $(idMap, key) {
    const id = idMap[key];
    if (!id) return null;
    return document.getElementById(id);
  }

  function renderWorkflow(idMap, step, labels) {
    const el = $(idMap, "workflow");
    if (!el) return;
    const labs = Array.isArray(labels) && labels.length ? labels : ["新建", "已指派", "已处置", "已关闭"];
    el.innerHTML = labs
      .map((lab, i) => {
        const active = i + 1 === step ? " ar-workflow__step--active" : "";
        return `<span class="ar-workflow__step${active}">${esc(lab)}</span>`;
      })
      .join("");
  }

  function renderFactors(idMap, factors) {
    const el = $(idMap, "factors");
    if (!el) return;
    const arr = Array.isArray(factors) ? factors : [];
    el.innerHTML = arr
      .map((f) => {
        const sc = Math.max(0, Math.min(100, Number(f.score) || 0));
        return `<div class="ar-factor">
        <div class="ar-factor__top"><span>${esc(f.label)}</span><span>${sc}</span></div>
        <div class="ar-factor__bar"><span style="width:${sc}%"></span></div>
      </div>`;
      })
      .join("");
  }

  function renderAnalysisPresentation(pres, analysisId, userFeedback, idMap) {
    const facts = pres.facts || {};
    const ai = pres.ai || {};
    const caseEl = $(idMap, "caseId");
    if (caseEl) caseEl.textContent = pres.display_case_id || analysisId;
    const rl = facts.risk_level || "未知";
    const badge = $(idMap, "riskBadge");
    if (badge) {
      badge.textContent = rl;
      badge.className = `ar-risk-badge ar-risk-badge--${riskSlug(rl)}`;
    }
    const conf = $(idMap, "confidence");
    if (conf) conf.textContent = `置信度 ${ai.confidence_pct != null ? ai.confidence_pct : "—"}%`;
    const noteEl = $(idMap, "confidenceNote");
    if (noteEl) {
      /* 置信度文字说明见技术路线 /tech-route#tr-confidence，专页与总览仅展示百分比 */
      noteEl.textContent = "";
      noteEl.hidden = true;
    }

    const setText = (k, v) => {
      const el = $(idMap, k);
      if (el) el.textContent = v;
    };
    setText("type", facts.incident_type || "—");
    setText("location", facts.location || "—");
    setText("time", facts.reported_at || "—");
    setText("assign", facts.assignment_status || "—");
    setText("desc", facts.description || "—");

    renderWorkflow(idMap, Number(facts.workflow_step) || 1, facts.workflow_labels);

    const score = Math.max(0, Math.min(100, Number(ai.risk_score) || 0));
    const ring = $(idMap, "gaugeRing");
    if (ring) ring.style.setProperty("--ar-p", String(score));
    const gnum = $(idMap, "gaugeNum");
    if (gnum) gnum.textContent = String(Math.round(score));

    renderFactors(idMap, ai.factors);
    setText("primarySuggest", ai.primary_suggestion || "—");
    setText("secondarySuggest", ai.secondary_suggestion || "");

    const rel = ai.related || {};
    const relEl = $(idMap, "related");
    if (relEl) {
      relEl.innerHTML = `<span class="ar-related__item">相似警情 <strong>${esc(rel.similar_cases ?? "—")}</strong></span>
    <span class="ar-related__item">关联目标 <strong>${esc(rel.related_targets ?? "—")}</strong></span>`;
    }

    const fb = userFeedback || pres.user_feedback;
    const st = $(idMap, "feedbackState");
    if (st) {
      if (fb === "adopt") st.textContent = "已记录：采纳";
      else if (fb === "ignore") st.textContent = "已记录：忽略";
      else st.textContent = "";
    }
  }

  async function postFeedback(analysisId, feedback) {
    const res = await fetch(pliceApiUrl(`/api/analysis-presentation/${encodeURIComponent(analysisId)}/feedback`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function bindArFeedback(analysisId, idMap) {
    const adopt = $(idMap, "btnAdopt");
    const ignore = $(idMap, "btnIgnore");
    const st = $(idMap, "feedbackState");
    if (adopt) {
      adopt.onclick = async () => {
        try {
          await postFeedback(analysisId, "adopt");
          if (st) st.textContent = "已记录：采纳";
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        }
      };
    }
    if (ignore) {
      ignore.onclick = async () => {
        try {
          await postFeedback(analysisId, "ignore");
          if (st) st.textContent = "已记录：忽略";
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        }
      };
    }
  }

  global.pliceArPresentation = {
    esc,
    renderAnalysisPresentation,
    bindArFeedback,
    postFeedback,
  };
})(typeof window !== "undefined" ? window : globalThis);
