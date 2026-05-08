"""最小脱敏：演示环境可关闭；生产按 pii_policy 扩展。"""

from __future__ import annotations

import re


def redact_text(text: str, policy: str = "default-v1") -> str:
    if policy == "off" or not text:
        return text
    # 11 位手机号
    out = re.sub(r"(?<!\d)1\d{10}(?!\d)", "[手机号已脱敏]", text)
    return out
