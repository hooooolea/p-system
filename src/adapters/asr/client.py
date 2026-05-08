from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    # src/adapters/asr/client.py -> parents[3] = 项目根
    return Path(__file__).resolve().parents[3]


def _resolve_audio_input(ref_value: str) -> tuple[Any, str]:
    """
    返回 (pipeline 输入, 用于日志的简短描述)。
    支持：本地上传路径 /uploads/<uuid>.wav、绝对路径、http(s) URL（与 ModelScope 文档一致）。
    """
    ref = (ref_value or "").strip()
    if ref.startswith("/uploads/"):
        fname = ref.removeprefix("/uploads/").lstrip("/")
        if not fname or ".." in fname or "/" in fname or "\\" in fname:
            raise FileNotFoundError(f"非法上传路径: {ref_value}")
        base = os.environ.get("ASR_UPLOAD_ROOT", "").strip()
        root = Path(base) if base else _repo_root() / "data" / "uploads"
        path = (root / fname).resolve()
        try:
            path.relative_to(root.resolve())
        except ValueError as e:
            raise FileNotFoundError(f"路径越界: {path}") from e
        if not path.is_file():
            raise FileNotFoundError(f"音频文件不存在: {path}")
        return str(path), str(path)
    if ref.startswith("http://") or ref.startswith("https://"):
        return ref, ref
    p = Path(ref).expanduser()
    if p.is_file():
        return str(p.resolve()), str(p)
    raise FileNotFoundError(f"无法解析录音: {ref_value!r}")


def _extract_text(rec: Any) -> str:
    if rec is None:
        return ""
    if isinstance(rec, str):
        return rec.strip()
    if isinstance(rec, dict):
        t = rec.get("text")
        if isinstance(t, str) and t.strip():
            return t.strip()
        preds = rec.get("preds")
        if isinstance(preds, str) and preds.strip():
            return preds.strip()
        if isinstance(preds, list) and preds:
            return _extract_text(preds[0])
        for k in ("pred", "prediction", "value"):
            v = rec.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    if isinstance(rec, list) and rec:
        return _extract_text(rec[0])
    return str(rec).strip()


class AsrClient:
    """
    语音识别：默认走 ModelScope ASR pipeline（与 asr/说明.md 中 Paraformer-large+VAD+PUNC 一致）；
    设置 ASR_BACKEND=mock 时使用占位转写（无依赖）。
    """

    def __init__(self, backend: str | None = None) -> None:
        raw = backend if backend is not None else os.environ.get("ASR_BACKEND", "modelscope")
        self._backend = str(raw).strip().lower()
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._pipeline: Any = None
        self._pipeline_lock = threading.Lock()

    def _ensure_pipeline(self) -> Any:
        if self._backend == "mock":
            return None
        with self._pipeline_lock:
            if self._pipeline is not None:
                return self._pipeline
            try:
                from modelscope.pipelines import pipeline
                from modelscope.utils.constant import Tasks
            except ImportError as e:  # pragma: no cover
                raise RuntimeError(
                    "未安装 modelscope，无法加载 ASR。请 pip install modelscope "
                    "并安装 PyTorch；或设置 ASR_BACKEND=mock"
                ) from e

            model_id = os.environ.get(
                "ASR_MODEL_ID",
                "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            ).strip()
            local_dir = os.environ.get("ASR_LOCAL_DIR", "").strip()
            revision = os.environ.get("ASR_MODEL_REVISION", "v2.0.5").strip()

            if local_dir:
                model_path = str(Path(local_dir).expanduser().resolve())
                if not Path(model_path).is_dir():
                    raise FileNotFoundError(f"ASR_LOCAL_DIR 不是目录: {model_path}")
                self._pipeline = pipeline(task=Tasks.auto_speech_recognition, model=model_path)
            else:
                self._pipeline = pipeline(
                    task=Tasks.auto_speech_recognition,
                    model=model_id,
                    model_revision=revision,
                )
            return self._pipeline

    def create_job(self, recording_ref: dict[str, Any], locale: str = "zh-CN") -> str:
        job_id = str(uuid.uuid4())
        ref_value = str((recording_ref or {}).get("ref_value") or "")
        with self._lock:
            self._jobs[job_id] = {
                "status": "pending",
                "locale": locale,
                "recording_ref": recording_ref,
                "text": "",
                "created_at": time.time(),
            }

        if self._backend == "mock":

            def _mock_complete() -> None:
                time.sleep(0.6)
                with self._lock:
                    if job_id in self._jobs:
                        self._jobs[job_id]["status"] = "completed"
                        self._jobs[job_id]["text"] = (
                            f"[ASR 演示转写] 与录音 {ref_value[-24:]} 对应的口语化报警内容已还原。"
                            "（设置 ASR_BACKEND=modelscope 使用真实模型。）"
                        )

            threading.Thread(target=_mock_complete, daemon=True).start()
            return job_id

        def _run_modelscope() -> None:
            try:
                pipe = self._ensure_pipeline()
                audio_in, _desc = _resolve_audio_input(ref_value)
                rec = pipe(audio_in)
                text = _extract_text(rec)
                with self._lock:
                    if job_id in self._jobs:
                        self._jobs[job_id]["status"] = "completed"
                        self._jobs[job_id]["text"] = text
            except Exception as e:  # noqa: BLE001
                with self._lock:
                    if job_id in self._jobs:
                        self._jobs[job_id]["status"] = "failed"
                        self._jobs[job_id]["error"] = str(e)

        threading.Thread(target=_run_modelscope, daemon=True).start()
        return job_id

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            j = self._jobs.get(job_id)
            return dict(j) if j else None
