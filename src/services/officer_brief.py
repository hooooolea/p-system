"""
出警前一线简报：同址/同区历史警情、周边风险演示、装备建议清单。
数据为演示与规则拼装，专网需对接实库与指挥图层。
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Any

_DISTRICT_PAT = re.compile(
    "(朝阳|海淀|丰台|西城|东城|通州|石景山|大兴|昌平|房山|顺义|密云|怀柔|平谷|延庆|门头沟|亦庄|三里屯|西单|王府井|国贸|望京)"
)


def _district_hint(alarm_text: str, result: dict[str, Any]) -> str:
    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    loc = str(ki.get("location") or "").strip()
    blob = f"{alarm_text} {loc}"
    m = _DISTRICT_PAT.search(blob)
    return m.group(1) if m else ""


def _stable_seed(s: str) -> int:
    return int(hashlib.sha256(s.encode("utf-8", errors="ignore")).hexdigest()[:8], 16)


def _demo_lon_lat(seed: int, idx: int, salt: int) -> tuple[float, float]:
    """演示用经纬度偏移（非测绘级）；专网对接实库后应写入真实坐标。"""
    base_lon, base_lat = 116.4074, 39.9042
    ang = ((seed + idx * 47 + salt * 13) % 360) * math.pi / 180.0
    r = 0.0011 + idx * 0.0005 + (seed % 7) * 0.00007
    return base_lon + r * math.cos(ang), base_lat + r * math.sin(ang)


def build_officer_brief(alarm_text: str, result: dict[str, Any], *, history_client: Any = None) -> dict[str, Any]:
    """供 POST /api/analyze 与研判快照使用；history_client 缺省时内部实例化。"""
    from adapters.history.client import HistoryClient

    hc = history_client or HistoryClient()
    district = _district_hint(alarm_text, result)
    loc_line = ""
    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    if isinstance(ki, dict):
        loc_line = str(ki.get("location") or "").strip()

    itype = str(result.get("incident_type") or "其他")
    sum_snip = str(result.get("summary") or "").strip()
    if len(sum_snip) > 200:
        sum_snip = sum_snip[:200]
    # 检索时并入模型输出的类型/摘要，便于与种子里的 category、summary 对齐（仅原文常无交集时）
    query_text = "\n".join(x for x in (alarm_text, itype, sum_snip) if x)
    rows = hc.similar(alarm_text=query_text, jurisdiction=district or loc_line[:8], limit=8)
    risk = str(result.get("risk_level") or "中")
    seed = _stable_seed(f"{alarm_text}|{itype}|{risk}")
    same_address_history: list[dict[str, Any]] = []
    for j, r in enumerate(rows):
        lon, lat = _demo_lon_lat(seed, j, 1)
        same_address_history.append(
            {
                "alarm_no": r.get("alarm_no", ""),
                "received_at": r.get("received_at", ""),
                "category": r.get("category", ""),
                "location_text": r.get("location_text", ""),
                "summary": r.get("summary", ""),
                "risk_level": r.get("risk_level", ""),
                "lon": lon,
                "lat": lat,
            }
        )

    weapon = str((ki or {}).get("has_weapon") or "未知")
    inj = str((ki or {}).get("injuries_reported") or "未知")

    # 无历史命中时不生成周边热点/命中数演示，避免界面「始终满载」与库不一致
    hotspots: list[dict[str, Any]] = []
    tagged = 0
    fugitive = 0
    if rows:
        n_hot = 2 + (seed % 3)
        base_names = [
            ("事发点半径约 300m 商圈出入口", "人流大、夜间纠纷多"),
            ("最近地铁站口", "逃窜路径高频点"),
            ("辖区视频卡口 #V-", "可调阅轨迹"),
            ("邻近派出所巡线交汇点", "增援汇合"),
        ]
        for i in range(min(n_hot, len(base_names))):
            nm, note = base_names[i]
            if "#V-" in nm:
                nm = f"{nm}{seed % 900 + 100}"
            hlon, hlat = _demo_lon_lat(seed, i, 9)
            hotspots.append(
                {
                    "name": nm,
                    "level": ["一般", "较高", "高"][(seed + i) % 3],
                    "note": note,
                    "distance_hint_m": 120 + (seed % 5) * 80 + i * 40,
                    "lon": hlon,
                    "lat": hlat,
                }
            )

        tagged = (seed % 4) if risk in ("高", "紧急") else (seed % 3)
        fugitive = 1 if (itype in ("盗窃抢劫", "涉毒案件", "反恐处置") and risk in ("高", "紧急")) else 0

    equipment = _equipment_rules(itype, risk, weapon, inj, seed)

    disc = "历史相似记录来自演示种子库，仅在与报警文本/辖区相关时列出；专网请对接实库。"
    if not rows:
        disc += " 当前无命中，周边风险演示已省略。"

    return {
        "version": 1,
        "location_focus": district or (loc_line[:24] if loc_line else "未解析到区县关键词"),
        "location_detail": loc_line or "（模型关键信息中暂无地点，已用报警原文做相似检索）",
        "disclaimer": disc,
        "same_address_history": same_address_history,
        "high_risk_nearby": {
            "radius_hint_m": 800,
            "hotspots": hotspots,
            "personnel_risk": {
                "tagged_nearby": int(tagged),
                "fugitive_watch_hit": int(fugitive),
                "note": (
                    "无历史相似命中，未生成重点人/布控演示计数。"
                    if not rows
                    else "「重点人」为半径内登记/布控命中演示计数；非人脸识别结果。"
                ),
            },
        },
        "equipment_checklist": equipment,
    }


def _equipment_rules(itype: str, risk: str, weapon: str, inj: str, seed: int) -> list[dict[str, Any]]:
    """必带/视情 + 简要理由，便于一线逐项勾选。"""
    items: list[dict[str, Any]] = []
    req = "必带"
    opt = "视情"

    def add(item: str, level: str, reason: str) -> None:
        items.append({"item": item, "level": level, "reason": reason})

    add("执法记录仪", req, "处警留痕")
    add("对讲机 / 数字电台", req, "与指挥中心保持通联")
    if risk in ("高", "紧急") or "是" in weapon:
        add("防刺服 / 防割手套", req, "涉暴力或持械风险")
        add("盾牌", opt, "对峙与接近控制")
    if "是" in inj or itype in ("医疗急救", "交通事故"):
        add("急救包 / AED（若配置）", req, "可能有人伤")
    if itype in ("交通事故",):
        add("反光锥、警示灯", req, "现场防护")
    if itype in ("火灾",):
        add("防烟口罩、热成像仪（若配备）", opt, "火场外围侦检")
    if itype in ("涉毒案件", "反恐处置"):
        add("约束带、物证袋", req, "人证物保全")
    if itype in ("打架斗殴", "家庭纠纷"):
        add("约束带", opt, "快速带离现场")
    if seed % 2 == 0:
        add("便携式照明", opt, "夜间或地下空间")

    return items
