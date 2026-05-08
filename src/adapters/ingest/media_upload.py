"""语音 / 视频文件落盘与校验（专网或本地演示）。"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from werkzeug.datastructures import FileStorage

from adapters.common.errors import ApiError

# 扩展名白名单（小写）
AUDIO_EXT = frozenset({".mp3", ".wav", ".m4a", ".aac", ".webm", ".ogg", ".flac"})
VIDEO_EXT = frozenset({".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"})

# 默认大小上限（字节）
DEFAULT_MAX_AUDIO = 30 * 1024 * 1024
DEFAULT_MAX_VIDEO = 80 * 1024 * 1024

_STEM_RE = re.compile(r"^[a-f0-9]{32}$", re.I)


def allowed_filename(stem: str, suffix: str) -> bool:
    return bool(_STEM_RE.match(stem)) and suffix.lower() in (AUDIO_EXT | VIDEO_EXT)


def validate_upload(
    kind: str,
    file: FileStorage | None,
    *,
    max_audio: int = DEFAULT_MAX_AUDIO,
    max_video: int = DEFAULT_MAX_VIDEO,
) -> tuple[str, bytes]:
    if not file or not file.filename:
        raise ApiError("VALIDATION_FAILED", "未选择文件", 400)
    raw_name = Path(file.filename).name
    suffix = Path(raw_name).suffix.lower()
    if kind == "audio":
        if suffix not in AUDIO_EXT:
            raise ApiError("VALIDATION_FAILED", f"不支持的语音格式：{suffix}，允许 {sorted(AUDIO_EXT)}", 400)
        max_size = max_audio
    elif kind == "video":
        if suffix not in VIDEO_EXT:
            raise ApiError("VALIDATION_FAILED", f"不支持的视频格式：{suffix}，允许 {sorted(VIDEO_EXT)}", 400)
        max_size = max_video
    else:
        raise ApiError("VALIDATION_FAILED", "kind 须为 audio 或 video", 400)

    data = file.read()
    if len(data) > max_size:
        raise ApiError("VALIDATION_FAILED", f"文件过大（上限 {max_size // (1024 * 1024)} MB）", 400)
    if len(data) == 0:
        raise ApiError("VALIDATION_FAILED", "空文件", 400)
    return suffix, data


def save_upload_bytes(upload_dir: Path, suffix: str, data: bytes) -> str:
    """写入磁盘，返回磁盘文件名（uuid+suffix）。"""
    upload_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{suffix}"
    path = upload_dir / fname
    path.write_bytes(data)
    return fname


def build_attachment(
    *,
    fname: str,
    kind: str,
    original_name: str,
    size: int,
) -> dict[str, Any]:
    media_type = "audio" if kind == "audio" else "video"
    return {
        "attachment_id": str(uuid.uuid4()),
        "source_system": "upload",
        "media_type": media_type,
        "ref_type": "url",
        "ref_value": f"/uploads/{fname}",
        "metadata": {"original_name": original_name, "size": size, "stored_name": fname},
    }
