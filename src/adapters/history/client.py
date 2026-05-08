from __future__ import annotations

import re
from typing import Any

# 与报警文本需达到的最小相关分，避免无匹配时仍返回满列表（此前对每条记录固定 +0.3 导致几乎全量返回）
_MIN_RELEVANCE = 0.2
_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")
_STOP = frozenset({"", "的", "了", "在", "与", "有人", "现在", "这边", "他们", "什么", "怎么"})


# 专网历史库演示种子（非真实数据；含三里屯/朝阳等便于与示例警情同址检索）
_SEED: list[dict[str, Any]] = [
    {
        "alarm_no": "DEMO-2025-0001",
        "received_at": "2025-08-01T14:20:00+08:00",
        "category": "打架斗殴",
        "location_text": "朝阳区某商圈",
        "summary": "口角引发肢体冲突，已调解处置。",
        "risk_level": "中",
    },
    {
        "alarm_no": "DEMO-2025-0004",
        "received_at": "2025-08-15T23:10:00+08:00",
        "category": "打架斗殴",
        "location_text": "朝阳区三里屯酒吧街",
        "summary": "酒后争执升级肢体冲突，现场带离2人。",
        "risk_level": "高",
    },
    {
        "alarm_no": "DEMO-2025-0005",
        "received_at": "2025-09-01T01:05:00+08:00",
        "category": "噪音扰民",
        "location_text": "朝阳区三里屯路口",
        "summary": "夜间音响扰民，已口头警告。",
        "risk_level": "低",
    },
    {
        "alarm_no": "DEMO-2025-0006",
        "received_at": "2025-10-18T20:40:00+08:00",
        "category": "交通事故",
        "location_text": "朝阳区三里屯地铁站出口",
        "summary": "机动车与行人剐蹭，无人重伤。",
        "risk_level": "中",
    },
    {
        "alarm_no": "DEMO-2025-0002",
        "received_at": "2025-09-12T09:05:00+08:00",
        "category": "电信诈骗",
        "location_text": "海淀区某小区",
        "summary": "冒充公检法诈骗未遂，劝阻成功。",
        "risk_level": "低",
    },
    {
        "alarm_no": "DEMO-2025-0003",
        "received_at": "2025-11-03T22:40:00+08:00",
        "category": "盗窃抢劫",
        "location_text": "丰台区某地铁站口",
        "summary": "夜间扒窃，嫌疑人已逃离，视频追踪中。",
        "risk_level": "高",
    },
    {
        "alarm_no": "DEMO-2025-0007",
        "received_at": "2025-07-22T11:30:00+08:00",
        "category": "医疗急救",
        "location_text": "朝阳区三里屯太古里",
        "summary": "顾客突发晕厥，120到场后送医。",
        "risk_level": "中",
    },
]


def _alarm_tokens(alarm_text: str) -> set[str]:
    """中英文混合：中文连续片段 + 二字滑窗 + 空白分词，用于与种子字段做子串级匹配。"""
    text = (alarm_text or "").strip()
    if not text:
        return set()
    toks: set[str] = set()
    for run in _CJK_RUN.findall(text):
        if 2 <= len(run) <= 12:
            toks.add(run)
        if len(run) >= 2:
            for i in range(len(run) - 1):
                toks.add(run[i : i + 2])
    blob = text.replace("，", " ").replace("。", " ").replace("！", " ")
    for w in blob.split():
        w = w.strip().lower()
        if len(w) > 1 and w not in _STOP:
            toks.add(w)
    return {t for t in toks if len(t) > 1 and t not in _STOP}


class HistoryClient:
    """历史警情只读 + 简易相似检索（关键词重叠演示）。"""

    def get_by_alarm_no(self, alarm_no: str) -> dict[str, Any] | None:
        for row in _SEED:
            if row["alarm_no"] == alarm_no:
                return dict(row)
        return None

    def similar(
        self,
        *,
        alarm_text: str = "",
        jurisdiction: str = "",
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(int(limit), 20))
        toks = _alarm_tokens(alarm_text)
        jur = (jurisdiction or "").strip()
        scored: list[tuple[float, dict[str, Any]]] = []
        for row in _SEED:
            hay = f"{row.get('summary','')} {row.get('category','')} {row.get('location_text','')}".lower()
            score = 0.0
            for t in toks:
                if t in hay:
                    score += 0.12
            loc_row = (row.get("location_text") or "").strip()
            loc_l = loc_row.lower()
            if jur and loc_row and jur[:6] in loc_row:
                score += 0.1
            if loc_row and len(loc_row) >= 2 and loc_row in (alarm_text or ""):
                score += 0.42
            if loc_row and len(loc_row) >= 2:
                for t in toks:
                    if t in loc_l:
                        score += 0.1
            score = min(score, 0.99)
            if score < _MIN_RELEVANCE:
                continue
            scored.append((score, dict(row)))
        scored.sort(key=lambda x: -x[0])
        return [r for _, r in scored[:limit]]
