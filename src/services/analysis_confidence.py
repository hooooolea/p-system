"""研判置信度：模型自评 + 可解释规则校准，合并写入 result 与专页 presentation。"""

from __future__ import annotations

from typing import Any


def _clamp_pct(v: float, lo: int = 12, hi: int = 97) -> int:
    return int(max(lo, min(hi, round(v))))


def _unknownish(val: Any) -> bool:
    s = str(val or "").strip()
    if not s:
        return True
    if s in ("未知", "待确认"):
        return True
    return False


def _key_info_completeness(ki: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    """返回 0–100 的完整度分及信号列表。"""
    keys = ["location", "persons_involved", "has_weapon", "injuries_reported", "time_sensitivity"]
    filled = 0
    signals: list[dict[str, Any]] = []
    for k in keys:
        v = ki.get(k)
        if not _unknownish(v) and str(v).strip() not in ("", "未知"):
            filled += 1
            signals.append({"key": k, "label": "关键信息", "detail": f"{k} 已填写", "impact": +4})
    score = 28 + filled * 11
    if filled >= 4:
        score += 8
    return _clamp_pct(score, 22, 88), signals


def _calibration_score(
    result: dict[str, Any],
    alarm_text: str,
    use_rag: bool,
    rag_context: str,
    *,
    parse_ok: bool,
) -> tuple[int, list[dict[str, Any]]]:
    """可解释规则分（与模型自评独立）。"""
    signals: list[dict[str, Any]] = []
    score = 44.0

    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    comp, comp_sigs = _key_info_completeness(ki)
    score += (comp - 50) * 0.35
    signals.extend(comp_sigs[:5])

    al = (alarm_text or "").strip()
    if len(al) >= 120:
        score += 7
        signals.append({"key": "alarm_len", "label": "报警原文", "detail": "要素较充分", "impact": +7})
    elif len(al) >= 40:
        score += 4
        signals.append({"key": "alarm_len", "label": "报警原文", "detail": "长度适中", "impact": +4})

    rc = (rag_context or "").strip()
    if use_rag and len(rc) >= 120:
        score += 10
        signals.append({"key": "rag", "label": "规程检索", "detail": "已注入较长规程上下文", "impact": +10})
    elif use_rag and len(rc) >= 30:
        score += 5
        signals.append({"key": "rag", "label": "规程检索", "detail": "已注入规程摘要", "impact": +5})
    elif use_rag:
        signals.append({"key": "rag", "label": "规程检索", "detail": "命中较少或偏短", "impact": +1})

    summ = str(result.get("summary") or "").strip()
    if summ and "解析异常" not in summ:
        score += 5
        signals.append({"key": "summary", "label": "模型摘要", "detail": "已生成", "impact": +5})

    ds = str(result.get("disposal_suggestion") or "").strip()
    if len(ds) >= 24:
        score += 5
        signals.append({"key": "disposal", "label": "处置建议", "detail": "内容较具体", "impact": +5})

    law = str(result.get("law_reference") or "").strip()
    if law and law not in ("待确认", "暂无"):
        score += 3
        signals.append({"key": "law", "label": "法律依据", "detail": "非占位", "impact": +3})

    if not parse_ok:
        score = min(score, 38.0)
        signals.append(
            {"key": "parse", "label": "解析", "detail": "JSON 解析失败，使用兜底结果", "impact": -40}
        )

    return _clamp_pct(score, 18, 91), signals


def _parse_model_self_report(result: dict[str, Any]) -> tuple[int | None, str | None]:
    raw = result.get("analysis_confidence")
    if raw is None:
        return None, None
    try:
        v = int(float(raw))
    except (TypeError, ValueError):
        return None, None
    if v < 1 or v > 100:
        return None, None
    note = result.get("confidence_rationale")
    note_s = str(note).strip()[:160] if note else None
    return v, note_s


def build_confidence_bundle(
    result: dict[str, Any],
    alarm_text: str,
    *,
    use_rag: bool,
    rag_context: str,
    parse_ok: bool,
) -> dict[str, Any]:
    """
    返回专页可用的置信度包：
    - confidence_pct：最终展示整数百分比
    - provenance：来源、分量、简述（持久化进 presentation_json）
    """
    model_pct, model_note = _parse_model_self_report(result)
    cal_pct, cal_signals = _calibration_score(result, alarm_text, use_rag, rag_context, parse_ok=parse_ok)

    if not parse_ok:
        final = _clamp_pct(cal_pct * 0.92, 12, 42)
        method = "parse_fallback"
        blend = None
        summary_zh = "解析失败，置信度仅依据规则保守估计；请务必人工复核。"
    elif model_pct is None:
        final = cal_pct
        method = "calibration_only"
        blend = None
        summary_zh = "模型未输出 analysis_confidence，当前为规则校准分（关键信息、规程检索、摘要建议等）。"
    else:
        # 业务上：规则与自评加权，避免模型虚高或过度保守
        w_model, w_cal = 0.42, 0.58
        final = _clamp_pct(w_model * model_pct + w_cal * cal_pct, 22, 96)
        method = "model_calibrated_blend"
        blend = {"model_weight": w_model, "calibration_weight": w_cal}
        summary_zh = (
            f"综合模型自评（{model_pct}%）与规则信号（{cal_pct}%）加权得到；"
            "规则侧考察关键信息完整度、规程上下文与输出充实度。"
        )

    provenance: dict[str, Any] = {
        "method": method,
        "model_self_report": model_pct,
        "model_rationale": model_note,
        "calibration": {"score": cal_pct, "signals": cal_signals[:12]},
        "blend": blend,
        "summary_zh": summary_zh,
        "inputs": {
            "use_rag": use_rag,
            "rag_context_chars": len(rag_context or ""),
        },
    }

    return {"confidence_pct": final, "provenance": provenance}


def attach_confidence_bundle(
    result: dict[str, Any],
    alarm_text: str,
    *,
    use_rag: bool,
    rag_context: str,
    parse_ok: bool,
) -> None:
    """研判完成后写入 result['_confidence_bundle']，供落库与专页展示。"""
    result["_confidence_inputs"] = {
        "use_rag": use_rag,
        "rag_context_chars": len(rag_context or "") if use_rag else 0,
    }
    result["_confidence_bundle"] = build_confidence_bundle(
        result,
        alarm_text,
        use_rag=use_rag,
        rag_context=rag_context,
        parse_ok=parse_ok,
    )


def get_or_build_confidence_bundle(
    result: dict[str, Any],
    alarm_text: str,
    *,
    use_rag: bool = True,
    rag_context: str = "",
) -> dict[str, Any]:
    """优先用研判时写入的 bundle；旧数据则按当前 result 重算。"""
    b = result.get("_confidence_bundle")
    if isinstance(b, dict) and isinstance(b.get("confidence_pct"), (int, float)):
        return b
    parse_ok = "raw_response" not in result
    ins = result.get("_confidence_inputs")
    if isinstance(ins, dict):
        ur = bool(ins.get("use_rag", use_rag))
        rch = int(ins.get("rag_context_chars") or 0)
        # 不存全文，仅用长度恢复规程侧加分口径
        synthetic = ("·" * min(max(rch, 0), 8000)) if ur and rch else ""
        return build_confidence_bundle(
            result,
            alarm_text,
            use_rag=ur,
            rag_context=synthetic,
            parse_ok=parse_ok,
        )
    return build_confidence_bundle(
        result,
        alarm_text,
        use_rag=use_rag,
        rag_context=rag_context,
        parse_ok=parse_ok,
    )
