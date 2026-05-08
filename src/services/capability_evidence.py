"""能力证据摘要：供答辩/文稿直接引用。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.alert_evaluation import build_alert_evaluation_metrics
from services.nonface_retrieval import search_nonface_candidates
from services.workbench_service import build_performance_overview


def _status(ok: bool, prototype: bool = False) -> str:
    if ok:
        return "已实现"
    if prototype:
        return "原型"
    return "在研"


def build_capability_evidence(session_state: Any) -> dict[str, Any]:
    perf = build_performance_overview(session_state)
    alert_eval = build_alert_evaluation_metrics(session_state)
    nonface_probe = search_nonface_candidates(session_state, query="黑衣 口罩 电动车", top_k=3)
    nonface_hits = len(nonface_probe.get("items") or [])

    total = int(perf.get("total", 0))
    reviews = int(perf.get("review_total", 0))
    judged = int(alert_eval["counts"]["judged_reviews"])

    items = [
        {
            "capability": "语义研判 + RAG",
            "status": _status(total > 0),
            "evidence": f"研判总量 {total}，具备结构化输出与规程检索增强。",
        },
        {
            "capability": "预警复核闭环",
            "status": _status(reviews > 0),
            "evidence": f"复核条目 {reviews}，已形成 review 记录链路。",
        },
        {
            "capability": "预警误报评测",
            "status": _status(judged > 0),
            "evidence": (
                f"precision={alert_eval['metrics']['precision']}, "
                f"false_alarm_rate={alert_eval['metrics']['false_alarm_rate']}, sample={judged}"
            ),
        },
        {
            "capability": "非人脸特征溯源",
            "status": _status(False, prototype=True),
            "evidence": f"原型检索接口可用，当前探测命中 {nonface_hits} 条（文本线索检索，非视觉 ReID）。",
        },
        {
            "capability": "云边协同调度",
            "status": _status(False),
            "evidence": "当前部署为 Flask + 静态前端，边缘推理与协同调度仍在研。",
        },
    ]

    generated_at = datetime.now(timezone.utc).isoformat()
    markdown_lines = [
        "# 能力实现证据摘要",
        "",
        f"- 生成时间（UTC）：{generated_at}",
        f"- 研判总量：{total}",
        f"- 复核条目：{reviews}",
        "",
        "## 状态矩阵",
        "",
        "| 能力项 | 状态 | 当前证据 |",
        "| --- | --- | --- |",
    ]
    for it in items:
        markdown_lines.append(f"| {it['capability']} | {it['status']} | {it['evidence']} |")

    markdown_lines.extend(
        [
            "",
            "## 说明",
            "",
            "- 预警评测中的 recall/f1 为试点阶段 proxy 指标，后续需引入标准标注集。",
            "- 非人脸能力当前为文本线索检索原型，尚未宣称视觉 ReID/跨镜追踪落地。",
        ]
    )

    return {
        "generated_at": generated_at,
        "summary": {
            "analysis_total": total,
            "review_total": reviews,
            "judged_reviews": judged,
        },
        "items": items,
        "markdown": "\n".join(markdown_lines),
    }

