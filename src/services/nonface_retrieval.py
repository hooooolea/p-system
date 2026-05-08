"""非人脸特征检索（原型）：基于文本线索构建轻量相似检索。"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


_NONFACE_TERMS = [
    "黑衣",
    "白衣",
    "红衣",
    "蓝衣",
    "外套",
    "羽绒服",
    "帽子",
    "口罩",
    "背包",
    "手提袋",
    "高个",
    "矮个",
    "偏瘦",
    "偏胖",
    "步态",
    "体态",
    "轿车",
    "SUV",
    "面包车",
    "摩托",
    "电动车",
    "车牌",
    "白色车",
    "黑色车",
]


def _tokenize(text: str) -> list[str]:
    s = str(text or "").lower()
    parts = re.findall(r"[a-z0-9\u4e00-\u9fff]+", s)
    out: list[str] = []
    for p in parts:
        for t in _NONFACE_TERMS:
            if t.lower() in p:
                out.append(t.lower())
        if p in ("sedan", "suv", "van", "motorbike", "ebike"):
            out.append(p)
    return out


def _vectorize(text: str) -> Counter[str]:
    return Counter(_tokenize(text))


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    dot = 0.0
    for k, v in a.items():
        dot += float(v) * float(b.get(k, 0))
    na = math.sqrt(sum(float(v) * float(v) for v in a.values()))
    nb = math.sqrt(sum(float(v) * float(v) for v in b.values()))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _snapshot_text(snap: dict[str, Any]) -> str:
    result = snap.get("result") if isinstance(snap.get("result"), dict) else {}
    bukong = snap.get("bukong") if isinstance(snap.get("bukong"), dict) else {}
    ins = bukong.get("inputs") if isinstance(bukong.get("inputs"), dict) else {}
    parts = [
        str(snap.get("alarm_text") or ""),
        str(result.get("summary") or ""),
        str(result.get("incident_type") or ""),
        str(ins.get("suspect_desc") or ""),
        str(ins.get("incident_bg") or ""),
    ]
    return "\n".join(p for p in parts if p)


def search_nonface_candidates(session_state: Any, query: str, top_k: int = 5) -> dict[str, Any]:
    """
    在现有研判快照中按非人脸特征做相似检索（原型版）。
    """
    q = str(query or "").strip()
    if not q:
        return {"query": "", "items": [], "note": "query 为空"}

    store = session_state.get("analysis_by_id") or {}
    if not isinstance(store, dict):
        store = {}

    qv = _vectorize(q)
    hits: list[dict[str, Any]] = []
    for aid, snap in store.items():
        if not isinstance(snap, dict):
            continue
        text = _snapshot_text(snap)
        sv = _vectorize(text)
        score = _cosine(qv, sv)
        if score <= 0:
            continue
        result = snap.get("result") if isinstance(snap.get("result"), dict) else {}
        hits.append(
            {
                "analysis_id": str(aid),
                "score": round(score, 4),
                "incident_type": str(result.get("incident_type") or "未知"),
                "summary": str(result.get("summary") or "")[:120],
                "matched_terms": sorted(set(_tokenize(q)).intersection(set(_tokenize(text))))[:10],
            }
        )

    hits.sort(key=lambda x: x["score"], reverse=True)
    k = max(1, min(int(top_k or 5), 20))
    return {
        "query": q,
        "top_k": k,
        "items": hits[:k],
        "note": "原型检索：基于文本线索与非人脸词项相似度，非视觉 ReID。",
    }

