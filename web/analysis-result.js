// pliceApiUrl 已移至 utils.js

function qs(id) {
  return document.getElementById(id);
}

function showError(msg) {
  qs("arLoading").hidden = true;
  qs("arRoot").hidden = true;
  const e = qs("arError");
  e.hidden = false;
  e.textContent = msg;
}

async function fetchPresentation(id) {
  const res = await fetch(pliceApiUrl(`/api/analysis-presentation/${encodeURIComponent(id)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const AR_IDS = {
  caseId: "arCaseId",
  riskBadge: "arRiskBadge",
  confidence: "arConfidence",
  confidenceNote: "arConfidenceNote",
  type: "arType",
  location: "arLocation",
  time: "arTime",
  assign: "arAssign",
  desc: "arDesc",
  workflow: "arWorkflow",
  gaugeRing: "arGaugeRing",
  gaugeNum: "arGaugeNum",
  factors: "arFactors",
  primarySuggest: "arPrimarySuggest",
  secondarySuggest: "arSecondarySuggest",
  related: "arRelated",
  feedbackState: "arFeedbackState",
  btnAdopt: "arBtnAdopt",
  btnIgnore: "arBtnIgnore",
};

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "").trim();
  if (!id) {
    showError("缺少参数 id。请从工作台「研判结果专页」打开。");
    return;
  }
  const PR = window.pliceArPresentation;
  if (!PR) {
    showError("页面脚本未加载完整。");
    return;
  }
  try {
    const data = await fetchPresentation(id);
    qs("arLoading").hidden = true;
    qs("arError").hidden = true;
    qs("arRoot").hidden = false;
    PR.renderAnalysisPresentation(data.presentation, data.analysis_id, data.user_feedback, AR_IDS);
    PR.bindArFeedback(id, AR_IDS);
  } catch (e) {
    showError(e.message || String(e));
  }
}

main();
