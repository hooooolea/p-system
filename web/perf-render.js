/**
 * 性能统计 DOM 渲染（工作台 / 证据页 / 独立专页共用）
 * 依赖页面已存在对应 id 的节点；缺失则跳过。
 */
(function (global) {
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function renderPerfRiskBars(risk) {
    const box = document.getElementById("perfRiskBars");
    if (!box) return;
    box.textContent = "";
    const levels = [
      ["紧急", risk["紧急"] ?? 0],
      ["高", risk["高"] ?? 0],
      ["中", risk["中"] ?? 0],
      ["低", risk["低"] ?? 0],
    ];
    levels.forEach(([label, num]) => {
      const item = document.createElement("div");
      item.className = "risk-bar-item";
      const lb = document.createElement("div");
      lb.className = "label";
      lb.textContent = label;
      const n = document.createElement("div");
      n.className = "num";
      n.textContent = String(num);
      item.appendChild(lb);
      item.appendChild(n);
      box.appendChild(item);
    });
  }

  function renderPerfExtraTables(data) {
    const trend = data.elapsed_trend || [];
    const tbodyT = document.querySelector("#perfTrendTable tbody");
    const emptyT = document.getElementById("perfTrendEmpty");
    if (tbodyT) {
      tbodyT.innerHTML = "";
      if (!trend.length) {
        if (emptyT) emptyT.hidden = false;
      } else {
        if (emptyT) emptyT.hidden = true;
        trend.forEach((row) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${esc(row["序号"])}</td><td>${esc(row["警情类型"])}</td><td>${esc(row["耗时(秒)"])}</td>`;
          tbodyT.appendChild(tr);
        });
      }
    }
    const review = data.review_distribution || [];
    const tbodyR = document.querySelector("#perfReviewTable tbody");
    const emptyR = document.getElementById("perfReviewEmpty");
    if (tbodyR) {
      tbodyR.innerHTML = "";
      const sum = review.reduce((a, r) => a + (Number(r["数量"]) || 0), 0);
      if (!sum) {
        if (emptyR) emptyR.hidden = false;
      } else {
        if (emptyR) emptyR.hidden = true;
        review.forEach((row) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${esc(row["复核结论"])}</td><td>${esc(row["数量"])}</td>`;
          tbodyR.appendChild(tr);
        });
      }
    }
  }

  function renderPerfMetrics(perf, risk, scorecard) {
    const meta = document.getElementById("perfMeta");
    if (!meta) return;
    const buk = scorecard?.bukong_generated ?? 0;
    meta.innerHTML = `
    <div class="stat-card"><div class="k">总处理量</div><div class="v">${esc(perf.total ?? 0)}</div></div>
    <div class="stat-card"><div class="k">近10次平均耗时</div><div class="v">${esc((perf.avg_elapsed_last_10 || 0).toFixed(2))} s</div></div>
    <div class="stat-card"><div class="k">复核通过率</div><div class="v">${esc((perf.review_pass_rate || 0).toFixed(1))} %</div></div>
    <div class="stat-card"><div class="k">待补充信息率</div><div class="v">${esc((perf.need_more_rate || 0).toFixed(1))} %</div></div>
    <div class="stat-card"><div class="k">布控生成</div><div class="v">${esc(buk)}</div></div>
  `;
    const cap = document.getElementById("perfCaption");
    if (cap) {
      cap.textContent = `回填 ${perf.refill_clicks ?? 0} · 复核 ${perf.review_total ?? 0}`;
    }
  }

  function applyPerformanceCoreDom(data) {
    const perf = data.performance || {};
    const risk = data.risk_counts || {};
    const sc = data.scorecard || {};
    const total = Number(perf.total ?? 0);
    const emptyHint = document.getElementById("perfEmptyHint");
    const wrap = document.getElementById("perfSummaryWrap");
    if (emptyHint) {
      emptyHint.textContent = "暂无数据；先在工作台研判。";
      emptyHint.hidden = total !== 0;
    }
    if (wrap) wrap.hidden = total === 0;
    if (total !== 0) {
      renderPerfMetrics(perf, risk, sc);
      renderPerfRiskBars(risk);
      renderPerfExtraTables(data);
    } else {
      renderPerfMetrics(perf, risk, sc);
      if (document.getElementById("perfCaption")) document.getElementById("perfCaption").textContent = "";
      const rb = document.getElementById("perfRiskBars");
      if (rb) rb.textContent = "";
      renderPerfExtraTables({ elapsed_trend: [], review_distribution: [] });
    }
  }

  function applyFullPerformanceDom(data) {
    applyPerformanceCoreDom(data);
  }

  function applyPerformanceDomError(err) {
    const msg = err && err.message ? err.message : String(err);
    const emptyHint = document.getElementById("perfEmptyHint");
    const wrap = document.getElementById("perfSummaryWrap");
    if (emptyHint) {
      emptyHint.hidden = false;
      emptyHint.textContent = msg;
    }
    if (wrap) wrap.hidden = true;
    const rb = document.getElementById("perfRiskBars");
    if (rb) rb.textContent = "";
    renderPerfExtraTables({ elapsed_trend: [], review_distribution: [] });
  }

  global.plicePerfRender = {
    esc,
    renderPerfRiskBars,
    renderPerfExtraTables,
    renderPerfMetrics,
    applyPerformanceCoreDom,
    applyFullPerformanceDom,
    applyPerformanceDomError,
  };
})(typeof window !== "undefined" ? window : globalThis);
