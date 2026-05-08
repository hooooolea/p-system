"""结构化类型定义（报告/扩展接口用）。"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class IncidentType(str, Enum):
    FIGHT = "打架斗殴"
    THEFT = "盗窃抢劫"
    TRAFFIC = "交通事故"
    FRAUD = "诈骗"
    DOMESTIC = "家庭纠纷"
    MISSING = "失踪人口"
    FIRE = "火灾"
    MEDICAL = "医疗急救"
    NOISE = "噪音扰民"
    DRUG = "涉毒案件"
    TERRORISM = "反恐处置"
    OTHER = "其他"


class RiskLevel(str, Enum):
    LOW = "低"
    MEDIUM = "中"
    HIGH = "高"
    CRITICAL = "紧急"


class IncidentAnalysis(BaseModel):
    incident_type: str
    risk_level: str
    key_info: dict
    summary: str
    disposal_suggestion: str
    law_reference: str
    geo: dict | None = None
    analysis_confidence: int | None = None
    confidence_rationale: str | None = None
