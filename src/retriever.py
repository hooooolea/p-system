"""
RAG 检索统一入口（实现细节见 rag_retriever）。
便于在业务代码中 `from retriever import retrieve_procedures`。
"""

from rag_retriever import build_knowledge_base, get_knowledge_base, retrieve_procedures

__all__ = [
    "retrieve_procedures",
    "build_knowledge_base",
    "get_knowledge_base",
]
