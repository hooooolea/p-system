from __future__ import annotations

import uuid
from typing import Any

from adapters.asr.client import AsrClient
from adapters.cad110.mapper import cad110_payload_to_canonical_patch
from adapters.common.canonical import (
    canonical_alarm_text,
    merge_policy_apply,
    new_canonical_shell,
    payload_hash,
    recompute_ingest_status,
)
from adapters.common.errors import ApiError
from adapters.common.logging_audit import audit_event
from adapters.history.client import HistoryClient
from adapters.ingest.repository import IncidentRepository
from adapters.knowledge.client import KnowledgeClient
from adapters.video.mapper import video_alert_to_canonical_patch


class IngestService:
    """接入编排：归一化、合并、触发研判。"""

    def __init__(
        self,
        repository: IncidentRepository,
        *,
        knowledge: KnowledgeClient | None = None,
        history: HistoryClient | None = None,
        asr: AsrClient | None = None,
    ) -> None:
        self._repo = repository
        self._knowledge = knowledge or KnowledgeClient()
        self._history = history or HistoryClient()
        self._asr = asr or AsrClient()

    @property
    def asr(self) -> AsrClient:
        return self._asr

    @property
    def knowledge(self) -> KnowledgeClient:
        return self._knowledge

    @property
    def history(self) -> HistoryClient:
        return self._history

    def ensure_incident_for_media(
        self,
        *,
        canonical_incident_id: str | None = None,
        alarm_no: str | None = None,
        alarm_text: str | None = None,
    ) -> str:
        """上传前保证存在警情：指定 id、或按警情编号查找/新建、或新建空壳。"""
        if canonical_incident_id:
            cid = canonical_incident_id.strip()
            if self._repo.get(cid):
                return cid
            raise ApiError("NOT_FOUND", "canonical_incident_id 不存在", 404)
        an = (alarm_no or "").strip()
        if an:
            ids = self._repo.find_ids_by_alarm_no(an)
            if ids:
                return ids[0]
            inc = new_canonical_shell()
            inc["structured"]["alarm_no"] = an
            inc["unstructured"]["alarm_text"] = (alarm_text or "").strip()
            inc["ingest_status"] = recompute_ingest_status(inc)
            self._repo.save(inc)
            return str(inc["canonical_incident_id"])
        inc = new_canonical_shell()
        inc["unstructured"]["alarm_text"] = (alarm_text or "").strip()
        inc["ingest_status"] = recompute_ingest_status(inc)
        self._repo.save(inc)
        return str(inc["canonical_incident_id"])

    def ingest_cad110(
        self,
        external_id: str,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
        request_id: str | None = None,
        caller: str | None = None,
    ) -> dict[str, Any]:
        if not external_id:
            raise ApiError("VALIDATION_FAILED", "external_id 不能为空", 400)
        if idempotency_key:
            existing = self._repo.idempotency_get(idempotency_key)
            if existing:
                inc = self._repo.get(existing)
                if not inc:
                    raise ApiError("NOT_FOUND", "幂等键指向的警情已丢失", 404)
                return {
                    "canonical_incident_id": existing,
                    "ingest_status": inc.get("ingest_status"),
                    "analyze_status": inc.get("analyze_status"),
                    "idempotent_replay": True,
                }

        patch = cad110_payload_to_canonical_patch(external_id, payload)
        alarm_no = (patch.get("structured") or {}).get("alarm_no", "")
        h = payload_hash({"external_id": external_id, "payload": payload})

        if alarm_no:
            ids = self._repo.find_ids_by_alarm_no(alarm_no)
            if ids:
                cid = ids[0]
                inc = self._repo.get(cid)
                if not inc:
                    raise ApiError("NOT_FOUND", "警情不存在", 404)
                merged = merge_policy_apply(inc, patch)
                merged["audit"]["source_payload_hash"] = h
                merged["ingest_status"] = recompute_ingest_status(merged)
                self._repo.save(merged)
                audit_event("ingest_cad110_merge", request_id=request_id, caller=caller, canonical_id=cid, alarm_no=alarm_no)
                if idempotency_key:
                    self._repo.idempotency_set(idempotency_key, cid)
                return {
                    "canonical_incident_id": cid,
                    "ingest_status": merged["ingest_status"],
                    "analyze_status": merged.get("analyze_status", "none"),
                }

        inc = new_canonical_shell()
        merged = merge_policy_apply(inc, patch)
        merged["audit"]["source_payload_hash"] = h
        merged["ingest_status"] = recompute_ingest_status(merged)
        self._repo.save(merged)
        cid = merged["canonical_incident_id"]
        if idempotency_key:
            self._repo.idempotency_set(idempotency_key, cid)
        audit_event("ingest_cad110", request_id=request_id, caller=caller, canonical_id=cid, alarm_no=alarm_no or None)
        return {
            "canonical_incident_id": cid,
            "ingest_status": merged["ingest_status"],
            "analyze_status": merged.get("analyze_status", "none"),
        }

    def ingest_video_alert(
        self,
        external_id: str,
        payload: dict[str, Any],
        *,
        request_id: str | None = None,
        caller: str | None = None,
    ) -> dict[str, Any]:
        if not external_id:
            raise ApiError("VALIDATION_FAILED", "external_id 不能为空", 400)
        patch = video_alert_to_canonical_patch(external_id, payload)
        related = (payload.get("related_alarm_no") or "").strip()
        if related:
            ids = self._repo.find_ids_by_alarm_no(related)
            if ids:
                cid = ids[0]
                inc = self._repo.get(cid)
                if not inc:
                    raise ApiError("NOT_FOUND", "关联警情不存在", 404)
                merged = merge_policy_apply(inc, patch)
                merged["audit"]["source_payload_hash"] = payload_hash({"external_id": external_id, "payload": payload})
                merged["ingest_status"] = recompute_ingest_status(merged)
                self._repo.save(merged)
                audit_event("ingest_video_merge", request_id=request_id, caller=caller, canonical_id=cid, alarm_no=related)
                return {
                    "canonical_incident_id": cid,
                    "ingest_status": merged["ingest_status"],
                    "analyze_status": merged.get("analyze_status", "none"),
                }

        inc = new_canonical_shell()
        merged = merge_policy_apply(inc, patch)
        merged["audit"]["source_payload_hash"] = payload_hash({"external_id": external_id, "payload": payload})
        merged["ingest_status"] = recompute_ingest_status(merged)
        self._repo.save(merged)
        cid = merged["canonical_incident_id"]
        audit_event("ingest_video_new", request_id=request_id, caller=caller, canonical_id=cid)
        return {
            "canonical_incident_id": cid,
            "ingest_status": merged["ingest_status"],
            "analyze_status": merged.get("analyze_status", "none"),
        }

    def patch_incident(
        self,
        canonical_incident_id: str,
        patch: dict[str, Any],
        merge_policy: str = "replace_non_null",
        *,
        request_id: str | None = None,
        caller: str | None = None,
    ) -> dict[str, Any]:
        inc = self._repo.get(canonical_incident_id)
        if not inc:
            raise ApiError("NOT_FOUND", "警情不存在", 404)
        merged = merge_policy_apply(inc, patch, merge_policy)
        merged["ingest_status"] = recompute_ingest_status(merged)
        self._repo.save(merged)
        audit_event("ingest_patch", request_id=request_id, caller=caller, canonical_id=canonical_incident_id)
        return {
            "canonical_incident_id": canonical_incident_id,
            "ingest_status": merged["ingest_status"],
            "analyze_status": merged.get("analyze_status", "none"),
        }

    def merge_alarm_no(self, alarm_no: str, *, request_id: str | None = None, caller: str | None = None) -> dict[str, Any]:
        ids = self._repo.find_ids_by_alarm_no(alarm_no)
        if len(ids) <= 1:
            if not ids:
                raise ApiError("NOT_FOUND", "该警情编号无接入记录", 404)
            inc = self._repo.get(ids[0])
            if inc:
                inc["ingest_status"] = recompute_ingest_status(inc)
                self._repo.save(inc)
                st = inc["ingest_status"]
            else:
                st = ""
            return {"canonical_incident_id": ids[0], "merged_from": ids, "ingest_status": st}

        primary, rest = ids[0], ids[1:]
        base = self._repo.get(primary)
        if not base:
            raise ApiError("NOT_FOUND", "主记录不存在", 404)
        for oid in rest:
            other = self._repo.get(oid)
            if not other:
                continue
            patch = {
                "external_refs": other.get("external_refs") or [],
                "attachments": other.get("attachments") or [],
                "unstructured": other.get("unstructured") or {},
                "visual": other.get("visual") or {},
            }
            base = merge_policy_apply(base, patch)
            self._repo.delete(oid)
        base["ingest_status"] = recompute_ingest_status(base)
        self._repo.save(base)
        audit_event("ingest_merge_alarm_no", request_id=request_id, caller=caller, canonical_id=primary, alarm_no=alarm_no)
        return {"canonical_incident_id": primary, "merged_from": ids, "ingest_status": base["ingest_status"]}

    def list_incidents(
        self,
        *,
        ingest_status: str | None = None,
        jurisdiction: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(int(limit), 100))
        rows: list[dict[str, Any]] = []
        for cid, inc in self._repo.iter_all():
            if ingest_status and inc.get("ingest_status") != ingest_status:
                continue
            if jurisdiction:
                j = (inc.get("structured") or {}).get("jurisdiction") or ""
                if jurisdiction not in j:
                    continue
            rows.append(
                {
                    "canonical_incident_id": cid,
                    "ingest_status": inc.get("ingest_status"),
                    "analyze_status": inc.get("analyze_status"),
                    "alarm_no": (inc.get("structured") or {}).get("alarm_no"),
                    "updated_at": inc.get("updated_at"),
                }
            )
        rows.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
        return rows[:limit]
