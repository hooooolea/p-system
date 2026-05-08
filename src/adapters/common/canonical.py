from __future__ import annotations

import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = "1.0.0"
ADAPTER_VERSION = "0.1.0"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _deep_merge_dict(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge_dict(out[k], v)
        elif v is not None:
            out[k] = copy.deepcopy(v)
    return out


def new_empty_structured() -> dict[str, Any]:
    return {
        "alarm_no": "",
        "received_at": "",
        "location_text": "",
        "geo": {},
        "jurisdiction": "",
        "category_code": "",
        "category_text": "",
        "priority": None,
        "operator_id": "",
    }


def new_empty_unstructured() -> dict[str, Any]:
    return {
        "alarm_text": "",
        "asr_text": "",
        "asr_locale": "zh-CN",
        "caller_profile": {},
    }


def new_canonical_shell() -> dict[str, Any]:
    now = _utc_now()
    cid = str(uuid.uuid4())
    return {
        "schema_version": SCHEMA_VERSION,
        "canonical_incident_id": cid,
        "created_at": now,
        "updated_at": now,
        "ingest_status": "draft",
        "analyze_status": "none",
        "structured": new_empty_structured(),
        "unstructured": new_empty_unstructured(),
        "attachments": [],
        "visual": {},
        "rag_hints": {},
        "external_refs": [],
        "audit": {
            "source_payload_hash": "",
            "adapter_versions": {"ingest": ADAPTER_VERSION},
            "pii_policy": "default-v1",
        },
        "_latest_analysis": None,
    }


def payload_hash(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def merge_policy_apply(base: dict[str, Any], patch: dict[str, Any], merge_policy: str = "replace_non_null") -> dict[str, Any]:
    if merge_policy != "replace_non_null":
        raise ValueError(f"unsupported merge_policy: {merge_policy}")
    merged = copy.deepcopy(base)
    for key, val in patch.items():
        if val is None:
            continue
        if key == "attachments" and isinstance(val, list):
            existing = {a.get("attachment_id") for a in merged.get("attachments") or [] if isinstance(a, dict)}
            for att in val:
                if isinstance(att, dict) and att.get("attachment_id") not in existing:
                    merged.setdefault("attachments", []).append(copy.deepcopy(att))
        elif isinstance(val, dict) and key in ("structured", "unstructured", "visual", "rag_hints") and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dict(merged[key], val)
        elif isinstance(val, list) and key == "external_refs":
            merged.setdefault("external_refs", [])
            seen = {(r.get("system"), r.get("id")) for r in merged["external_refs"] if isinstance(r, dict)}
            for ref in val:
                if not isinstance(ref, dict):
                    continue
                tid = (ref.get("system"), ref.get("id"))
                if tid not in seen:
                    merged["external_refs"].append(copy.deepcopy(ref))
                    seen.add(tid)
        elif isinstance(val, dict):
            merged[key] = _deep_merge_dict(merged.get(key) or {}, val)
        else:
            merged[key] = copy.deepcopy(val)
    merged["updated_at"] = _utc_now()
    return merged


def recompute_ingest_status(inc: dict[str, Any]) -> str:
    if inc.get("ingest_status") == "closed":
        return "closed"
    text = canonical_alarm_text(inc)
    if text.strip():
        if len(inc.get("external_refs") or []) > 1 or (inc.get("attachments") or []):
            return "merged"
        return "ready"
    return "draft"


def canonical_alarm_text(inc: dict[str, Any]) -> str:
    u = inc.get("unstructured") or {}
    t = str(u.get("alarm_text") or "").strip()
    if t:
        return t
    t = str(u.get("asr_text") or "").strip()
    if t:
        return t
    vis = inc.get("visual") or {}
    summary = str(vis.get("summary") or "").strip()
    if summary:
        return f"[视频与感知摘要] {summary}"
    atts = inc.get("attachments") or []
    if atts:
        return f"[多源已接入附件 {len(atts)} 项，请结合结构化字段与图像研判]"
    return ""
