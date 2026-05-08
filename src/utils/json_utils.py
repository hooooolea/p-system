"""从 LLM 文本中提取 JSON（支持 ```json 代码块）。"""

from __future__ import annotations

import json
from typing import Any


def parse_llm_json(content: str) -> dict[str, Any]:
    """
    解析 LLM 返回的 JSON。
    支持纯 JSON、以及被 markdown 代码块包裹的内容。
    """
    text = (content or "").strip()
    if not text:
        raise ValueError("empty content")

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            inner = parts[1].strip()
            if inner.lower().startswith("json"):
                inner = inner[4:].lstrip()
            text = inner.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 兜底：取第一个 { 到最后一个 } 之间的子串再试
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise
