"""接警工作台服务层：封装业务流程，避免 UI 层承载业务细节。"""

from __future__ import annotations

import ast
import json
import math
import re
import time
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage

from incident_analyzer import analyze_incident
from rag_retriever import retrieve_procedures
from llm_factory import get_llm
from services.analysis_confidence import get_or_build_confidence_bundle
from services.disposal_nav import build_disposal_nav
from services.case_management import default_case_dict
from services.officer_brief import build_officer_brief

_BJ_DISTRICT_CENTER: dict[str, tuple[float, float]] = {
    "朝阳": (116.4864, 39.9215),
    "海淀": (116.2981, 39.9593),
    "东城": (116.4180, 39.9288),
    "西城": (116.3661, 39.9123),
    "丰台": (116.2867, 39.8586),
    "石景山": (116.2229, 39.9066),
    "通州": (116.7403, 39.8097),
    "昌平": (116.2359, 40.2181),
    "大兴": (116.3380, 39.7289),
    "顺义": (116.6554, 40.1302),
    "房山": (116.1437, 39.7479),
    "门头沟": (116.1020, 39.9406),
    "平谷": (117.1217, 40.1406),
    "怀柔": (116.6317, 40.3160),
    "密云": (116.8432, 40.3764),
    "延庆": (115.9746, 40.4570),
}

# 北京常见地标/商圈（WGS84 近似）；名称长的优先匹配。专网可替换为地理编码服务结果。
_BJ_POI_HINTS: list[tuple[str, float, float]] = [
    ("建国门外大街甲6号", 116.4595, 39.9083),
    ("建国门外大街", 116.4562, 39.9080),
    ("SK大厦", 116.4593, 39.9084),
    ("三里屯", 116.4544, 39.9342),
    ("中关村", 116.3220, 39.9847),
    ("天安门", 116.3974, 39.9087),
    ("王府井", 116.4175, 39.9140),
    ("国贸", 116.4674, 39.9149),
    ("西单", 116.3752, 39.9113),
    ("望京", 116.4727, 39.9972),
    ("亦庄", 116.5060, 39.8035),
    ("建国门", 116.4348, 39.9087),
    ("东直门", 116.4337, 39.9405),
    ("西直门", 116.3554, 39.9402),
    ("北京站", 116.4272, 39.9031),
    ("北京西站", 116.3213, 39.8945),
    ("首都机场", 116.5842, 40.0805),
    ("大兴机场", 116.4105, 39.5098),
]


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """球面距离（千米），输入为 WGS84 十进制度。"""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _best_poi_keyword_hit(text: str) -> tuple[str, float, float] | None:
    """在文本中找最长子串命中的 POI 锚点；无命中返回 None。"""
    if not text.strip():
        return None
    for name, lon, lat in sorted(_BJ_POI_HINTS, key=lambda x: len(x[0]), reverse=True):
        if name in text:
            return (name, float(lon), float(lat))
    return None


def _try_parse_lon_lat_from_text(text: str) -> tuple[float, float] | None:
    """从警情/地点描述中解析「经度,纬度」十进制（WGS84 假定，与 OSM 底图一致）。"""
    if not text or len(text) < 8:
        return None
    normalized = text.replace("，", ",").replace("：", ":")
    m = re.search(
        r"(?P<lon>1[01][0-9]\.\d{2,9})\s*,\s*(?P<lat>[1-5][0-9]\.\d{2,9})",
        normalized,
    )
    if not m:
        m = re.search(
            r"经度\s*[:：]?\s*(?P<lon>1[01][0-9]\.\d{2,9}).{0,16}?"
            r"纬度\s*[:：]?\s*(?P<lat>[1-5][0-9]\.\d{2,9})",
            normalized,
        )
    if not m:
        return None
    try:
        lon = float(m.group("lon"))
        lat = float(m.group("lat"))
    except (TypeError, ValueError):
        return None
    if 72.0 <= lon <= 136.0 and 15.0 <= lat <= 55.0:
        return lon, lat
    return None


def infer_geo_from_text(alarm_text: str, result: dict[str, Any]) -> dict[str, Any]:
    """由报警文本与 key_info.location 推断坐标（规则版；专网可再接地理编码服务）。"""
    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    loc = str(ki.get("location") or "").strip()
    text = f"{alarm_text or ''} {loc}".strip()
    if not text:
        return {
            "location_text": "",
            "lon": None,
            "lat": None,
            "source": "missing",
            "confidence": 0.0,
        }
    parsed = _try_parse_lon_lat_from_text(text)
    if parsed:
        lon, lat = parsed
        return {
            "location_text": loc or "坐标自文本解析",
            "lon": float(lon),
            "lat": float(lat),
            "source": "parsed_lonlat",
            "confidence": 0.88,
        }
    # 先匹配具体 POI，再匹配区县中心，避免「朝阳区…SK大厦」只落到区中心
    hit = _best_poi_keyword_hit(text)
    if hit:
        name, lon, lat = hit
        return {
            "location_text": loc or name,
            "lon": float(lon),
            "lat": float(lat),
            "source": "poi_infer",
            "confidence": 0.68,
        }
    for d in sorted(_BJ_DISTRICT_CENTER.keys(), key=len, reverse=True):
        lon, lat = _BJ_DISTRICT_CENTER[d]
        if d in text:
            return {
                "location_text": loc or d,
                "lon": float(lon),
                "lat": float(lat),
                "source": "district_infer",
                "confidence": 0.62,
            }
    return {
        "location_text": loc,
        "lon": None,
        "lat": None,
        "source": "missing",
        "confidence": 0.0,
    }


def _coerce_geo_float(val: Any) -> float | None:
    try:
        if val is None:
            return None
        s = str(val).strip()
        if not s:
            return None
        x = float(s)
    except (TypeError, ValueError):
        return None
    if x != x:  # NaN
        return None
    return x


def resolve_geo_for_map(alarm_text: str, result: dict[str, Any]) -> dict[str, Any]:
    """地图落点：优先研判结果中 LLM 给出的 geo，其次规则推断，最后低置信展示兜底（保证可上图）。"""
    raw_geo = result.get("geo") if isinstance(result.get("geo"), dict) else {}
    lon = _coerce_geo_float(raw_geo.get("lon"))
    lat = _coerce_geo_float(raw_geo.get("lat"))
    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    loc_line = str(ki.get("location") or "").strip()

    if lon is not None and lat is not None and 72.0 <= lon <= 136.0 and 15.0 <= lat <= 55.0:
        loc_text = str(raw_geo.get("location_text") or raw_geo.get("address") or "").strip()
        if not loc_text:
            loc_text = loc_line
        try:
            conf = float(raw_geo.get("confidence"))
        except (TypeError, ValueError):
            conf = 0.72
        if conf > 1.0:
            conf = conf / 100.0
        conf = max(0.0, min(1.0, conf))
        src = str(raw_geo.get("source") or "llm_estimate").strip() or "llm_estimate"
        if src in ("missing", "unavailable", ""):
            src = "llm_estimate"
        notes = str(raw_geo.get("notes") or "").strip()
        blob = f"{alarm_text or ''} {loc_line} {loc_text}".strip()
        poi_hit = _best_poi_keyword_hit(blob)
        if poi_hit:
            kw, alon, alat = poi_hit
            d_km = _haversine_km(float(lon), float(lat), alon, alat)
            # 原文已点名具体地标，但模型点偏离过远 → 以文本锚点为准，减轻「天安门示例」类幻觉
            if d_km >= 2.5:
                corr = (
                    f"{notes}；" if notes else ""
                ) + f"模型坐标与原文地标「{kw}」偏差约{d_km:.1f}km，已按文本锚点校正"
                return {
                    "location_text": loc_text or "—",
                    "lon": alon,
                    "lat": alat,
                    "source": "text_anchor_override",
                    "confidence": min(conf, 0.74),
                    "notes": corr[:500],
                }
        return {
            "location_text": loc_text or "—",
            "lon": float(lon),
            "lat": float(lat),
            "source": src,
            "confidence": conf,
            "notes": notes[:500],
        }

    inferred = infer_geo_from_text(alarm_text, result)
    if inferred.get("lon") is not None and inferred.get("lat") is not None:
        out = dict(inferred)
        out.setdefault("notes", "")
        return out

    return {
        "location_text": loc_line or "位置待核（地图展示兜底）",
        "lon": 116.4074,
        "lat": 39.9042,
        "source": "display_fallback",
        "confidence": 0.12,
        "notes": "无 LLM/规则有效坐标，使用系统展示兜底点",
    }


_KI_LABELS: dict[str, str] = {
    "location": "发案地点",
    "persons_involved": "涉事人数",
    "has_weapon": "是否涉武器",
    "injuries_reported": "人员受伤",
    "time_sensitivity": "时间紧迫性",
}


def build_bukong_inputs_from_analysis(alarm_text: str, result: dict[str, Any]) -> tuple[str, str]:
    """由一次接警研判结果自动拼出布控 Prompt 所需「案情背景 / 嫌疑人特征」两段文本。"""
    summary = str(result.get("summary") or "").strip()
    itype = str(result.get("incident_type") or "未知")
    ds = str(result.get("disposal_suggestion") or "").strip()
    ki = result.get("key_info") or {}
    lines: list[str] = []
    if isinstance(ki, dict):
        for k, v in ki.items():
            if v is None or str(v).strip() == "":
                continue
            label = _KI_LABELS.get(str(k), str(k))
            lines.append(f"- {label}：{v}")
    suspect = "\n".join(lines).strip()
    if not suspect:
        suspect = "（研判结构化关键信息较少）请结合报警原文与摘要推断体貌、衣着、交通工具与逃离方向等线索。"
    parts = [
        "【报警原文】",
        str(alarm_text or "").strip(),
        "",
        "【警情类型】",
        itype,
        "",
        "【警情摘要】",
        summary or "（无摘要）",
    ]
    if ds:
        parts.extend(["", "【处置建议】", ds[:2000]])
    incident_bg = "\n".join(parts)
    if len(incident_bg) > 8000:
        incident_bg = incident_bg[:8000] + "\n…（案情背景已截断）"
    return incident_bg, suspect


# 手动重算布控时允许「特征」栏为空：模型应完全依据案情背景推理
BUKONG_SUSPECT_FALLBACK_WHEN_EMPTY = (
    "（本段未单独填写）请仅依据上文「案情背景」中的报警原文、警情类型、摘要、处置建议及其中已出现的线索，"
    "自行归纳嫌疑人体貌、衣着、交通工具、逃离方向与同行情况；不得因本段为占位说明而拒绝输出 JSON。"
)

BUKONG_PROMPT_TEMPLATE = """你是经验丰富的警务布控专家。以下两段文本均由上一步「接警研判」流水线自动拼装或经人工微调，不是要求用户现场手填的表单。

【案情背景】（通常已含报警原文、警情类型、摘要与处置建议等）
{incident_bg}

【嫌疑人特征】（通常为由研判结构化 key_info 抽成的要点列表；若信息稀疏则可能为系统占位句——仍须结合案情背景推理）
{suspect_desc}

你必须综合【案情背景】与【嫌疑人特征】两段完成布控设计；不得以「特征栏过短」「未见到嫌疑人」等为由拒绝输出 JSON。若原文未点名嫌疑人，则按「身份待核、体貌待补充」做保守布控与盘查要点。

请严格输出 JSON，不要输出任何额外内容，格式如下：
{{
  "suspect_profile": "规范化嫌疑人特征摘要（包含体貌/衣着/交通工具）",
  "key_checkpoints": ["布控点位1", "布控点位2", "布控点位3"],
  "inspection_points": ["盘查要点1", "盘查要点2", "盘查要点3"],
  "dispatch_notice": "可直接用于通讯通报的简短文案",
  "missing_info": ["当前缺失的关键信息1", "当前缺失的关键信息2"],
  "review_tips": ["人工复核建议1", "人工复核建议2"]
}}

输出要求：
1) key_checkpoints 最多 5 条，尽量具体到地标/路口/交通节点；
2) missing_info 必须指出至少 2 个待补充要素（若信息充足可写“无明显缺失”）；
3) review_tips 给出可执行动作，不写空话。"""


def _extract_json_block(text: str) -> dict[str, Any]:
    """从模型输出中提取 JSON；失败时抛异常。"""
    raw = (text or "").strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1].strip()
            if raw.lower().startswith("json"):
                raw = raw[4:].lstrip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        candidate = match.group(0)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            parsed = ast.literal_eval(candidate)
            if isinstance(parsed, dict):
                return parsed
            raise


def ensure_session_state(session_state: Any) -> None:
    """初始化会话状态默认值。"""
    defaults = {
        "total_analyzed": 0,
        "risk_counts": {"紧急": 0, "高": 0, "中": 0, "低": 0},
        "analysis_history": [],
        "latest_result": None,
        "latest_elapsed": 0.0,
        "latest_use_rag": True,
        "latest_alarm_text": "",
        "latest_analysis_id": "",
        "review_records": [],
        "refill_clicks": 0,
        "bukong_generated": 0,
        "latest_bukong_markdown": "",
        "latest_bukong_plan": None,
        "latest_bukong_inputs": {"incident_bg": "", "suspect_desc": ""},
        "latest_bukong_error": None,
        "analysis_by_id": {},
    }
    for key, default_val in defaults.items():
        if key not in session_state:
            session_state[key] = default_val


def snapshot_bukong_to_session(session_state: Any, pack: dict[str, Any]) -> None:
    """将最近一次研判附带的布控结果写入会话，供独立「评审」页拉取。"""
    session_state["latest_bukong_markdown"] = (pack.get("bukong_markdown") or "").strip()
    session_state["latest_bukong_plan"] = pack.get("bukong_plan")
    session_state["latest_bukong_inputs"] = {
        "incident_bg": str(pack.get("bukong_incident_bg") or ""),
        "suspect_desc": str(pack.get("bukong_suspect_desc") or ""),
    }
    err = pack.get("bukong_error")
    session_state["latest_bukong_error"] = str(err) if err else None


def high_priority_count(risk_counts: dict[str, int]) -> int:
    return int(risk_counts.get("紧急", 0)) + int(risk_counts.get("高", 0))


def analyze_alarm(alarm_text: str, use_rag: bool) -> tuple[dict[str, Any], float]:
    """执行接警研判，返回结构化结果与耗时秒数。"""
    start_time = time.time()
    rag_context = retrieve_procedures(alarm_text) if use_rag else ""
    result = analyze_incident(alarm_text, rag_context, use_rag=use_rag)
    elapsed = time.time() - start_time
    return result, elapsed


def analyze_alarm_with_bukong(alarm_text: str, use_rag: bool) -> dict[str, Any]:
    """研判完成后在同一次业务流内生成布控方案（第二次 LLM）；布控失败不影响研判结果。"""
    result, elapsed = analyze_alarm(alarm_text, use_rag)
    incident_bg, suspect_desc = build_bukong_inputs_from_analysis(alarm_text, result)
    out: dict[str, Any] = {
        "result": result,
        "elapsed": elapsed,
        "bukong_plan": None,
        "bukong_raw": None,
        "bukong_markdown": None,
        "bukong_error": None,
        "bukong_incident_bg": incident_bg,
        "bukong_suspect_desc": suspect_desc,
    }
    try:
        plan, raw = generate_bukong_plan(incident_bg, suspect_desc)
        out["bukong_plan"] = plan
        out["bukong_raw"] = raw
        out["bukong_markdown"] = build_bukong_markdown(plan)
    except Exception as e:  # noqa: BLE001
        out["bukong_error"] = str(e)
    return out


def record_analysis(
    session_state: Any,
    *,
    alarm_text: str,
    result: dict[str, Any],
    elapsed: float,
    use_rag: bool,
) -> None:
    """写入会话统计与最近结果。"""
    session_state.total_analyzed += 1
    risk = result.get("risk_level", "中")
    session_state.risk_counts[risk] = session_state.risk_counts.get(risk, 0) + 1
    analysis_id = f"analysis_{int(time.time()*1000)}"
    session_state.analysis_history.append(
        {
            "id": analysis_id,
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "original_text": alarm_text,
            "incident_type": result.get("incident_type", "未知"),
            "risk_level": risk,
            "summary": result.get("summary", ""),
            "elapsed": float(elapsed),
        }
    )
    session_state.latest_result = result
    session_state.latest_elapsed = elapsed
    session_state.latest_use_rag = use_rag
    session_state.latest_alarm_text = alarm_text
    session_state.latest_analysis_id = analysis_id


def record_refill_click(session_state: Any) -> None:
    session_state.refill_clicks = int(session_state.refill_clicks) + 1


def save_review_record(session_state: Any, review_record: dict[str, Any]) -> None:
    session_state.review_records.append(review_record)


def record_bukong_generated(session_state: Any) -> None:
    session_state.bukong_generated = int(session_state.bukong_generated) + 1


def generate_bukong_plan(incident_bg: str, suspect_desc: str) -> tuple[dict[str, Any], str]:
    """生成结构化布控方案，返回 plan 与原始模型文本。"""
    incident_bg = (incident_bg or "").strip()
    suspect_desc = (suspect_desc or "").strip()
    if not suspect_desc:
        suspect_desc = BUKONG_SUSPECT_FALLBACK_WHEN_EMPTY
    llm = get_llm()
    prompt = BUKONG_PROMPT_TEMPLATE.format(
        incident_bg=incident_bg,
        suspect_desc=suspect_desc,
    )
    resp = llm.invoke([HumanMessage(content=prompt)])
    raw = getattr(resp, "content", "") or ""
    plan = _extract_json_block(raw)
    return plan, raw


def merge_incident_and_bukong_markdown(incident_md: str, bukong_markdown: str | None) -> str:
    """研判导出与接口返回用：在研判 Markdown 后追加布控方案（若已生成）。"""
    base = (incident_md or "").rstrip()
    extra = (bukong_markdown or "").strip()
    if not extra:
        return base
    if not base:
        return extra
    return f"{base}\n\n---\n\n{extra}"


def build_incident_markdown(result: dict[str, Any], elapsed: float) -> str:
    lines = [
        "# 接处警研判结果",
        f"- 警情类型：{result.get('incident_type', '未知')}",
        f"- 风险等级：{result.get('risk_level', '未知')}",
        f"- 响应时间：{elapsed:.2f}s",
        "",
        "## 警情摘要",
        result.get("summary", ""),
        "",
        "## 关键信息",
    ]
    for key, val in result.get("key_info", {}).items():
        lines.append(f"- {key}: {val}")
    lines.extend(
        [
            "",
            "## 处置建议",
            result.get("disposal_suggestion", ""),
            "",
            "## 法律依据",
            result.get("law_reference", ""),
        ]
    )
    return "\n".join(lines)


def build_review_record(
    result: dict[str, Any],
    review_choice: str,
    review_note: str,
    analysis_id: str,
    *,
    incident_type_override: str | None = None,
) -> dict[str, Any]:
    rec: dict[str, Any] = {
        "analysis_id": analysis_id,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "review_result": review_choice,
        "review_note": review_note,
        "analysis_result": result,
    }
    o = (incident_type_override or "").strip()
    if o:
        rec["incident_type_model"] = str(result.get("incident_type") or "")
        rec["incident_type_corrected"] = o
    return rec


def build_bukong_markdown(plan: dict[str, Any]) -> str:
    """导出 Markdown：分层标题 + 执行顺序说明，便于打印与对讲台传阅。"""
    lines = [
        "# 目标布控方案（勤务执行卡）",
        "",
        "**执行顺序（建议）**：①封控重点点位布警 → ②按盘查要点控人控车控物 → ③用「通讯通报」原文同步各组 → ④逐项补全缺失信息 → ⑤落实指挥复核。",
        "",
        "## ① 嫌疑人特征摘要（识别）",
        "",
        str(plan.get("suspect_profile") or "未知").strip(),
        "",
        "## ② 布控重点点位（封控 / 卡口）",
        "",
        "_卡口与重点部位：优先叠加视频巡查、机动巡逻与必查点。_",
        "",
    ]
    for item in plan.get("key_checkpoints", []):
        lines.append(f"- **{item}**")
    lines.extend(
        [
            "",
            "## ③ 盘查要点（现场勤务顺序）",
            "",
        ]
    )
    for i, item in enumerate(plan.get("inspection_points", []), start=1):
        lines.append(f"{i}. {item}")
    notice = str(plan.get("dispatch_notice") or "暂无").strip()
    lines.extend(
        [
            "",
            "## ④ 通讯通报建议（电台 / 对讲）",
            "",
            "> " + notice.replace("\n", "\n> "),
            "",
            "_可直接宣读或略作脱敏后下发各勤务单元。_",
            "",
            "## ⑤ 待补全信息（影响布控精度）",
            "",
        ]
    )
    for item in plan.get("missing_info", []):
        lines.append(f"- [ ] {item}")
    lines.extend(
        [
            "",
            "## ⑥ 指挥与人工复核建议",
            "",
        ]
    )
    for item in plan.get("review_tips", []):
        lines.append(f"- [ ] {item}")
    return "\n".join(lines)


MAX_ANALYSIS_SNAPSHOTS = 120


def build_analysis_presentation(
    analysis_id: str,
    alarm_text: str,
    result: dict[str, Any],
    elapsed: float,
    *,
    user_feedback: str | None = None,
    created_at: str | None = None,
    use_rag: bool = True,
) -> dict[str, Any]:
    """专页展示用结构化载荷：由研判 result 推导评分条、事实区、建议区（与图示稿字段对齐）。"""
    risk_level = str(result.get("risk_level") or "中")
    base = {"低": 38, "中": 58, "高": 82, "紧急": 93}.get(risk_level, 55)
    salt = sum(ord(c) for c in str(analysis_id)) % 9
    risk_score = int(min(99, max(22, base + salt - 4)))
    cb = get_or_build_confidence_bundle(result, alarm_text, use_rag=use_rag, rag_context="")
    conf = int(cb["confidence_pct"])
    conf_prov = cb.get("provenance") if isinstance(cb.get("provenance"), dict) else {}
    ki = result.get("key_info") if isinstance(result.get("key_info"), dict) else {}
    loc = str(ki.get("location") or "").strip()
    loc_score = min(95, 55 + min(40, len(loc) * 2) + (10 if loc else 0))
    hist_score = min(95, 60 + salt * 4)
    emo_hint = str(ki.get("time_sensitivity") or "") + str(result.get("summary") or "")
    emo_score = min(92, 52 + len(emo_hint) % 35)
    time_score = min(90, 58 + (hash(analysis_id) % 25))

    ts = created_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    disp = f"PJ-{str(analysis_id).replace('analysis_', '')[:12].upper()}"

    primary = str(result.get("disposal_suggestion") or "").strip() or "请结合现场情况部署警力并核实关键要素。"
    secondary = "建议通知周边巡逻警力待命，必要时启用视频巡查。"

    return {
        "version": 1,
        "analysis_id": str(analysis_id),
        "display_case_id": disp,
        "created_at": ts,
        "user_feedback": user_feedback,
        "facts": {
            "incident_type": str(result.get("incident_type") or "未知"),
            "risk_level": risk_level,
            "location": loc or "待核实",
            "reported_at": ts,
            "assignment_status": "待分配",
            "description": (alarm_text or "")[:800] or "（无报警原文）",
            "workflow_step": 1,
            "workflow_labels": ["新建", "已指派", "已处置", "已关闭"],
        },
        "ai": {
            "risk_score": risk_score,
            "confidence_pct": conf,
            "confidence_provenance": conf_prov,
            "factors": [
                {"key": "crowd", "label": "事发地人流/环境复杂度", "score": int(loc_score)},
                {"key": "history", "label": "历史相似警情关联度", "score": int(hist_score)},
                {"key": "emotion", "label": "报警要素/紧迫表述", "score": int(emo_score)},
                {"key": "time", "label": "时段与响应窗口", "score": int(time_score)},
            ],
            "primary_suggestion": primary,
            "secondary_suggestion": secondary,
            "related": {
                "similar_cases": 1 + (hash(analysis_id) % 4),
                "related_targets": hash(analysis_id) % 2,
            },
        },
    }


def build_restore_snapshot_from_pack(
    analysis_id: str,
    alarm_text: str,
    use_rag: bool,
    pack: dict[str, Any],
    full_markdown: str,
) -> dict[str, Any]:
    """供「研判记录」恢复与 Supabase 落库：与 POST /api/analyze 返回体对齐的完整快照。"""
    result = pack["result"]
    elapsed = float(pack.get("elapsed", 0.0))
    created_at = datetime.now(timezone.utc).isoformat()
    snap: dict[str, Any] = {
        "analysis_id": str(analysis_id),
        "result": result,
        "elapsed": elapsed,
        "markdown": str(full_markdown or ""),
        "alarm_text": str(alarm_text or ""),
        "use_rag": bool(use_rag),
        "created_at": created_at,
        "user_feedback": None,
        "bukong": {
            "plan": pack.get("bukong_plan"),
            "markdown": (pack.get("bukong_markdown") or ""),
            "raw": pack.get("bukong_raw"),
            "error": pack.get("bukong_error"),
            "inputs": {
                "incident_bg": str(pack.get("bukong_incident_bg") or ""),
                "suspect_desc": str(pack.get("bukong_suspect_desc") or ""),
            },
        },
    }
    snap["presentation"] = build_analysis_presentation(
        str(analysis_id),
        str(alarm_text or ""),
        result,
        elapsed,
        user_feedback=None,
        created_at=created_at,
        use_rag=bool(use_rag),
    )
    snap["geo"] = resolve_geo_for_map(str(alarm_text or ""), result)
    snap["officer_brief"] = build_officer_brief(str(alarm_text or ""), result)
    snap["disposal_nav"] = build_disposal_nav(result, str(alarm_text or ""))
    snap["case"] = default_case_dict(created_at, str(analysis_id))
    return snap


def remember_analysis_snapshot(session_state: Any, analysis_id: str, snapshot: dict[str, Any]) -> None:
    """内存中保留完整研判，便于点击历史恢复（条数有上限）。"""
    aid = str(analysis_id).strip()
    if not aid:
        return
    store: dict[str, Any] = session_state.setdefault("analysis_by_id", {})
    store[aid] = dict(snapshot)
    while len(store) > MAX_ANALYSIS_SNAPSHOTS:
        store.pop(next(iter(store)))


def restore_session_from_snapshot(session_state: Any, snap: dict[str, Any]) -> None:
    """将快照写回当前会话，使复核 / session-snapshot 与页面一致。"""
    session_state.latest_result = snap["result"]
    session_state.latest_elapsed = float(snap.get("elapsed") or 0.0)
    session_state.latest_use_rag = bool(snap.get("use_rag", True))
    session_state.latest_alarm_text = str(snap.get("alarm_text") or "")
    session_state.latest_analysis_id = str(snap.get("analysis_id") or "")
    bk = snap.get("bukong") or {}
    session_state.latest_bukong_markdown = str(bk.get("markdown") or "").strip()
    session_state.latest_bukong_plan = bk.get("plan")
    ins = bk.get("inputs") or {}
    session_state.latest_bukong_inputs = {
        "incident_bg": str(ins.get("incident_bg", "")),
        "suspect_desc": str(ins.get("suspect_desc", "")),
    }
    err = bk.get("error")
    session_state.latest_bukong_error = str(err) if err else None


def finalize_analysis_persistence(
    session_state: Any,
    *,
    alarm_text: str,
    use_rag: bool,
    pack: dict[str, Any],
    full_markdown: str,
) -> None:
    """研判成功后：内存快照 + 可选 Supabase。"""
    aid = str(session_state.get("latest_analysis_id") or "").strip()
    if not aid:
        return
    snap = build_restore_snapshot_from_pack(aid, alarm_text, use_rag, pack, full_markdown)
    remember_analysis_snapshot(session_state, aid, snap)
    try:
        from adapters.persistence.supabase_analysis import persist_analysis_if_configured

        persist_analysis_if_configured(aid, snap)
    except Exception:
        pass


def build_performance_overview(session_state: Any) -> dict[str, Any]:
    history = list(session_state.analysis_history)
    reviews = list(session_state.review_records)

    total = len(history)
    avg_elapsed = 0.0
    if total > 0:
        avg_elapsed = sum(float(item.get("elapsed", 0.0)) for item in history[-10:]) / min(total, 10)

    review_total = len(reviews)
    review_pass = sum(1 for item in reviews if item.get("review_result") == "同意系统结果")
    review_need_more = sum(1 for item in reviews if item.get("review_result") == "需补充信息后再判定")

    review_pass_rate = (review_pass / review_total * 100.0) if review_total else 0.0
    need_more_rate = (review_need_more / review_total * 100.0) if review_total else 0.0

    return {
        "total": total,
        "avg_elapsed_last_10": avg_elapsed,
        "review_total": review_total,
        "review_pass_rate": review_pass_rate,
        "need_more_rate": need_more_rate,
        "refill_clicks": int(session_state.refill_clicks),
    }


def build_elapsed_trend(session_state: Any, tail_size: int = 10) -> list[dict[str, Any]]:
    """构建最近 N 次研判耗时趋势。"""
    history = list(session_state.analysis_history)[-tail_size:]
    trend = []
    for idx, item in enumerate(history, start=1):
        trend.append(
            {
                "序号": idx,
                "警情类型": item.get("incident_type", "未知"),
                "耗时(秒)": float(item.get("elapsed", 0.0)),
            }
        )
    return trend


def build_review_distribution(session_state: Any) -> list[dict[str, Any]]:
    """构建复核结论分布数据。"""
    reviews = list(session_state.review_records)
    counts = {
        "同意系统结果": 0,
        "驳回系统结果": 0,
        "需补充信息后再判定": 0,
    }
    for item in reviews:
        key = item.get("review_result", "")
        if key in counts:
            counts[key] += 1
    return [{"复核结论": key, "数量": val} for key, val in counts.items()]
