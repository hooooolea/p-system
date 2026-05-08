from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from adapters.common.canonical import (
    canonical_alarm_text,
    merge_policy_apply,
    payload_hash,
    recompute_ingest_status,
)
from adapters.common.errors import ApiError, error_payload
from adapters.common.logging_audit import audit_event
from adapters.ingest.async_analyze import spawn_analyze_async_thread
from adapters.ingest.post_upload_pipeline import schedule_media_pipeline
from adapters.ingest.service import IngestService


def _request_id() -> str:
    return request.headers.get("X-Request-Id") or str(uuid.uuid4())


def _caller() -> str | None:
    return request.headers.get("X-Caller-Service")


def _form_truthy(raw: str | None) -> bool:
    if raw is None:
        return False
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _require_internal_auth() -> None:
    token = os.environ.get("INTERNAL_API_TOKEN", "").strip()
    if not token:
        return
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ApiError("UNAUTHORIZED", "缺少 Authorization: Bearer", 401)
    if auth[7:].strip() != token:
        raise ApiError("UNAUTHORIZED", "令牌无效", 401)


def build_internal_blueprint(ingest_service: IngestService) -> Blueprint:
    bp = Blueprint("internal_v1", __name__)

    @bp.before_request
    def _auth():  # type: ignore[no-untyped-def]
        try:
            _require_internal_auth()
        except ApiError as e:
            rid = _request_id()
            return jsonify(error_payload(e.code, e.message, rid, e.details)), e.status
        return None

    @bp.errorhandler(ApiError)
    def _handle_api_error(e: ApiError):  # type: ignore[no-untyped-def]
        rid = _request_id()
        return jsonify(error_payload(e.code, e.message, rid, e.details)), e.status

    def _repo():
        return current_app.config["INCIDENT_REPOSITORY"]

    def _ingest() -> IngestService:
        return ingest_service

    def _session():
        return current_app.config["SESSION_STORE"]

    @bp.get("/health")
    def health():  # type: ignore[no-untyped-def]
        return jsonify({"ok": True, "service": "plice-internal"})

    @bp.get("/health/ready")
    def health_ready():  # type: ignore[no-untyped-def]
        return jsonify({"ready": True, "incidents": _repo().count()})

    @bp.get("/health/upstream")
    def health_upstream():  # type: ignore[no-untyped-def]
        return jsonify(
            {
                "cad110": "not_configured",
                "video": "not_configured",
                "knowledge": "builtin",
                "history": "seed",
                "asr": os.environ.get("ASR_BACKEND", "modelscope").strip().lower() or "modelscope",
                "media_upload": "local_disk",
                "media_pipeline": "memory_thread",
            }
        )

    @bp.post("/ingest/cad110")
    def ingest_cad110():  # type: ignore[no-untyped-def]
        rid = _request_id()
        body = request.get_json(silent=True) or {}
        ext = str(body.get("external_id") or "").strip()
        payload = body.get("payload") or {}
        idem = request.headers.get("Idempotency-Key")
        try:
            out = _ingest().ingest_cad110(ext, payload, idempotency_key=idem, request_id=rid, caller=_caller())
            return jsonify(out)
        except ApiError:
            raise

    @bp.post("/ingest/video-alert")
    def ingest_video():  # type: ignore[no-untyped-def]
        rid = _request_id()
        body = request.get_json(silent=True) or {}
        ext = str(body.get("external_id") or "").strip()
        payload = body.get("payload") or {}
        out = _ingest().ingest_video_alert(ext, payload, request_id=rid, caller=_caller())
        return jsonify(out)

    @bp.post("/ingest/patch")
    def ingest_patch():  # type: ignore[no-untyped-def]
        rid = _request_id()
        body = request.get_json(silent=True) or {}
        cid = str(body.get("canonical_incident_id") or "").strip()
        patch = body.get("patch") or {}
        policy = str(body.get("merge_policy") or "replace_non_null")
        out = _ingest().patch_incident(cid, patch, policy, request_id=rid, caller=_caller())
        return jsonify(out)

    @bp.post("/ingest/merge")
    def ingest_merge():  # type: ignore[no-untyped-def]
        rid = _request_id()
        body = request.get_json(silent=True) or {}
        alarm_no = str(body.get("alarm_no") or "").strip()
        out = _ingest().merge_alarm_no(alarm_no, request_id=rid, caller=_caller())
        return jsonify(out)

    @bp.get("/incidents")
    def incidents_list():  # type: ignore[no-untyped-def]
        ingest_status = request.args.get("status") or request.args.get("ingest_status")
        jurisdiction = request.args.get("jurisdiction") or ""
        limit = int(request.args.get("limit") or 20)
        items = _ingest().list_incidents(ingest_status=ingest_status or None, jurisdiction=jurisdiction or None, limit=limit)
        return jsonify({"items": items, "next_cursor": None})

    @bp.get("/incidents/<canonical_incident_id>")
    def incident_get(canonical_incident_id: str):  # type: ignore[no-untyped-def]
        inc = _repo().get(canonical_incident_id)
        if not inc:
            raise ApiError("NOT_FOUND", "警情不存在", 404)
        return jsonify(inc)

    @bp.get("/incidents/by-alarm-no/<path:alarm_no>")
    def incident_by_alarm(alarm_no: str):  # type: ignore[no-untyped-def]
        ids = _repo().find_ids_by_alarm_no(alarm_no)
        if not ids:
            raise ApiError("NOT_FOUND", "警情编号不存在", 404)
        inc = _repo().get(ids[0])
        return jsonify(inc)

    @bp.get("/knowledge/search")
    def knowledge_search():  # type: ignore[no-untyped-def]
        q = request.args.get("q") or ""
        jurisdiction = request.args.get("jurisdiction") or ""
        doc_types = request.args.get("doc_types") or ""
        top_k = int(request.args.get("top_k") or 5)
        data = _ingest().knowledge.search(q, jurisdiction=jurisdiction, doc_types=doc_types, top_k=top_k)
        return jsonify(data)

    @bp.get("/knowledge/docs/<doc_id>")
    def knowledge_doc(doc_id: str):  # type: ignore[no-untyped-def]
        meta = _ingest().knowledge.doc_meta(doc_id)
        if not meta:
            raise ApiError("NOT_FOUND", "文档不存在", 404)
        return jsonify(meta)

    @bp.get("/history/incidents/<path:alarm_no>")
    def history_get(alarm_no: str):  # type: ignore[no-untyped-def]
        row = _ingest().history.get_by_alarm_no(alarm_no)
        if not row:
            raise ApiError("NOT_FOUND", "历史库无此编号", 404)
        return jsonify(row)

    @bp.post("/history/similar")
    def history_similar():  # type: ignore[no-untyped-def]
        body = request.get_json(silent=True) or {}
        cid = str(body.get("canonical_incident_id") or "").strip()
        limit = int(body.get("limit") or 5)
        filters = body.get("filters") or {}
        alarm_text = ""
        if cid:
            inc = _repo().get(cid)
            if inc:
                alarm_text = canonical_alarm_text(inc)
        rows = _ingest().history.similar(
            alarm_text=alarm_text,
            jurisdiction=str(filters.get("jurisdiction") or ""),
            limit=limit,
        )
        return jsonify({"items": rows})

    @bp.post("/asr/jobs")
    def asr_jobs():  # type: ignore[no-untyped-def]
        body = request.get_json(silent=True) or {}
        ref = body.get("recording_ref") or {}
        locale = str(body.get("locale") or "zh-CN")
        job_id = _ingest().asr.create_job(ref, locale=locale)
        return jsonify({"job_id": job_id, "status": "pending"}), 201

    @bp.get("/asr/jobs/<job_id>")
    def asr_job_get(job_id: str):  # type: ignore[no-untyped-def]
        j = _ingest().asr.get_job(job_id)
        if not j:
            raise ApiError("NOT_FOUND", "任务不存在", 404)
        out = {"job_id": job_id, "status": j.get("status"), "text": j.get("text", "")}
        if j.get("error"):
            out["error"] = j.get("error")
        return jsonify(out)

    @bp.post("/asr/jobs/<job_id>/attach")
    def asr_attach(job_id: str):  # type: ignore[no-untyped-def]
        body = request.get_json(silent=True) or {}
        cid = str(body.get("canonical_incident_id") or "").strip()
        j = _ingest().asr.get_job(job_id)
        if not j:
            raise ApiError("NOT_FOUND", "任务不存在", 404)
        if j.get("status") != "completed":
            raise ApiError("VALIDATION_FAILED", "转写未完成", 400)
        text = str(j.get("text") or "")
        patch = {"unstructured": {"asr_text": text}}
        out = _ingest().patch_incident(cid, patch, request_id=_request_id(), caller=_caller())
        return jsonify(out)

    @bp.post("/incidents/<canonical_incident_id>/analyze")
    def incident_analyze(canonical_incident_id: str):  # type: ignore[no-untyped-def]
        from services.workbench_service import (
            analyze_alarm_with_bukong,
            build_incident_markdown,
            finalize_analysis_persistence,
            merge_incident_and_bukong_markdown,
            record_analysis,
            record_bukong_generated,
            snapshot_bukong_to_session,
        )

        rid = _request_id()
        body = request.get_json(silent=True) or {}
        use_rag = bool(body.get("use_rag", True))
        mode = str(body.get("mode") or "sync")
        inc = _repo().get(canonical_incident_id)
        if not inc:
            raise ApiError("NOT_FOUND", "警情不存在", 404)
        alarm_text = canonical_alarm_text(inc)
        if not alarm_text.strip():
            raise ApiError("INGEST_INCOMPLETE", "缺少可研判文本", 422)

        session = _session()

        if mode == "async":
            job_id = spawn_analyze_async_thread(
                current_app._get_current_object(),
                canonical_incident_id,
                use_rag=use_rag,
                request_id=rid,
                caller=_caller(),
            )
            if not job_id:
                raise ApiError("INGEST_INCOMPLETE", "缺少可研判文本", 422)
            return jsonify({"job_id": job_id, "mode": "async"}), 202

        inc["analyze_status"] = "running"
        _repo().save(inc)
        try:
            pack = analyze_alarm_with_bukong(alarm_text, use_rag)
            result = pack["result"]
            elapsed = pack["elapsed"]
            record_analysis(
                session,
                alarm_text=alarm_text,
                result=result,
                elapsed=elapsed,
                use_rag=use_rag,
            )
            if pack.get("bukong_plan") and pack.get("bukong_markdown"):
                record_bukong_generated(session)
            snapshot_bukong_to_session(session, pack)
            md = merge_incident_and_bukong_markdown(
                build_incident_markdown(result, elapsed),
                pack.get("bukong_markdown"),
            )
            finalize_analysis_persistence(
                session,
                alarm_text=alarm_text,
                use_rag=use_rag,
                pack=pack,
                full_markdown=md,
            )
            aid = str(session.latest_analysis_id or "").strip()
            ob = ((session.get("analysis_by_id") or {}).get(aid) or {}).get("officer_brief")
            if not ob:
                from services.officer_brief import build_officer_brief

                ob = build_officer_brief(alarm_text, result)
            dn = ((session.get("analysis_by_id") or {}).get(aid) or {}).get("disposal_nav")
            if not dn or not isinstance(dn, dict) or not dn.get("steps"):
                from services.disposal_nav import build_disposal_nav

                dn = build_disposal_nav(result, alarm_text)
            inc = _repo().get(canonical_incident_id) or inc
            inc["analyze_status"] = "succeeded"
            inc["_latest_analysis"] = {
                "analysis_id": session.latest_analysis_id,
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
            _repo().save(inc)
        except Exception:
            inc = _repo().get(canonical_incident_id) or inc
            inc["analyze_status"] = "failed"
            _repo().save(inc)
            raise
        audit_event("analyze_sync", request_id=rid, caller=_caller(), canonical_id=canonical_incident_id)
        return jsonify(
            {
                "canonical_incident_id": canonical_incident_id,
                "analysis_id": session.latest_analysis_id,
                "elapsed": elapsed,
                "result": result,
                "markdown": md,
                "officer_brief": ob,
                "disposal_nav": dn,
            }
        )

    @bp.get("/incidents/<canonical_incident_id>/analyze/latest")
    def analyze_latest(canonical_incident_id: str):  # type: ignore[no-untyped-def]
        inc = _repo().get(canonical_incident_id)
        if not inc:
            raise ApiError("NOT_FOUND", "警情不存在", 404)
        la = inc.get("_latest_analysis")
        if not la:
            return jsonify({"canonical_incident_id": canonical_incident_id, "analysis": None})
        la = dict(la)
        dn0 = la.get("disposal_nav")
        if not isinstance(dn0, dict) or not dn0.get("steps"):
            from services.disposal_nav import build_disposal_nav

            la["disposal_nav"] = build_disposal_nav(
                la.get("result") or {},
                canonical_alarm_text(inc),
            )
        return jsonify({"canonical_incident_id": canonical_incident_id, "analysis": la})

    @bp.get("/jobs/<job_id>")
    def job_status(job_id: str):  # type: ignore[no-untyped-def]
        jobs: dict[str, Any] = current_app.config.get("_INTERNAL_ANALYSIS_JOBS") or {}
        j = jobs.get(job_id)
        if not j:
            raise ApiError("NOT_FOUND", "任务不存在", 404)
        return jsonify({"job_id": job_id, **j})

    @bp.get("/media-jobs/<job_id>")
    def media_job_status(job_id: str):  # type: ignore[no-untyped-def]
        jobs: dict[str, Any] = current_app.config.get("_MEDIA_PIPELINE_JOBS") or {}
        j = jobs.get(job_id)
        if not j:
            raise ApiError("NOT_FOUND", "媒体处理任务不存在", 404)
        return jsonify(j)

    @bp.post("/uploads")
    def upload_media():  # type: ignore[no-untyped-def]
        """multipart/form-data：file + kind(audio|video)，可选 canonical_incident_id / alarm_no / alarm_text / caption。"""
        from adapters.ingest.media_upload import build_attachment, save_upload_bytes, validate_upload

        rid = _request_id()
        kind = (request.form.get("kind") or "").strip().lower()
        canonical_in = (request.form.get("canonical_incident_id") or "").strip() or None
        alarm_no = (request.form.get("alarm_no") or "").strip() or None
        alarm_text = (request.form.get("alarm_text") or "").strip() or None
        caption = (request.form.get("caption") or "").strip()
        auto_process = _form_truthy(request.form.get("auto_process"))
        auto_analyze = _form_truthy(request.form.get("auto_analyze"))
        _ur = request.form.get("use_rag")
        use_rag_upload = True if _ur is None else str(_ur).strip().lower() not in ("0", "false", "no", "off")

        folder = current_app.config.get("UPLOAD_FOLDER")
        if not folder:
            raise ApiError("SERVICE_UNAVAILABLE", "未配置 UPLOAD_FOLDER", 503)

        file = request.files.get("file")
        suffix, data = validate_upload(kind, file)
        orig_name = (getattr(file, "filename", None) or "upload").split("/")[-1].split("\\")[-1]
        fname = save_upload_bytes(Path(folder), suffix, data)
        att = build_attachment(fname=fname, kind=kind, original_name=orig_name, size=len(data))

        patch: dict[str, Any] = {"attachments": [att]}
        if kind == "video":
            patch["visual"] = {
                "summary": caption or f"已上传视频：{orig_name}",
                "source": "upload",
            }

        cid = _ingest().ensure_incident_for_media(
            canonical_incident_id=canonical_in,
            alarm_no=alarm_no,
            alarm_text=alarm_text,
        )
        inc = _repo().get(cid)
        if not inc:
            raise ApiError("NOT_FOUND", "警情不存在", 404)
        merged = merge_policy_apply(inc, patch)
        merged["audit"]["source_payload_hash"] = payload_hash({"upload": fname, "kind": kind})
        merged["ingest_status"] = recompute_ingest_status(merged)
        _repo().save(merged)
        audit_event(
            "media_upload",
            request_id=rid,
            caller=_caller(),
            canonical_id=cid,
            extra={"kind": kind, "file": fname},
        )
        out: dict[str, Any] = {
            "canonical_incident_id": cid,
            "attachment": att,
            "public_url": att["ref_value"],
            "ingest_status": merged["ingest_status"],
        }
        if auto_process:
            pipeline_job_id = str(uuid.uuid4())
            pj: dict[str, Any] = current_app.config.setdefault("_MEDIA_PIPELINE_JOBS", {})
            pj[pipeline_job_id] = {
                "job_id": pipeline_job_id,
                "status": "queued",
                "canonical_incident_id": cid,
                "kind": kind,
            }
            schedule_media_pipeline(
                current_app._get_current_object(),
                _ingest(),
                job_id=pipeline_job_id,
                canonical_incident_id=cid,
                attachment=att,
                kind=kind,
                auto_analyze=auto_analyze,
                use_rag=use_rag_upload,
                request_id=rid,
                caller=_caller(),
            )
            out["media_pipeline_job_id"] = pipeline_job_id
            out["media_pipeline_status"] = "queued"
        return jsonify(out)

    return bp
