"""预警评测：基于复核记录计算可量化指标。"""

from __future__ import annotations

from typing import Any


def _safe_div(num: float, den: float) -> float:
    if den <= 0:
        return 0.0
    return num / den


def build_alert_evaluation_metrics(session_state: Any) -> dict[str, Any]:
    """
    将复核结果映射到“命中/误报/待判定”并输出评测快照。

    说明：
    - 本项目当前阶段没有完整负样本库，召回率使用 proxy（待补判定视作潜在漏报）。
    - precision / false_alarm_rate 基于人工复核直接可解释。
    """
    reviews = list(session_state.get("review_records") or [])

    tp = 0  # 同意系统结果
    fp = 0  # 驳回系统结果（可视作误报）
    fn_proxy = 0  # 需补充信息后再判定（作为潜在漏判/低置信）
    unknown = 0

    for item in reviews:
        r = str(item.get("review_result") or "").strip()
        if r == "同意系统结果":
            tp += 1
        elif r == "驳回系统结果":
            fp += 1
        elif r == "需补充信息后再判定":
            fn_proxy += 1
        else:
            unknown += 1

    judged = tp + fp
    total = tp + fp + fn_proxy + unknown

    precision = _safe_div(tp, judged)
    false_alarm_rate = _safe_div(fp, judged)
    recall_proxy = _safe_div(tp, tp + fn_proxy)
    f1_proxy = _safe_div(2 * precision * recall_proxy, precision + recall_proxy)

    return {
        "counts": {
            "total_reviews": total,
            "judged_reviews": judged,
            "tp_adopt": tp,
            "fp_reject": fp,
            "fn_proxy_need_more": fn_proxy,
            "unknown": unknown,
        },
        "metrics": {
            "precision": round(precision, 4),
            "false_alarm_rate": round(false_alarm_rate, 4),
            "recall_proxy": round(recall_proxy, 4),
            "f1_proxy": round(f1_proxy, 4),
        },
        "notes": [
            "precision 与 false_alarm_rate 基于复核结论可直接审计。",
            "recall_proxy/f1_proxy 为试点阶段代理指标，后续应接入标准标注集。",
        ],
    }

