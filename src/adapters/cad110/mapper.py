from __future__ import annotations

from typing import Any


def cad110_payload_to_canonical_patch(
    external_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """将 110 接处警北向 payload 转为 Canonical 补丁（不含顶层 id）。"""
    alarm_no = str(payload.get("alarm_no") or "").strip()
    patch: dict[str, Any] = {
        "external_refs": [{"system": "cad110", "id": external_id, "role": "primary"}],
        "structured": {
            "alarm_no": alarm_no,
            "received_at": str(payload.get("received_at") or ""),
            "location_text": str(payload.get("location_text") or ""),
            "jurisdiction": str(payload.get("jurisdiction") or ""),
            "category_code": str(payload.get("category_code") or ""),
            "category_text": str(payload.get("category_text") or ""),
        },
        "unstructured": {
            "alarm_text": str(payload.get("alarm_text") or "").strip(),
        },
        "rag_hints": {
            "jurisdiction": str(payload.get("jurisdiction") or ""),
            "extra_query": str(payload.get("category_text") or payload.get("alarm_text") or "")[:200],
        },
        "audit": {"adapter_versions": {"cad110": "0.1.0"}},
    }
    rid = str(payload.get("recording_id") or "").strip()
    if rid:
        import uuid

        att_id = str(uuid.uuid4())
        patch.setdefault("attachments", []).append(
            {
                "attachment_id": att_id,
                "source_system": "cad110",
                "media_type": "audio",
                "ref_type": "object_key",
                "ref_value": f"cad/rec/{rid}.wav",
                "metadata": {"recording_id": rid},
            }
        )
    return patch
