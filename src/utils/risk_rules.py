"""风险等级后处理：在边界场景下稳定输出，与评测/实战口径对齐。"""

from __future__ import annotations

from typing import Any


_WEAPON_KEYWORDS = [
    "刀", "砍刀", "匕首", "枪", "斧", "棒", "棍", "电棍", "武器", "刀具"
]
_FATAL_KEYWORDS = [
    "见血", "流血", "受伤", "昏迷", "伤重", "生命危险", "要命"
]
_URGENCY_PHRASES = ["快来", "立即", "马上", "现在就", "紧急", "来人"]


def apply_risk_postprocess(alarm_text: str, result: dict[str, Any]) -> None:
    """
    就地修改 result['risk_level']。
    当文本出现明显武器/致命暴力线索时，将较低等级上调为「紧急」。
    """
    text = alarm_text or ""
    try:
        existing_risk = str(result.get("risk_level", ""))
        has_weapon = any(k in text for k in _WEAPON_KEYWORDS)
        has_fatal = any(k in text for k in _FATAL_KEYWORDS)
        has_urgency_phrase = any(p in text for p in _URGENCY_PHRASES)

        if (has_weapon or has_fatal) and existing_risk in ("低", "中", "高"):
            result["risk_level"] = "紧急"
        elif existing_risk == "高" and has_fatal and has_urgency_phrase:
            result["risk_level"] = "紧急"
    except Exception:
        pass
