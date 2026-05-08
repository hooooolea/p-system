"""专网多源接入 Adapter 层（110 / 视频 / 知识库 / 历史库 / ASR → CanonicalIncident）。"""

from adapters.ingest.repository import IncidentRepository
from adapters.ingest.service import IngestService

__all__ = ["IncidentRepository", "IngestService"]
