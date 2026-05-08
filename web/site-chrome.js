(function () {
  function apiUrl(path) {
    return typeof window.pliceResolveApiUrl === "function" ? window.pliceResolveApiUrl(path) : path;
  }

  async function callApi(path) {
    const res = await fetch(apiUrl(path), { headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function refreshSiteToolbarMetrics() {
    const totalEl = document.getElementById("metricTotal");
    const highEl = document.getElementById("metricHigh");
    if (!totalEl || !highEl) return;
    try {
      const data = await callApi("/api/performance");
      const perf = data.performance || {};
      const risk = data.risk_counts || {};
      const high = (Number(risk["紧急"]) || 0) + (Number(risk["高"]) || 0);
      totalEl.textContent = String(perf.total ?? 0);
      highEl.textContent = String(high);
    } catch {
      totalEl.textContent = "—";
      highEl.textContent = "—";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void refreshSiteToolbarMetrics());
  } else {
    void refreshSiteToolbarMetrics();
  }
})();
