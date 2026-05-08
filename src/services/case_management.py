"""案件管理：与研判快照 `case` 字段联动，闭环状态、进度与列表 KPI。"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

_VALID_STATUS = frozenset({"investigating", "closed", "suspended"})
_STATUS_LABEL = {"investigating": "调查中", "closed": "已结案", "suspended": "已搁置"}


def display_case_no(analysis_id: str) -> str:
    s = str(analysis_id or "").strip()
    if not s:
        return "—"
    if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", s, re.I):
        return f"PJ-{s[:8].upper()}"
    tail = s.replace("analysis_", "")
    return f"PJ-{tail[-10:].upper()}" if len(tail) > 10 else f"PJ-{tail.upper()}"


def _stable_progress_seed(aid: str) -> int:
    return int(hashlib.sha256(aid.encode("utf-8", errors="ignore")).hexdigest()[:6], 16) % 41


def default_case_dict(created_at: str | None, analysis_id: str) -> dict[str, Any]:
    base = 28 + _stable_progress_seed(analysis_id)
    return {
        "status": "investigating",
        "progress": min(88, base),
        "source": "auto",
        "note": "",
        "updated_at": created_at or datetime.now(timezone.utc).isoformat(),
    }


def ensure_case_on_snapshot(snap: dict[str, Any]) -> dict[str, Any]:
    """补全并规范化 snap['case']，原地修改。"""
    aid = str(snap.get("analysis_id") or "")
    created = str(snap.get("created_at") or "")
    raw = snap.get("case")
    if not isinstance(raw, dict):
        snap["case"] = default_case_dict(created, aid)
        return snap["case"]
    st = str(raw.get("status") or "investigating").strip().lower()
    if st not in _VALID_STATUS:
        st = "investigating"
    prog = raw.get("progress")
    try:
        p = int(float(prog))
    except (TypeError, ValueError):
        p = 28 + _stable_progress_seed(aid)
    p = max(0, min(100, p))
    snap["case"] = {
        "status": st,
        "progress": p,
        "source": str(raw.get("source") or "auto"),
        "note": str(raw.get("note") or "")[:500],
        "updated_at": str(raw.get("updated_at") or created or datetime.now(timezone.utc).isoformat()),
    }
    return snap["case"]


def _feedback_override_status(snap: dict[str, Any]) -> tuple[str, int] | None:
    fb = snap.get("user_feedback")
    if fb == "adopt":
        return "closed", 100
    if fb == "ignore":
        return "suspended", min(55, max(35, int(snap.get("case", {}).get("progress") or 40)))
    return None


def _review_override_status(review: dict[str, Any] | None) -> str | None:
    if not review:
        return None
    choice = str(review.get("review_result") or "")
    if any(x in choice for x in ("结案", "关闭", "归档", "属实", "认可")):
        return "closed"
    if any(x in choice for x in ("搁置", "挂起", "暂停")):
        return "suspended"
    if any(x in choice for x in ("补充", "核实", "待查", "再研判")):
        return "investigating"
    return None


def latest_review_for(session_state: Any, analysis_id: str) -> dict[str, Any] | None:
    aid = str(analysis_id).strip()
    for r in reversed(list(session_state.get("review_records") or [])):
        if str(r.get("analysis_id") or "") == aid:
            return r if isinstance(r, dict) else None
    return None


def effective_case_view(snap: dict[str, Any], session_state: Any) -> dict[str, Any]:
    """用于列表/卡片展示的最终状态（采纳/忽略优先于手工状态）。"""
    ensure_case_on_snapshot(snap)
    case = dict(snap["case"])
    ov = _feedback_override_status(snap)
    if ov:
        status, progress = ov
        reason = "专页反馈：采纳" if snap.get("user_feedback") == "adopt" else "专页反馈：忽略"
    else:
        status = case["status"]
        progress = case["progress"]
        reason = ""
        if case.get("source") == "manual":
            reason = "人工更新"
        else:
            rev_st = _review_override_status(latest_review_for(session_state, str(snap.get("analysis_id") or "")))
            if rev_st:
                status = rev_st
                if status == "closed":
                    progress = 100
                elif status == "suspended":
                    progress = min(progress, 50)
                reason = "复核记录"
    return {
        "status": status,
        "status_label": _STATUS_LABEL.get(status, status),
        "progress": progress,
        "reason": reason,
        "stored_status": case["status"],
        "stored_progress": case["progress"],
    }


def build_case_card(session_state: Any, item: dict[str, Any], snap: dict[str, Any] | None) -> dict[str, Any]:
    aid = str(item.get("id") or "").strip()
    result = (snap or {}).get("result") if isinstance((snap or {}).get("result"), dict) else {}
    itype = str(item.get("incident_type") or result.get("incident_type") or "其他")
    summary = str(item.get("summary") or result.get("summary") or "").strip()
    title = f"{itype}案" if itype and itype != "未知" else "警情研判"
    desc = summary or str(item.get("original_text") or "")[:160] or "（无摘要）"
    if snap is None:
        snap_min: dict[str, Any] = {
            "analysis_id": aid,
            "created_at": "",
            "user_feedback": None,
            "case": default_case_dict("", aid),
        }
        ev = effective_case_view(snap_min, session_state)
    else:
        ensure_case_on_snapshot(snap)
        ev = effective_case_view(snap, session_state)
    return {
        "analysis_id": aid,
        "display_no": display_case_no(aid),
        "title": title,
        "description": desc,
        "incident_type": itype,
        "risk_level": str(item.get("risk_level") or result.get("risk_level") or "未知"),
        "time": str(item.get("time") or ""),
        "elapsed_sec": float(item.get("elapsed") or 0.0),
        "status": ev["status"],
        "status_label": ev["status_label"],
        "progress": ev["progress"],
        "status_reason": ev["reason"],
        "user_feedback": snap.get("user_feedback") if snap else None,
    }


def build_cases_payload(session_state: Any, history_items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    store: dict[str, Any] = session_state.setdefault("analysis_by_id", {})
    out: list[dict[str, Any]] = []
    for item in history_items:
        aid = str(item.get("id") or "").strip()
        if not aid:
            continue
        snap = store.get(aid)
        if snap is None:
            try:
                from adapters.persistence.supabase_analysis import fetch_snapshot_from_supabase

                snap = fetch_snapshot_from_supabase(aid)
                if snap:
                    ensure_case_on_snapshot(snap)
                    store[aid] = snap
            except Exception:
                snap = None
        out.append(build_case_card(session_state, item, snap))
    out.sort(key=lambda c: str(c.get("time") or ""), reverse=True)
    kpis = compute_kpis(out)
    return out, kpis


def compute_kpis(cards: list[dict[str, Any]]) -> dict[str, int]:
    total = len(cards)
    inv = sum(1 for c in cards if c.get("status") == "investigating")
    clo = sum(1 for c in cards if c.get("status") == "closed")
    sus = sum(1 for c in cards if c.get("status") == "suspended")
    return {"total": total, "investigating": inv, "closed": clo, "suspended": sus}


def apply_manual_case_update(
    session_state: Any,
    analysis_id: str,
    *,
    status: str,
    progress: int | None = None,
    note: str = "",
) -> dict[str, Any]:
    aid = str(analysis_id).strip()
    if not aid:
        raise ValueError("analysis_id 无效")
    st = str(status).strip().lower()
    if st not in _VALID_STATUS:
        raise ValueError("status 须为 investigating / closed / suspended")
    store: dict[str, Any] = session_state.setdefault("analysis_by_id", {})
    snap = store.get(aid)
    if snap is None:
        try:
            from adapters.persistence.supabase_analysis import fetch_snapshot_from_supabase

            snap = fetch_snapshot_from_supabase(aid)
        except Exception:
            snap = None
    if not snap:
        raise LookupError("未找到该研判/案件")
    ensure_case_on_snapshot(snap)
    case = snap["case"]
    case["status"] = st
    if progress is not None:
        try:
            case["progress"] = max(0, min(100, int(progress)))
        except (TypeError, ValueError):
            pass
    elif st == "closed":
        case["progress"] = 100
    elif st == "suspended":
        case["progress"] = min(case.get("progress", 40), 50)
    case["source"] = "manual"
    case["note"] = str(note or "")[:500]
    case["updated_at"] = datetime.now(timezone.utc).isoformat()
    snap["case"] = case
    store[aid] = snap
    try:
        from adapters.persistence.supabase_analysis import update_case_mgmt_if_configured

        update_case_mgmt_if_configured(aid, case)
    except Exception:
        pass
    return case


def sync_case_from_presentation_feedback(snap: dict[str, Any], feedback: str) -> None:
    """专页 adopt/ignore 时同步 case（便于案件列表一致）。"""
    fb = str(feedback).strip().lower()
    if fb not in ("adopt", "ignore"):
        return
    ensure_case_on_snapshot(snap)
    if fb == "adopt":
        snap["case"]["status"] = "closed"
        snap["case"]["progress"] = 100
        snap["case"]["source"] = "feedback"
        snap["case"]["note"] = "采纳研判结论"
    else:
        snap["case"]["status"] = "suspended"
        snap["case"]["progress"] = min(50, max(30, int(snap["case"].get("progress") or 40)))
        snap["case"]["source"] = "feedback"
        snap["case"]["note"] = "忽略/待复核"
    snap["case"]["updated_at"] = datetime.now(timezone.utc).isoformat()


def sync_case_from_review(session_state: Any, analysis_id: str, review_choice: str) -> None:
    store: dict[str, Any] = session_state.setdefault("analysis_by_id", {})
    aid = str(analysis_id).strip()
    snap = store.get(aid)
    if not snap:
        return
    ensure_case_on_snapshot(snap)
    if snap.get("user_feedback") in ("adopt", "ignore"):
        return
    fake_review = {"review_result": review_choice}
    st = _review_override_status(fake_review)
    if not st:
        return
    snap["case"]["status"] = st
    if st == "closed":
        snap["case"]["progress"] = 100
    snap["case"]["source"] = "review"
    snap["case"]["updated_at"] = datetime.now(timezone.utc).isoformat()
    store[aid] = snap
    try:
        from adapters.persistence.supabase_analysis import update_case_mgmt_if_configured

        update_case_mgmt_if_configured(aid, snap["case"])
    except Exception:
        pass
