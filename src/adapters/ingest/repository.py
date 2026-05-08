from __future__ import annotations

import copy
from typing import Any, Iterator


class IncidentRepository:
    """CanonicalIncident 内存存储（可替换为 DB）。"""

    def __init__(self) -> None:
        self._by_id: dict[str, dict[str, Any]] = {}
        self._idempotency: dict[str, str] = {}

    def get(self, canonical_incident_id: str) -> dict[str, Any] | None:
        inc = self._by_id.get(canonical_incident_id)
        return copy.deepcopy(inc) if inc else None

    def save(self, incident: dict[str, Any]) -> None:
        cid = incident["canonical_incident_id"]
        self._by_id[cid] = copy.deepcopy(incident)

    def delete(self, canonical_incident_id: str) -> None:
        self._by_id.pop(canonical_incident_id, None)

    def idempotency_get(self, key: str) -> str | None:
        return self._idempotency.get(key)

    def idempotency_set(self, key: str, canonical_incident_id: str) -> None:
        self._idempotency[key] = canonical_incident_id

    def find_ids_by_alarm_no(self, alarm_no: str) -> list[str]:
        if not alarm_no:
            return []
        out: list[str] = []
        for cid, inc in self._by_id.items():
            if (inc.get("structured") or {}).get("alarm_no") == alarm_no:
                out.append(cid)
        return out

    def iter_all(self) -> Iterator[tuple[str, dict[str, Any]]]:
        for cid, inc in self._by_id.items():
            yield cid, copy.deepcopy(inc)

    def count(self) -> int:
        return len(self._by_id)
