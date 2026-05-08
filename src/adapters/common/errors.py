from __future__ import annotations

from typing import Any


class ApiError(Exception):
    """内部 API 业务异常，携带 HTTP 状态与错误码。"""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


def error_payload(code: str, message: str, request_id: str | None, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id or "",
            "details": details or {},
        }
    }
