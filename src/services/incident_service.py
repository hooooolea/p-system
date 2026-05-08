"""警情研判：Prompt + LLM + JSON 解析 + 风险兜底。"""

from __future__ import annotations

from typing import Any

from llm_factory import get_llm
from prompts import INCIDENT_ANALYSIS_PROMPT
from services.analysis_confidence import attach_confidence_bundle
from utils.json_utils import parse_llm_json
from utils.risk_rules import apply_risk_postprocess


def _fallback_result(raw: str) -> dict[str, Any]:
    return {
        "incident_type": "其他",
        "risk_level": "中",
        "key_info": {
            "location": "未知",
            "persons_involved": "未知",
            "has_weapon": "未知",
            "injuries_reported": "未知",
            "time_sensitivity": "否",
        },
        "summary": "警情解析异常，请人工研判",
        "disposal_suggestion": "建议人工审核原始报警信息",
        "law_reference": "待确认",
        "geo": {
            "location_text": "未知",
            "lon": None,
            "lat": None,
            "source": "unavailable",
            "confidence": 0.0,
            "notes": "解析失败，未生成坐标",
        },
        "raw_response": raw,
        "analysis_confidence": None,
        "confidence_rationale": None,
    }


def analyze_incident(
    alarm_text: str,
    rag_context: str = "",
    *,
    use_rag: bool = False,
) -> dict[str, Any]:
    """
    核心分析：输入报警文本与（可选）RAG 规程上下文，返回结构化字典。
    """
    llm = get_llm()
    prompt = INCIDENT_ANALYSIS_PROMPT.format(
        alarm_text=alarm_text,
        rag_context=rag_context if rag_context else "暂无匹配规程，请按标准流程处置。",
    )

    from langchain_core.messages import HumanMessage

    response = llm.invoke([HumanMessage(content=prompt)])
    raw = getattr(response, "content", "") or ""

    try:
        result = parse_llm_json(raw)
        parse_ok = True
    except Exception:
        result = _fallback_result(raw)
        parse_ok = False

    result["original_text"] = alarm_text
    apply_risk_postprocess(alarm_text, result)
    attach_confidence_bundle(
        result,
        alarm_text,
        use_rag=use_rag,
        rag_context=rag_context if use_rag else "",
        parse_ok=parse_ok,
    )
    return result
