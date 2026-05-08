"""批量评测：类型 + 风险 同时命中计为正确。"""

from __future__ import annotations

from typing import Any


def run_evaluation(
    test_cases: list[dict[str, Any]],
    *,
    use_rag: bool = True,
    verbose: bool = False,
) -> dict[str, Any]:
    """
    test_cases 每项需包含: text, expected_type, expected_risk
    返回: cases, both_match, accuracy_pct, per_case 列表
    """
    from rag_retriever import retrieve_procedures
    from services.incident_service import analyze_incident

    per_case: list[dict[str, Any]] = []
    both_match = 0

    for i, case in enumerate(test_cases, 1):
        text = case["text"]
        rag_ctx = retrieve_procedures(text) if use_rag else ""
        result = analyze_incident(text, rag_ctx, use_rag=use_rag)
        ok_type = result.get("incident_type") == case["expected_type"]
        ok_risk = result.get("risk_level") == case["expected_risk"]
        ok_both = ok_type and ok_risk
        if ok_both:
            both_match += 1
        per_case.append(
            {
                "index": i,
                "text_preview": text[:60],
                "expected_type": case["expected_type"],
                "expected_risk": case["expected_risk"],
                "pred_type": result.get("incident_type"),
                "pred_risk": result.get("risk_level"),
                "match": ok_both,
            }
        )
        if verbose:
            status = "✅" if ok_both else "❌"
            print(
                f"[{i}/{len(test_cases)}] {status} "
                f"type={result.get('incident_type')} risk={result.get('risk_level')}"
            )

    n = len(test_cases)
    return {
        "cases": n,
        "both_match": both_match,
        "accuracy_pct": (both_match / n * 100.0) if n else 0.0,
        "per_case": per_case,
    }
