"""内部 API 与上传流水线共用的异步研判线程。"""

from __future__ import annotations

import threading
import uuid
from typing import Any

from flask import Flask

from adapters.common.canonical import canonical_alarm_text
from adapters.common.logging_audit import audit_event


def spawn_analyze_async_thread(
    app: Flask,
    canonical_incident_id: str,
    *,
    use_rag: bool = True,
    request_id: str | None = None,
    caller: str | None = None,
) -> str | None:
    """若当前 Canonical 有可研判文本则入队异步研判，返回 analysis job_id；否则返回 None。"""
    from services.workbench_service import (
        analyze_alarm_with_bukong,
        build_incident_markdown,
        finalize_analysis_persistence,
        merge_incident_and_bukong_markdown,
        record_analysis,
        record_bukong_generated,
        snapshot_bukong_to_session,
    )

    repo = app.config["INCIDENT_REPOSITORY"]
    inc = repo.get(canonical_incident_id)
    if not inc:
        return None
    alarm_text = canonical_alarm_text(inc)
    if not alarm_text.strip():
        return None

    job_id = str(uuid.uuid4())
    jobs: dict[str, Any] = app.config.setdefault("_INTERNAL_ANALYSIS_JOBS", {})
    session = app.config["SESSION_STORE"]
    app_obj = app

    def run() -> None:
        with app_obj.app_context():
            r = app_obj.config["INCIDENT_REPOSITORY"]
            sess = app_obj.config["SESSION_STORE"]
            inc0 = r.get(canonical_incident_id)
            if not inc0:
                jobs[job_id] = {"status": "failed", "error": "警情不存在", "canonical_incident_id": canonical_incident_id}
                return
            atxt = canonical_alarm_text(inc0)
            if not atxt.strip():
                jobs[job_id] = {"status": "failed", "error": "缺少可研判文本", "canonical_incident_id": canonical_incident_id}
                return
            try:
                jobs[job_id] = {"status": "running", "canonical_incident_id": canonical_incident_id}
                pack = analyze_alarm_with_bukong(atxt, use_rag)
                result = pack["result"]
                elapsed = pack["elapsed"]
                record_analysis(
                    sess,
                    alarm_text=atxt,
                    result=result,
                    elapsed=elapsed,
                    use_rag=use_rag,
                )
                if pack.get("bukong_plan") and pack.get("bukong_markdown"):
                    record_bukong_generated(sess)
                snapshot_bukong_to_session(sess, pack)
                md = merge_incident_and_bukong_markdown(
                    build_incident_markdown(result, elapsed),
                    pack.get("bukong_markdown"),
                )
                finalize_analysis_persistence(
                    sess,
                    alarm_text=atxt,
                    use_rag=use_rag,
                    pack=pack,
                    full_markdown=md,
                )
                aid = str(sess.latest_analysis_id or "").strip()
                ob = ((sess.get("analysis_by_id") or {}).get(aid) or {}).get("officer_brief")
                if not ob:
                    from services.officer_brief import build_officer_brief

                    ob = build_officer_brief(atxt, result)
                dn = ((sess.get("analysis_by_id") or {}).get(aid) or {}).get("disposal_nav")
                if not dn or not isinstance(dn, dict) or not dn.get("steps"):
                    from services.disposal_nav import build_disposal_nav

                    dn = build_disposal_nav(result, atxt)
                inc2 = r.get(canonical_incident_id)
                if inc2:
                    inc2["analyze_status"] = "succeeded"
                    inc2["_latest_analysis"] = {
                        "analysis_id": sess.latest_analysis_id,
                        "elapsed": elapsed,
                        "result": result,
                        "markdown": md,
                        "officer_brief": ob,
                        "disposal_nav": dn,
                        "bukong_plan": pack.get("bukong_plan"),
                        "bukong_markdown": pack.get("bukong_markdown"),
                        "bukong_raw": pack.get("bukong_raw"),
                        "bukong_error": pack.get("bukong_error"),
                        "bukong_incident_bg": pack.get("bukong_incident_bg"),
                        "bukong_suspect_desc": pack.get("bukong_suspect_desc"),
                    }
                    r.save(inc2)
                jobs[job_id] = {
                    "status": "completed",
                    "canonical_incident_id": canonical_incident_id,
                    "analysis_id": sess.latest_analysis_id,
                    "elapsed": elapsed,
                }
            except Exception as e:  # noqa: BLE001
                jobs[job_id] = {"status": "failed", "error": str(e), "canonical_incident_id": canonical_incident_id}
                inc2 = r.get(canonical_incident_id)
                if inc2:
                    inc2["analyze_status"] = "failed"
                    r.save(inc2)

    jobs[job_id] = {"status": "queued", "canonical_incident_id": canonical_incident_id}
    threading.Thread(target=run, daemon=True).start()
    audit_event("analyze_async", request_id=request_id, caller=caller, canonical_id=canonical_incident_id)
    return job_id
