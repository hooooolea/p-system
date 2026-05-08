"""
警情分类与风险评估（兼容层）

实现已拆分到 prompts / llm_factory / services/incident_service 等模块；
本文件保留原 import 路径，供 `test_quick.py` 与业务服务层直接使用。
"""

from llm_factory import get_llm
from prompts import INCIDENT_ANALYSIS_PROMPT
from schemas import IncidentAnalysis, IncidentType, RiskLevel
from services.incident_service import analyze_incident

__all__ = [
    "INCIDENT_ANALYSIS_PROMPT",
    "IncidentAnalysis",
    "IncidentType",
    "RiskLevel",
    "get_llm",
    "analyze_incident",
]
