"""研判记录可选写入 Supabase；未配置环境变量时全部为空操作。"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

_client = None


def _get_client():  # type: ignore[no-untyped-def]
    global _client
    if _client is False:
        return None
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
    )
    if not url or not key:
        _client = False
        return None
    if _client is None:
        try:
            from supabase import create_client

            _client = create_client(url, key)
        except Exception:
            _client = False
            return None
    return _client


def persist_analysis_if_configured(analysis_id: str, snap: dict[str, Any]) -> None:
    try:
        cli = _get_client()
        if not cli:
            return
        bk = snap.get("bukong") or {}
        row = {
            "id": str(analysis_id),
            "alarm_text": str(snap.get("alarm_text") or ""),
            "use_rag": bool(snap.get("use_rag", True)),
            "result_json": snap.get("result"),
            "elapsed": float(snap.get("elapsed") or 0.0),
            "markdown": str(snap.get("markdown") or ""),
            "bukong_plan": bk.get("plan"),
            "bukong_markdown": (bk.get("markdown") or None) or None,
            "bukong_error": bk.get("error"),
            "bukong_inputs": bk.get("inputs") or {},
            "presentation_json": snap.get("presentation"),
            "user_feedback": snap.get("user_feedback"),
            "case_mgmt": snap.get("case") if isinstance(snap.get("case"), dict) else {},
        }
        cli.table("incident_analyses").upsert(row).execute()
    except Exception:
        return


def _format_row_time(created_at: Any) -> str:
    if not created_at:
        return ""
    s = str(created_at)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        if len(s) >= 19 and "T" in s[:19]:
            return s[:19].replace("T", " ")
        return s[:19] if len(s) >= 19 else s


def _row_to_history_item(row: dict[str, Any]) -> dict[str, Any]:
    res = row.get("result_json") or {}
    if not isinstance(res, dict):
        res = {}
    return {
        "id": row.get("id", ""),
        "time": _format_row_time(row.get("created_at")),
        "original_text": str(row.get("alarm_text") or ""),
        "incident_type": str(res.get("incident_type", "未知")),
        "risk_level": str(res.get("risk_level", "未知")),
        "summary": str(res.get("summary", "")),
        "elapsed": float(row.get("elapsed") or 0.0),
    }


def _row_to_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    bk = {
        "plan": row.get("bukong_plan"),
        "markdown": str(row.get("bukong_markdown") or ""),
        "raw": None,
        "error": row.get("bukong_error"),
        "inputs": row.get("bukong_inputs") if isinstance(row.get("bukong_inputs"), dict) else {},
    }
    snap: dict[str, Any] = {
        "analysis_id": str(row.get("id") or ""),
        "result": row.get("result_json") or {},
        "elapsed": float(row.get("elapsed") or 0.0),
        "markdown": str(row.get("markdown") or ""),
        "alarm_text": str(row.get("alarm_text") or ""),
        "use_rag": bool(row.get("use_rag", True)),
        "bukong": bk,
        "presentation": row.get("presentation_json"),
        "user_feedback": row.get("user_feedback"),
        "created_at": row.get("created_at"),
    }
    cm = row.get("case_mgmt")
    if isinstance(cm, dict) and cm:
        snap["case"] = cm
    return snap


def update_case_mgmt_if_configured(analysis_id: str, case_data: dict[str, Any]) -> bool:
    """更新 case_mgmt；表无列或未配置 Supabase 时静默失败。"""
    try:
        cli = _get_client()
        if not cli:
            return False
        cli.table("incident_analyses").update({"case_mgmt": case_data}).eq("id", str(analysis_id)).execute()
        return True
    except Exception:
        return False


def update_feedback_if_configured(analysis_id: str, feedback: str) -> bool:
    """更新 user_feedback；成功返回 True。"""
    try:
        cli = _get_client()
        if not cli:
            return False
        cli.table("incident_analyses").update({"user_feedback": feedback}).eq("id", str(analysis_id)).execute()
        return True
    except Exception:
        return False


def list_history_if_configured(limit: int = 50) -> list[dict[str, Any]] | None:
    """已配置 Supabase 时返回列表（可为空）；未配置或查询失败返回 None 表示走内存。"""
    try:
        cli = _get_client()
        if not cli:
            return None
        res = (
            cli.table("incident_analyses")
            .select("id, created_at, alarm_text, result_json, elapsed")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        return [_row_to_history_item(r) for r in rows]
    except Exception:
        return None


def fetch_snapshot_from_supabase(analysis_id: str) -> dict[str, Any] | None:
    try:
        cli = _get_client()
        if not cli:
            return None
        res = cli.table("incident_analyses").select("*").eq("id", analysis_id).limit(1).execute()
        rows = getattr(res, "data", None) or []
        if not rows:
            return None
        return _row_to_snapshot(rows[0])
    except Exception:
        return None
