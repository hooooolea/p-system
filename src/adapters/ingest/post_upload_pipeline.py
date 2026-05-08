"""上传落盘后的异步编排：ASR → 回写 unstructured.asr_text；可选触发异步研判。"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

from flask import Flask

from adapters.common.logging_audit import audit_event
from adapters.ingest.async_analyze import spawn_analyze_async_thread
from adapters.ingest.service import IngestService


def schedule_media_pipeline(
    app: Flask,
    ingest: IngestService,
    *,
    job_id: str,
    canonical_incident_id: str,
    attachment: dict[str, Any],
    kind: str,
    auto_analyze: bool,
    use_rag: bool,
    request_id: str,
    caller: str | None,
) -> None:
    jobs: dict[str, Any] = app.config.setdefault("_MEDIA_PIPELINE_JOBS", {})
    app_obj = app

    def run() -> None:
        with app_obj.app_context():
            svc = ingest
            jobs[job_id] = {
                "job_id": job_id,
                "status": "running",
                "stage": "started",
                "canonical_incident_id": canonical_incident_id,
                "kind": kind,
            }
            try:
                if kind == "audio":
                    ref = {
                        "ref_type": str(attachment.get("ref_type") or "url"),
                        "ref_value": str(attachment.get("ref_value") or ""),
                    }
                    asr_job_id = svc.asr.create_job(ref, locale="zh-CN")
                    jobs[job_id]["asr_job_id"] = asr_job_id
                    jobs[job_id]["stage"] = "asr_pending"
                    try:
                        timeout_s = float(os.environ.get("ASR_JOB_TIMEOUT_SEC", "600"))
                    except ValueError:
                        timeout_s = 600.0
                    deadline = time.time() + max(30.0, timeout_s)
                    while time.time() < deadline:
                        j = svc.asr.get_job(asr_job_id)
                        if j and j.get("status") == "completed":
                            text = str(j.get("text") or "")
                            svc.patch_incident(
                                canonical_incident_id,
                                {"unstructured": {"asr_text": text}},
                                request_id=request_id,
                                caller=caller,
                            )
                            jobs[job_id]["stage"] = "patched"
                            break
                        if j and j.get("status") == "failed":
                            raise RuntimeError("ASR 任务失败")
                        time.sleep(0.15)
                    else:
                        raise TimeoutError("ASR 等待超时")
                elif kind == "video":
                    jobs[job_id]["stage"] = "visual_ready"
                else:
                    raise ValueError(f"unsupported kind: {kind}")

                jobs[job_id]["status"] = "completed"
                jobs[job_id]["stage"] = "done"
                jobs[job_id]["analyze_job_id"] = None
                if auto_analyze:
                    aj = spawn_analyze_async_thread(
                        app_obj,
                        canonical_incident_id,
                        use_rag=use_rag,
                        request_id=request_id,
                        caller=caller,
                    )
                    jobs[job_id]["analyze_job_id"] = aj
                audit_event(
                    "media_pipeline_done",
                    request_id=request_id,
                    caller=caller,
                    canonical_id=canonical_incident_id,
                    extra={"pipeline_job_id": job_id, "kind": kind},
                )
            except Exception as e:  # noqa: BLE001
                jobs[job_id] = {
                    "job_id": job_id,
                    "status": "failed",
                    "error": str(e),
                    "canonical_incident_id": canonical_incident_id,
                    "kind": kind,
                }
                audit_event(
                    "media_pipeline_failed",
                    request_id=request_id,
                    caller=caller,
                    canonical_id=canonical_incident_id,
                    extra={"pipeline_job_id": job_id, "error": str(e)},
                )

    threading.Thread(target=run, daemon=True).start()
