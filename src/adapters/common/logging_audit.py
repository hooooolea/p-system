from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("plice.adapters.audit")


def audit_event(
    action: str,
    *,
    request_id: str | None = None,
    caller: str | None = None,
    canonical_id: str | None = None,
    alarm_no: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload = {
        "action": action,
        "request_id": request_id,
        "caller": caller,
        "canonical_incident_id": canonical_id,
        "alarm_no": alarm_no,
        **(extra or {}),
    }
    logger.info(json.dumps(payload, ensure_ascii=False))
