(function () {
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  async function callApi(path) {
    return window.callApi(path);
  }

  function statusTag(status) {
    const cls = status === "已实现" ? "ok-tag" : status === "原型" ? "warn-tag" : "warn-tag";
    return `<span class="${cls}">${esc(status)}</span>`;
  }

  function buildRows(perfData, evalData, nonfaceOk, nonfaceSampleCount) {
    const perf = perfData?.performance || {};
    const judged = Number(evalData?.counts?.judged_reviews || 0);
    const total = Number(perf.total || 0);
    const reviewTotal = Number(perf.review_total || 0);
    const hasRagFlow = total > 0;
    const hasReviewLoop = reviewTotal > 0;
    const hasAlertEval = judged > 0;

    return [
      {
        name: "语义研判 + RAG",
        status: hasRagFlow ? "已实现" : "在研",
        evidence: `研判总量 ${total}`,
        note: "主链路可用，RAG随研判流程生效。",
      },
      {
        name: "预警复核闭环",
        status: hasReviewLoop ? "已实现" : "在研",
        evidence: `复核条目 ${reviewTotal}`,
        note: "已有复核记录沉淀，可回写评测。",
      },
      {
        name: "预警误报评测",
        status: hasAlertEval ? "已实现" : "在研",
        evidence: hasAlertEval
          ? `precision=${evalData.metrics.precision}, false_alarm_rate=${evalData.metrics.false_alarm_rate}, sample=${judged}`
          : "暂无已判定样本",
        note: "试点阶段提供 precision/误报率/proxy 指标。",
      },
      {
        name: "非人脸特征溯源",
        status: nonfaceOk ? "原型" : "在研",
        evidence: nonfaceOk ? `原型检索接口可用，样本命中 ${nonfaceSampleCount}` : "检索接口不可用或无样本",
        note: "当前为文本线索检索，非视觉 ReID/跨镜追踪。",
      },
      {
        name: "云边协同调度",
        status: "在研",
        evidence: "暂无边缘推理节点与调度编排服务",
        note: "当前为 Flask + 静态前端部署架构。",
      },
    ];
  }

  function renderRows(rows) {
    const tbody = document.querySelector("#techStatusTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(row.name)}</td>
        <td>${statusTag(row.status)}</td>
        <td>${esc(row.evidence)}</td>
        <td>${esc(row.note)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  let latestEvidenceMarkdown = "";

  async function generateCapabilityEvidence() {
    const hint = document.getElementById("techStatusHint");
    const out = document.getElementById("techEvidenceOutput");
    if (hint) hint.textContent = "正在生成答辩证据...";
    try {
      const data = await callApi("/api/capability-evidence");
      latestEvidenceMarkdown = String(data.markdown || "");
      if (out) out.textContent = latestEvidenceMarkdown || "暂无证据数据。";
      if (hint) hint.textContent = "答辩证据已生成，可复制到文稿。";
    } catch (err) {
      if (out) out.textContent = err?.message || String(err);
      if (hint) hint.textContent = "生成失败，请检查后端接口。";
    }
  }

  async function copyEvidenceMarkdown() {
    const hint = document.getElementById("techStatusHint");
    const out = document.getElementById("techEvidenceOutput");
    const text = latestEvidenceMarkdown || (out ? out.textContent : "");
    if (!text) {
      if (hint) hint.textContent = "暂无可复制内容，请先生成答辩证据。";
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (hint) hint.textContent = "Markdown 已复制。";
    } catch {
      if (hint) hint.textContent = "复制失败，请手动选择文本复制。";
    }
  }

  async function refreshTechStatus() {
    const hint = document.getElementById("techStatusHint");
    if (hint) hint.textContent = "状态刷新中...";
    try {
      const [perfData, evalData] = await Promise.all([
        callApi("/api/performance"),
        callApi("/api/evaluation/alerts"),
      ]);

      let nonfaceOk = false;
      let nonfaceSampleCount = 0;
      try {
        const nonface = await callApi("/api/nonface/search?query=%E9%BB%91%E8%A1%A3&top_k=3");
        nonfaceOk = true;
        nonfaceSampleCount = Array.isArray(nonface.items) ? nonface.items.length : 0;
      } catch {
        nonfaceOk = false;
      }

      const rows = buildRows(perfData, evalData, nonfaceOk, nonfaceSampleCount);
      renderRows(rows);
      if (hint) hint.textContent = "已按当前会话数据刷新。";
    } catch (err) {
      if (hint) hint.textContent = err?.message || String(err);
    }
  }

  document.getElementById("techStatusRefreshBtn")?.addEventListener("click", () => void refreshTechStatus());
  document.getElementById("techEvidenceGenBtn")?.addEventListener("click", () => void generateCapabilityEvidence());
  document.getElementById("techEvidenceCopyBtn")?.addEventListener("click", () => void copyEvidenceMarkdown());
  void refreshTechStatus();
  void generateCapabilityEvidence();
})();

