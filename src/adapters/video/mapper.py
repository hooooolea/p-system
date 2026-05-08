from __future__ import annotations

from typing import Any

import uuid


def video_alert_to_canonical_patch(external_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """视频监控告警 → Canonical 补丁（可关联已有 alarm_no）。"""
    camera_id = str(payload.get("camera_id") or "")
    alert_at = str(payload.get("alert_at") or "")
    alert_type = str(payload.get("alert_type") or "")
    related = str(payload.get("related_alarm_no") or "").strip()
    snap = payload.get("snapshot") or {}
    ref_type = str(snap.get("ref_type") or "object_key")
    ref_value = str(snap.get("ref_value") or "")

    summary = f"监控告警：{alert_type or 'unknown'}，摄像头 {camera_id}，时间 {alert_at}"

    att: dict[str, Any] | None = None
    if ref_value:
        att = {
            "attachment_id": str(uuid.uuid4()),
            "source_system": "video",
            "media_type": "image",
            "ref_type": ref_type,
            "ref_value": ref_value,
            "captured_at": alert_at,
            "metadata": {"camera_id": camera_id, "alert_type": alert_type},
        }

    patch: dict[str, Any] = {
        "external_refs": [{"system": "video", "id": external_id, "role": "supplement"}],
        "visual": {"summary": summary, "camera_id": camera_id, "alert_type": alert_type},
        "rag_hints": {"extra_query": f"{alert_type} {camera_id}"[:200]},
        "audit": {"adapter_versions": {"video": "0.1.0"}},
    }
    if related:
        patch["structured"] = {"alarm_no": related}
    if att:
        patch["attachments"] = [att]
    return patch
