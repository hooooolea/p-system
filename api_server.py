"""
HTML 工作台对应的后端服务入口（`web/` + Flask）。
运行方式：
python api_server.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
import math
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass
from typing import Any

from flask import Flask, Response, abort, jsonify, redirect, request, send_from_directory, stream_with_context

_HISTORY_LIMIT_MAX = 200
_MAP_APP_DIST = (Path(__file__).resolve().parent / "map-app" / "dist").resolve()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
sys.path.insert(0, os.path.dirname(__file__))

from adapters.http.blueprint import build_internal_blueprint  # noqa: E402
from adapters.ingest.repository import IncidentRepository  # noqa: E402
from adapters.ingest.service import IngestService  # noqa: E402
from services.case_management import (  # noqa: E402
    apply_manual_case_update,
    build_cases_payload,
    sync_case_from_presentation_feedback,
    sync_case_from_review,
)
from services.capability_evidence import build_capability_evidence  # noqa: E402
from services.alert_evaluation import build_alert_evaluation_metrics  # noqa: E402
from services.nonface_retrieval import search_nonface_candidates  # noqa: E402
from services.workbench_service import (  # noqa: E402
    analyze_alarm_with_bukong,
    build_bukong_markdown,
    build_elapsed_trend,
    resolve_geo_for_map,
    build_incident_markdown,
    merge_incident_and_bukong_markdown,
    build_performance_overview,
    build_review_distribution,
    build_review_record,
    ensure_session_state,
    build_analysis_presentation,
    finalize_analysis_persistence,
    generate_bukong_plan,
    remember_analysis_snapshot,
    record_bukong_generated,
    record_analysis,
    restore_session_from_snapshot,
    save_review_record,
    snapshot_bukong_to_session,
)


class SessionStore(dict):
    """兼容 dict 与属性访问，便于复用 service 层。"""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value


app = Flask(__name__, static_folder="web", static_url_path="/web")
session_store = SessionStore()
ensure_session_state(session_store)


def _ensure_video_state() -> dict[str, Any]:
    st = session_store.setdefault("_video_state", {})
    st.setdefault("streams", {})
    st.setdefault("alerts", [])
    st.setdefault("target_index", {})
    st.setdefault("next_target_id", 1)
    st.setdefault("last_event_seq", 0)
    return st


def _norm_traits(raw: Any) -> str:
    s = str(raw or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s[:300]


def _now_ts() -> float:
    return float(time.time())


def _traits_vector(text: str) -> dict[str, float]:
    tokens = re.findall(r"[a-z0-9\u4e00-\u9fff]+", str(text or "").lower())
    vec: dict[str, float] = {}
    for t in tokens:
        if len(t) <= 1:
            continue
        vec[t] = vec.get(t, 0.0) + 1.0
    return vec


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    dot = 0.0
    for k, v in a.items():
        dot += v * b.get(k, 0.0)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _assign_target_id(video_state: dict[str, Any], traits: str, event_ts: float) -> str:
    idx = video_state.setdefault("target_index", {})
    if not traits:
        tid = f"T{int(video_state.setdefault('next_target_id', 1)):04d}"
        video_state["next_target_id"] = int(video_state["next_target_id"]) + 1
        return tid

    # 先尝试精确命中
    rec = idx.get(traits)
    if rec and (event_ts - float(rec.get("last_seen_ts", 0.0))) <= 1800:
        rec["last_seen_ts"] = event_ts
        return str(rec.get("target_id"))

    # 再做相似度归并（简化版跨镜关联）
    vq = _traits_vector(traits)
    best_key = ""
    best_score = 0.0
    for k, r in idx.items():
        if (event_ts - float(r.get("last_seen_ts", 0.0))) > 1800:
            continue
        sc = _cosine(vq, _traits_vector(k))
        if sc > best_score:
            best_score = sc
            best_key = k
    if best_key and best_score >= 0.62:
        r = idx[best_key]
        r["last_seen_ts"] = event_ts
        # 将新描述也记入索引，减少后续漂移
        idx[traits] = {"target_id": r.get("target_id"), "last_seen_ts": event_ts}
        return str(r.get("target_id"))

    tid = f"T{int(video_state.setdefault('next_target_id', 1)):04d}"
    video_state["next_target_id"] = int(video_state["next_target_id"]) + 1
    idx[traits] = {"target_id": tid, "last_seen_ts": event_ts}
    return tid


def _bump_video_event_seq(video_state: dict[str, Any]) -> int:
    seq = int(video_state.get("last_event_seq", 0)) + 1
    video_state["last_event_seq"] = seq
    return seq

_PLICE_CORS_ALLOW_ORIGIN = os.environ.get("PLICE_CORS_ALLOW_ORIGIN", "").strip()


@app.before_request
def _plice_cors_preflight():
    """静态前端跨域调 /api/* 时，浏览器会先发 OPTIONS；需与 PLICE_CORS_ALLOW_ORIGIN 配合。"""
    if request.method != "OPTIONS" or not _PLICE_CORS_ALLOW_ORIGIN:
        return None
    if not (request.path.startswith("/api/") or request.path.startswith("/internal/")):
        return None
    r = Response("", 204)
    r.headers["Access-Control-Allow-Origin"] = _PLICE_CORS_ALLOW_ORIGIN
    r.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    r.headers["Access-Control-Allow-Headers"] = (
        "Authorization, Content-Type, X-Caller-Service, X-Request-Id"
    )
    r.headers["Access-Control-Max-Age"] = "86400"
    return r


@app.after_request
def _plice_cors_on_api(response):
    if not _PLICE_CORS_ALLOW_ORIGIN:
        return response
    if request.path.startswith("/api/") or request.path.startswith("/internal/"):
        response.headers["Access-Control-Allow-Origin"] = _PLICE_CORS_ALLOW_ORIGIN
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Caller-Service, X-Request-Id"
        )
        response.headers["Vary"] = "Origin"
    return response


_BASE_DIR = Path(__file__).resolve().parent
_UPLOAD_DIR = _BASE_DIR / "data" / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.config["UPLOAD_FOLDER"] = str(_UPLOAD_DIR)
app.config["MAX_CONTENT_LENGTH"] = 95 * 1024 * 1024

_incident_repository = IncidentRepository()
_ingest_service = IngestService(_incident_repository)
app.config["INCIDENT_REPOSITORY"] = _incident_repository
app.config["SESSION_STORE"] = session_store
app.register_blueprint(build_internal_blueprint(_ingest_service), url_prefix="/internal/v1")

_UPLOAD_FNAME_RE = re.compile(
    r"^[a-f0-9]{32}\.(?:mp3|wav|m4a|aac|webm|ogg|flac|mp4|mov|mkv|avi|m4v)$",
    re.I,
)


@app.get("/uploads/<fname>")
def uploads_file(fname: str):
    """仅提供本服务写入的 uuid 文件名，防止路径穿越。"""
    if not _UPLOAD_FNAME_RE.match(fname) or "/" in fname or "\\" in fname:
        abort(404)
    return send_from_directory(app.config["UPLOAD_FOLDER"], fname)


@app.get("/")
def index():
    return send_from_directory("web", "index.html")


@app.get("/styles.css")
def root_styles():
    """与 index.html 中相对路径 href=styles.css 对齐（避免仅打开 / 时资源 404）。"""
    return send_from_directory("web", "styles.css", mimetype="text/css; charset=utf-8")


@app.get("/styles/<path:filename>")
def styles_sub_files(filename):
    """Serve files from web/styles/ sub-directory (CSS modules)."""
    return send_from_directory("web/styles", filename, mimetype="text/css; charset=utf-8")


@app.get("/app.js")
def root_app_js():
    return send_from_directory("web", "app.js", mimetype="application/javascript; charset=utf-8")


@app.get("/perf-render.js")
def perf_render_js():
    return send_from_directory("web", "perf-render.js", mimetype="application/javascript; charset=utf-8")


@app.get("/plice-env.js")
def root_plice_env_js():
    return send_from_directory("web", "plice-env.js", mimetype="application/javascript; charset=utf-8")


@app.get("/api.js")
def root_api_js():
    return send_from_directory("web", "api.js", mimetype="application/javascript; charset=utf-8")


@app.get("/utils.js")
def root_utils_js():
    return send_from_directory("web", "utils.js", mimetype="application/javascript; charset=utf-8")


@app.get("/sidebar.js")
def root_sidebar_js():
    return send_from_directory("web", "sidebar.js", mimetype="application/javascript; charset=utf-8")


@app.get("/officer-brief-map.js")
def root_officer_brief_map_js():
    return send_from_directory("web", "officer-brief-map.js", mimetype="application/javascript; charset=utf-8")


@app.get("/command-situation")
def command_situation_page():
    return send_from_directory("web", "command-situation.html")


@app.get("/command-map")
def command_map_page():
    if _MAP_APP_DIST.is_dir():
        return send_from_directory(str(_MAP_APP_DIST), "index.html")
    return send_from_directory("web", "command-map.html")


@app.get("/command-map.js")
def command_map_js():
    return send_from_directory("web", "command-map.js", mimetype="application/javascript; charset=utf-8")


@app.get("/command-map/<path:asset_path>")
def command_map_asset(asset_path: str):
    """map-app 打包静态资源入口（/command-map/assets/...）。"""
    if not _MAP_APP_DIST.is_dir():
        return abort(404)
    asset = (_MAP_APP_DIST / asset_path).resolve()
    try:
        asset.relative_to(_MAP_APP_DIST)
    except ValueError:
        return abort(404)
    if not asset.is_file():
        return abort(404)
    return send_from_directory(str(_MAP_APP_DIST), asset_path)


@app.get("/docs-theme.js")
def root_docs_theme_js():
    return send_from_directory("web", "docs-theme.js", mimetype="application/javascript; charset=utf-8")


@app.get("/command-situation.js")
def command_situation_js():
    return send_from_directory("web", "command-situation.js", mimetype="application/javascript; charset=utf-8")


@app.get("/tech-route.js")
def tech_route_js():
    return send_from_directory("web", "tech-route.js", mimetype="application/javascript; charset=utf-8")


@app.get("/judgments")
def judgments_page():
    return send_from_directory("web", "judgments.html")


@app.get("/judgments.js")
def judgments_js():
    return send_from_directory("web", "judgments.js", mimetype="application/javascript; charset=utf-8")


@app.get("/ar-presentation-render.js")
def ar_presentation_render_js():
    return send_from_directory(
        "web",
        "ar-presentation-render.js",
        mimetype="application/javascript; charset=utf-8",
    )


@app.get("/tech-route")
def tech_route_page():
    return send_from_directory("web", "tech-route.html")


# --- 与 Cloudflare 静态托管一致：带 .html 的直链（侧栏与外链统一用此形式）---
@app.get("/index.html")
def index_html_file():
    return send_from_directory("web", "index.html")


@app.get("/command-situation.html")
def command_situation_html_file():
    return send_from_directory("web", "command-situation.html")


@app.get("/command-map.html")
def command_map_html_file():
    if _MAP_APP_DIST.is_dir():
        return send_from_directory(str(_MAP_APP_DIST), "index.html")
    return send_from_directory("web", "command-map.html")


@app.get("/judgments.html")
def judgments_html_file():
    return send_from_directory("web", "judgments.html")


@app.get("/tech-route.html")
def tech_route_html_file():
    return send_from_directory("web", "tech-route.html")


@app.get("/docs-md/<path:relative>")
def serve_docs_md(relative: str):
    """只读下发仓库内 `docs-md/` 下的文件，供页脚「仓库说明」外链在浏览器中打开。"""
    if not relative or ".." in Path(relative).parts or relative.startswith(("/", "\\")):
        abort(404)
    root = (_BASE_DIR / "docs-md").resolve()
    target = (root / relative).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        abort(404)
    if not target.is_file():
        abort(404)
    suffix = target.suffix.lower()
    mime = "text/plain; charset=utf-8"
    if suffix == ".md":
        mime = "text/markdown; charset=utf-8"
    elif suffix == ".json":
        mime = "application/json; charset=utf-8"
    return send_from_directory(str(target.parent), target.name, mimetype=mime)


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/session-snapshot")
def session_snapshot():
    """供工作台等读取当前会话最新研判与布控快照（与主页同源 session_store）。"""
    aid = str(session_store.get("latest_analysis_id") or "").strip()
    officer_brief = ((session_store.get("analysis_by_id") or {}).get(aid) or {}).get("officer_brief") or {}
    if not officer_brief and session_store.get("latest_result") and session_store.get("latest_alarm_text"):
        from services.officer_brief import build_officer_brief

        officer_brief = build_officer_brief(
            str(session_store.get("latest_alarm_text") or ""),
            session_store.get("latest_result") or {},
        )
    disposal_nav = ((session_store.get("analysis_by_id") or {}).get(aid) or {}).get("disposal_nav")
    if (
        not disposal_nav
        or not isinstance(disposal_nav, dict)
        or not disposal_nav.get("steps")
    ) and session_store.get("latest_result"):
        from services.disposal_nav import build_disposal_nav

        disposal_nav = build_disposal_nav(
            session_store.get("latest_result") or {},
            str(session_store.get("latest_alarm_text") or ""),
        )
    return jsonify(
        {
            "latest_result": session_store.get("latest_result"),
            "latest_analysis_id": session_store.get("latest_analysis_id", ""),
            "latest_alarm_text": session_store.get("latest_alarm_text", ""),
            "officer_brief": officer_brief,
            "disposal_nav": disposal_nav or None,
            "bukong": {
                "markdown": session_store.get("latest_bukong_markdown", ""),
                "plan": session_store.get("latest_bukong_plan"),
                "inputs": session_store.get("latest_bukong_inputs") or {},
                "error": session_store.get("latest_bukong_error"),
            },
        }
    )


@app.get("/api/analyze")
def analyze_get_hint():
    """避免误用 GET（如地址栏打开）时仅得到无说明的 405；研判须 POST JSON。"""
    return (
        jsonify(
            error="此接口仅支持 POST",
            hint="请求体 JSON：{ alarm_text: string, use_rag?: boolean }",
        ),
        405,
    )


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    alarm_text = str(payload.get("alarm_text", "")).strip()
    use_rag = bool(payload.get("use_rag", True))
    if not alarm_text:
        return jsonify({"error": "alarm_text 不能为空"}), 400

    pack = analyze_alarm_with_bukong(alarm_text, use_rag)
    result = pack["result"]
    elapsed = pack["elapsed"]
    record_analysis(
        session_store,
        alarm_text=alarm_text,
        result=result,
        elapsed=elapsed,
        use_rag=use_rag,
    )
    if pack.get("bukong_plan") and pack.get("bukong_markdown"):
        record_bukong_generated(session_store)
    snapshot_bukong_to_session(session_store, pack)
    incident_md = build_incident_markdown(result, elapsed)
    full_md = merge_incident_and_bukong_markdown(incident_md, pack.get("bukong_markdown"))
    finalize_analysis_persistence(
        session_store,
        alarm_text=alarm_text,
        use_rag=use_rag,
        pack=pack,
        full_markdown=full_md,
    )
    aid = str(session_store.get("latest_analysis_id") or "").strip()
    officer_brief = ((session_store.get("analysis_by_id") or {}).get(aid) or {}).get("officer_brief") or {}
    if not officer_brief:
        from services.officer_brief import build_officer_brief

        officer_brief = build_officer_brief(alarm_text, result)
    disposal_nav = ((session_store.get("analysis_by_id") or {}).get(aid) or {}).get("disposal_nav")
    if not disposal_nav or not isinstance(disposal_nav, dict) or not disposal_nav.get("steps"):
        from services.disposal_nav import build_disposal_nav

        disposal_nav = build_disposal_nav(result, alarm_text)
    return jsonify(
        {
            "result": result,
            "elapsed": elapsed,
            "analysis_id": session_store.latest_analysis_id,
            "markdown": full_md,
            "history": _history_payload(),
            "officer_brief": officer_brief,
            "disposal_nav": disposal_nav,
            "bukong": {
                "plan": pack.get("bukong_plan"),
                "markdown": pack.get("bukong_markdown") or "",
                "raw": pack.get("bukong_raw"),
                "error": pack.get("bukong_error"),
                "inputs": {
                    "incident_bg": pack.get("bukong_incident_bg", ""),
                    "suspect_desc": pack.get("bukong_suspect_desc", ""),
                },
            },
        }
    )


def _history_payload(limit: int | None = None) -> list[Any]:
    """limit 为 None 时：Supabase 最多 50 条，内存最多 20 条（与原先一致）。"""
    sup_n = min(max(limit or 50, 1), _HISTORY_LIMIT_MAX)
    mem_n = min(max(limit or 20, 1), _HISTORY_LIMIT_MAX)
    try:
        from adapters.persistence.supabase_analysis import list_history_if_configured

        ext = list_history_if_configured(sup_n)
        if ext is not None:
            return ext
    except Exception:
        pass
    return list(session_store.analysis_history[-mem_n:])


@app.get("/api/history")
def history():
    raw = request.args.get("limit", type=int)
    lim = raw if raw is not None and 1 <= raw <= _HISTORY_LIMIT_MAX else None
    return jsonify({"history": _history_payload(limit=lim)})


@app.get("/api/cases")
def cases_list():
    """案件管理：由研判历史聚合，含 KPI 与闭环状态（与专页反馈/复核联动）。"""
    raw = request.args.get("limit", type=int)
    lim = raw if raw is not None and 1 <= raw <= _HISTORY_LIMIT_MAX else 120
    items = _history_payload(limit=lim)
    cases, kpis = build_cases_payload(session_store, items)
    return jsonify({"kpis": kpis, "cases": cases})


@app.patch("/api/cases/<analysis_id>")
def cases_patch(analysis_id: str):
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", "")).strip()
    progress = payload.get("progress")
    note = str(payload.get("note", "")).strip()
    try:
        case = apply_manual_case_update(
            session_store,
            analysis_id,
            status=status,
            progress=progress if progress is not None else None,
            note=note,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify({"ok": True, "case": case})


@app.get("/api/map-events")
def map_events():
    """地图专页：按时间段返回案件点位（优先 LLM geo，其次规则推断，最后展示兜底）。"""
    raw = request.args.get("limit", type=int)
    lim = raw if raw is not None and 1 <= raw <= _HISTORY_LIMIT_MAX else 120
    start = (request.args.get("start") or "").strip()
    end = (request.args.get("end") or "").strip()
    history_items = _history_payload(limit=lim)
    store = session_store.setdefault("analysis_by_id", {})
    events: list[dict[str, Any]] = []
    skipped_without_coord = 0
    for item in history_items:
        t = str(item.get("time") or "")
        if start and t and t < start:
            continue
        if end and t and t > end:
            continue
        aid = str(item.get("id") or "").strip()
        snap = store.get(aid) if aid else None
        if not snap and aid:
            try:
                from adapters.persistence.supabase_analysis import fetch_snapshot_from_supabase

                snap = fetch_snapshot_from_supabase(aid)
            except Exception:
                snap = None
        alarm = str((snap or {}).get("alarm_text") or item.get("original_text") or "")
        result = (snap or {}).get("result") if isinstance((snap or {}).get("result"), dict) else {}
        geo = resolve_geo_for_map(alarm, result)
        lon = geo.get("lon")
        lat = geo.get("lat")
        source = str(geo.get("source") or "unknown")
        try:
            confidence = float(geo.get("confidence") or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        location_text = str(geo.get("location_text") or "").strip()
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            skipped_without_coord += 1
            continue
        events.append(
            {
                "analysis_id": aid,
                "time": t,
                "incident_type": item.get("incident_type") or "未知",
                "risk_level": item.get("risk_level") or "未知",
                "summary": item.get("summary") or "",
                "lon": float(lon),
                "lat": float(lat),
                "geo_source": source,
                "geo_confidence": round(float(confidence), 3),
                "location_text": location_text,
                "geo_notes": str(geo.get("notes") or "").strip(),
            }
        )
    return jsonify({"events": list(reversed(events)), "skipped_without_coord": skipped_without_coord})


@app.get("/api/analysis/<analysis_id>")
def get_analysis_snapshot(analysis_id: str):
    """按 id 恢复一条研判（内存或 Supabase），并写回当前会话。"""
    aid = str(analysis_id).strip()
    if not aid:
        return jsonify({"error": "analysis_id 无效"}), 400
    store = session_store.setdefault("analysis_by_id", {})
    snap = store.get(aid)
    if not snap:
        try:
            from adapters.persistence.supabase_analysis import fetch_snapshot_from_supabase

            snap = fetch_snapshot_from_supabase(aid)
        except Exception:
            snap = None
    if not snap:
        return jsonify({"error": "未找到该研判记录"}), 404
    restore_session_from_snapshot(session_store, snap)
    remember_analysis_snapshot(session_store, aid, snap)
    bk = snap.get("bukong") or {}
    officer_brief = snap.get("officer_brief")
    if not officer_brief:
        from services.officer_brief import build_officer_brief

        officer_brief = build_officer_brief(str(snap.get("alarm_text") or ""), snap.get("result") or {})
    disposal_nav = snap.get("disposal_nav")
    if not disposal_nav or not isinstance(disposal_nav, dict) or not disposal_nav.get("steps"):
        from services.disposal_nav import build_disposal_nav

        disposal_nav = build_disposal_nav(snap.get("result") or {}, str(snap.get("alarm_text") or ""))
    return jsonify(
        {
            "result": snap["result"],
            "elapsed": snap.get("elapsed", 0),
            "analysis_id": snap.get("analysis_id", aid),
            "markdown": snap.get("markdown", ""),
            "officer_brief": officer_brief,
            "disposal_nav": disposal_nav,
            "bukong": {
                "plan": bk.get("plan"),
                "markdown": bk.get("markdown") or "",
                "raw": bk.get("raw"),
                "error": bk.get("error"),
                "inputs": bk.get("inputs") or {},
            },
            "alarm_text": snap.get("alarm_text", ""),
            "use_rag": snap.get("use_rag", True),
        }
    )


@app.get("/api/analysis-presentation/<analysis_id>")
def analysis_presentation_get(analysis_id: str):
    """专页用：返回 presentation JSON（内存 / Supabase）；无 presentation 时由 result 推导。"""
    aid = str(analysis_id).strip()
    if not aid:
        return jsonify({"error": "无效 id"}), 400
    store = session_store.setdefault("analysis_by_id", {})
    snap = store.get(aid)
    if not snap:
        try:
            from adapters.persistence.supabase_analysis import fetch_snapshot_from_supabase

            snap = fetch_snapshot_from_supabase(aid)
        except Exception:
            snap = None
    if not snap:
        return jsonify({"error": "未找到该研判"}), 404
    pres = snap.get("presentation")
    raw_fb = snap.get("user_feedback")
    fb_norm = str(raw_fb).strip().lower() if raw_fb else None
    if fb_norm not in ("adopt", "ignore"):
        fb_norm = None
    use_rag_snap = bool(snap.get("use_rag", True))
    if not pres:
        pres = build_analysis_presentation(
            aid,
            str(snap.get("alarm_text") or ""),
            snap.get("result") or {},
            float(snap.get("elapsed") or 0.0),
            user_feedback=fb_norm,
            created_at=str(snap.get("created_at") or "") or None,
            use_rag=use_rag_snap,
        )
    elif isinstance(pres, dict):
        pres = dict(pres)
        if fb_norm:
            pres["user_feedback"] = fb_norm
        ai = pres.get("ai")
        if isinstance(ai, dict) and not ai.get("confidence_provenance"):
            fresh = build_analysis_presentation(
                aid,
                str(snap.get("alarm_text") or ""),
                snap.get("result") or {},
                float(snap.get("elapsed") or 0.0),
                user_feedback=fb_norm,
                created_at=str(snap.get("created_at") or "") or None,
                use_rag=use_rag_snap,
            )
            fai = fresh.get("ai") or {}
            ai = dict(ai)
            ai["confidence_pct"] = fai.get("confidence_pct")
            ai["confidence_provenance"] = fai.get("confidence_provenance")
            pres["ai"] = ai
    return jsonify(
        {
            "analysis_id": aid,
            "user_feedback": snap.get("user_feedback"),
            "presentation": pres,
        }
    )


@app.post("/api/analysis-presentation/<analysis_id>/feedback")
def analysis_presentation_feedback(analysis_id: str):
    payload = request.get_json(silent=True) or {}
    fb = str(payload.get("feedback", "")).strip().lower()
    if fb not in ("adopt", "ignore"):
        return jsonify({"error": "feedback 须为 adopt 或 ignore"}), 400
    aid = str(analysis_id).strip()
    store = session_store.setdefault("analysis_by_id", {})
    if aid in store:
        store[aid]["user_feedback"] = fb
        if isinstance(store[aid].get("presentation"), dict):
            pr = dict(store[aid]["presentation"])
            pr["user_feedback"] = fb
            store[aid]["presentation"] = pr
        sync_case_from_presentation_feedback(store[aid], fb)
        try:
            from adapters.persistence.supabase_analysis import update_case_mgmt_if_configured

            update_case_mgmt_if_configured(aid, store[aid].get("case") or {})
        except Exception:
            pass
    try:
        from adapters.persistence.supabase_analysis import update_feedback_if_configured

        update_feedback_if_configured(aid, fb)
    except Exception:
        pass
    return jsonify({"ok": True, "user_feedback": fb})


@app.post("/api/review")
def review():
    if not session_store.latest_result:
        return jsonify({"error": "暂无可复核结果"}), 400

    payload = request.get_json(silent=True) or {}
    review_choice = str(payload.get("review_choice", "需补充信息后再判定"))
    review_note = str(payload.get("review_note", "")).strip()
    analysis_id = str(payload.get("analysis_id", session_store.latest_analysis_id))
    incident_type_override = str(payload.get("incident_type_override", "")).strip() or None

    review_record = build_review_record(
        session_store.latest_result,
        review_choice,
        review_note,
        analysis_id,
        incident_type_override=incident_type_override,
    )
    save_review_record(session_store, review_record)
    sync_case_from_review(session_store, analysis_id, review_choice)
    return jsonify({"review_record": review_record})


@app.post("/api/bukong")
def bukong():
    payload = request.get_json(silent=True) or {}
    incident_bg = str(payload.get("incident_bg", "")).strip()
    suspect_desc = str(payload.get("suspect_desc", "")).strip()
    if not incident_bg and not suspect_desc:
        return jsonify({"error": "案情与特征不能同时为空；研判后会自动带出，也可只填案情后重算。"}), 400

    plan, raw_plan = generate_bukong_plan(incident_bg, suspect_desc)
    record_bukong_generated(session_store)
    md = build_bukong_markdown(plan)
    session_store["latest_bukong_markdown"] = md
    session_store["latest_bukong_plan"] = plan
    session_store["latest_bukong_inputs"] = {"incident_bg": incident_bg, "suspect_desc": suspect_desc}
    session_store["latest_bukong_error"] = None
    return jsonify(
        {
            "plan": plan,
            "raw_plan": raw_plan,
            "markdown": md,
        }
    )


def _build_scorecard(session_store: SessionStore) -> dict[str, Any]:
    """评审维度快照；并入 GET /api/performance 的 scorecard 字段。"""
    perf = build_performance_overview(session_store)
    total = int(perf.get("total", 0))
    review_total = int(perf.get("review_total", 0))
    bukong_total = int(session_store.get("bukong_generated", 0))
    has_latest = session_store.get("latest_result") is not None

    score_items = [
        {
            "dimension": "作品完整性（40）",
            "status": "已具备" if (total > 0 and bukong_total > 0 and review_total > 0) else "待补强",
            "evidence": f"研判次数 {total}，布控次数 {bukong_total}，复核条目 {review_total}",
            "suggestion": "补充端到端演示录屏与闭环案例。",
        },
        {
            "dimension": "应用创新性（25）",
            "status": "已具备" if bukong_total > 0 else "待补强",
            "evidence": f"目标布控已生成 {bukong_total} 次。",
            "suggestion": "补充社会面治理/视频实战延展场景。",
        },
        {
            "dimension": "技术创新性（20）",
            "status": "已具备" if has_latest else "待补强",
            "evidence": "RAG增强研判 + 结构化输出可解释。",
            "suggestion": "补充多模态或RAG重排策略说明。",
        },
        {
            "dimension": "系统性能（15）",
            "status": "已具备" if total > 0 else "待补强",
            "evidence": f"近10次平均耗时 {perf.get('avg_elapsed_last_10', 0):.2f}s。",
            "suggestion": "补充固定样本集准确率与时延报告。",
        },
    ]
    alert_eval = build_alert_evaluation_metrics(session_store)
    score_items.append(
        {
            "dimension": "预警质量评测（新增）",
            "status": "已具备" if alert_eval["counts"]["judged_reviews"] > 0 else "待补强",
            "evidence": (
                f"precision={alert_eval['metrics']['precision']}, "
                f"false_alarm_rate={alert_eval['metrics']['false_alarm_rate']}, "
                f"评测样本={alert_eval['counts']['judged_reviews']}"
            ),
            "suggestion": "引入标准标注集，补齐真实召回率与ROC曲线。",
        }
    )
    return {
        "score_items": score_items,
        "bukong_generated": bukong_total,
    }


@app.get("/api/performance")
def performance():
    perf = build_performance_overview(session_store)
    alert_eval = build_alert_evaluation_metrics(session_store)
    return jsonify(
        {
            "performance": perf,
            "risk_counts": dict(session_store.risk_counts),
            "elapsed_trend": build_elapsed_trend(session_store, tail_size=10),
            "review_distribution": build_review_distribution(session_store),
            "alert_evaluation": alert_eval,
            "scorecard": _build_scorecard(session_store),
        }
    )


@app.get("/api/video/streams")
def video_streams_list():
    vs = _ensure_video_state()
    streams = list(vs.get("streams", {}).values())
    streams.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
    alerts = list(vs.get("alerts", []))
    online = sum(1 for s in streams if str(s.get("status", "online")) == "online")
    offline = max(0, len(streams) - online)
    return jsonify(
        {
            "streams": streams,
            "kpis": {
                "stream_total": len(streams),
                "online_streams": online,
                "offline_streams": offline,
                "alert_total": len(alerts),
                "active_targets_30m": len(
                    {
                        a.get("target_id")
                        for a in alerts
                        if (_now_ts() - float(a.get("event_ts", 0.0))) <= 1800 and a.get("target_id")
                    }
                ),
            },
        }
    )


@app.post("/api/video/streams")
def video_streams_create():
    payload = request.get_json(silent=True) or {}
    camera_id = str(payload.get("camera_id") or "").strip()
    stream_url = str(payload.get("stream_url") or "").strip()
    if not camera_id:
        return jsonify({"error": "camera_id 不能为空"}), 400
    if not stream_url:
        return jsonify({"error": "stream_url 不能为空"}), 400
    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")
    vs = _ensure_video_state()
    stream = {
        "camera_id": camera_id,
        "stream_url": stream_url,
        "zone": str(payload.get("zone") or "").strip(),
        "status": str(payload.get("status") or "online"),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    vs.setdefault("streams", {})[camera_id] = stream
    return jsonify({"ok": True, "stream": stream})


@app.patch("/api/video/streams/<camera_id>")
def video_streams_patch(camera_id: str):
    vs = _ensure_video_state()
    streams = vs.setdefault("streams", {})
    cam = str(camera_id or "").strip()
    if cam not in streams:
        return jsonify({"error": "camera_id 不存在"}), 404
    payload = request.get_json(silent=True) or {}
    s = dict(streams[cam])
    if "status" in payload:
        s["status"] = str(payload.get("status") or "offline")
    if "stream_url" in payload:
        s["stream_url"] = str(payload.get("stream_url") or s.get("stream_url") or "")
    if "zone" in payload:
        s["zone"] = str(payload.get("zone") or "")
    s["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    streams[cam] = s
    return jsonify({"ok": True, "stream": s})


@app.post("/api/video/alerts")
def video_alerts_ingest():
    payload = request.get_json(silent=True) or {}
    camera_id = str(payload.get("camera_id") or "").strip()
    alert_type = str(payload.get("alert_type") or "unknown").strip()
    if not camera_id:
        return jsonify({"error": "camera_id 不能为空"}), 400
    vs = _ensure_video_state()
    streams = vs.setdefault("streams", {})
    if camera_id not in streams:
        streams[camera_id] = {
            "camera_id": camera_id,
            "stream_url": str(payload.get("stream_url") or ""),
            "zone": str(payload.get("zone") or ""),
            "status": "online",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    traits = _norm_traits(payload.get("suspect_traits") or payload.get("signature"))
    event_ts = _now_ts()
    target_id = _assign_target_id(vs, traits, event_ts)
    try:
        score = float(payload.get("score") or 0.0)
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(1.0, score))
    alert = {
        "alert_id": str(uuid.uuid4()),
        "event_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "event_ts": event_ts,
        "camera_id": camera_id,
        "alert_type": alert_type,
        "target_id": target_id,
        "suspect_traits": traits,
        "score": round(score, 4),
        "zone": str((streams.get(camera_id) or {}).get("zone") or ""),
        "event_seq": _bump_video_event_seq(vs),
    }
    arr = vs.setdefault("alerts", [])
    arr.append(alert)
    if len(arr) > 500:
        del arr[: len(arr) - 500]
    return jsonify({"ok": True, "alert": alert})


@app.post("/api/video/detections")
def video_detections_ingest():
    """
    批量检测结果上报（供外部检测器调用）：
    {
      "camera_id":"CAM-001",
      "zone":"东门",
      "stream_url":"https://...m3u8",
      "detections":[{"label":"person","score":0.87,"traits":"黑衣 口罩 电动车"}]
    }
    """
    payload = request.get_json(silent=True) or {}
    camera_id = str(payload.get("camera_id") or "").strip()
    if not camera_id:
        return jsonify({"error": "camera_id 不能为空"}), 400

    zone = str(payload.get("zone") or "").strip()
    stream_url = str(payload.get("stream_url") or "").strip()
    detections = payload.get("detections") or []
    if not isinstance(detections, list):
        return jsonify({"error": "detections 必须为数组"}), 400

    vs = _ensure_video_state()
    streams = vs.setdefault("streams", {})
    if camera_id not in streams:
        streams[camera_id] = {
            "camera_id": camera_id,
            "stream_url": stream_url,
            "zone": zone,
            "status": "online",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    else:
        s = dict(streams[camera_id])
        if stream_url:
            s["stream_url"] = stream_url
        if zone:
            s["zone"] = zone
        s["status"] = "online"
        s["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        streams[camera_id] = s

    accepted: list[dict[str, Any]] = []
    arr = vs.setdefault("alerts", [])
    for det in detections:
        if not isinstance(det, dict):
            continue
        label = str(det.get("label") or "unknown").strip()
        traits = _norm_traits(det.get("traits") or det.get("signature"))
        try:
            score = float(det.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(1.0, score))
        if score < 0.2:
            continue
        event_ts = _now_ts()
        target_id = _assign_target_id(vs, traits, event_ts)
        alert = {
            "alert_id": str(uuid.uuid4()),
            "event_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "event_ts": event_ts,
            "camera_id": camera_id,
            "alert_type": label,
            "target_id": target_id,
            "suspect_traits": traits,
            "score": round(score, 4),
            "zone": str((streams.get(camera_id) or {}).get("zone") or ""),
            "event_seq": _bump_video_event_seq(vs),
        }
        arr.append(alert)
        accepted.append(alert)
    if len(arr) > 500:
        del arr[: len(arr) - 500]
    return jsonify({"ok": True, "accepted": len(accepted), "alerts": accepted[:20]})


@app.get("/api/video/alerts")
def video_alerts_list():
    vs = _ensure_video_state()
    lim = request.args.get("limit", type=int) or 50
    lim = max(1, min(lim, 200))
    alerts = list(vs.get("alerts", []))[-lim:]
    alerts.reverse()
    return jsonify({"alerts": alerts})


@app.get("/api/video/events")
def video_events_stream():
    """SSE：视频告警实时流（轻量实现，供前端即时刷新）。"""
    vs = _ensure_video_state()
    try:
        last_seen = int(request.args.get("since") or 0)
    except ValueError:
        last_seen = 0

    @stream_with_context
    def gen():
        nonlocal last_seen
        # 首包心跳，尽快建立连接
        yield "event: heartbeat\ndata: {\"ok\":true}\n\n"
        idle = 0
        while True:
            vss = _ensure_video_state()
            current_seq = int(vss.get("last_event_seq", 0))
            if current_seq > last_seen:
                alerts = [a for a in list(vss.get("alerts", [])) if int(a.get("event_seq", 0)) > last_seen]
                alerts = alerts[-20:]
                if alerts:
                    last_seen = int(alerts[-1].get("event_seq", last_seen))
                    payload = {"alerts": alerts, "last_event_seq": last_seen}
                    yield f"event: video_alerts\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                idle = 0
            else:
                idle += 1
                if idle >= 10:
                    yield "event: heartbeat\ndata: {\"ok\":true}\n\n"
                    idle = 0
            time.sleep(1.0)

    r = Response(gen(), mimetype="text/event-stream")
    r.headers["Cache-Control"] = "no-cache"
    r.headers["X-Accel-Buffering"] = "no"
    return r


@app.get("/api/evaluation/alerts")
def evaluation_alerts():
    """预警质量评测快照（试点阶段）。"""
    return jsonify(build_alert_evaluation_metrics(session_store))


@app.get("/api/nonface/search")
def nonface_search():
    """非人脸特征检索原型：按衣着/体态/车辆线索匹配历史研判。"""
    query = (request.args.get("query") or "").strip()
    top_k = request.args.get("top_k", type=int) or 5
    if not query:
        return jsonify({"error": "query 不能为空"}), 400
    return jsonify(search_nonface_candidates(session_store, query=query, top_k=top_k))


@app.get("/api/capability-evidence")
def capability_evidence():
    """答辩/文稿用能力证据摘要（JSON + Markdown）。"""
    return jsonify(build_capability_evidence(session_store))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
