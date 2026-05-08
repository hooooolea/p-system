from __future__ import annotations

from typing import Any

from rag_retriever import BUILTIN_KNOWLEDGE, retrieve_procedures


class KnowledgeClient:
    """警务知识库检索：演示层封装 RAG 规程检索 + 内置文档元数据。"""

    def search(self, q: str, jurisdiction: str = "", doc_types: str = "", top_k: int = 5) -> dict[str, Any]:
        q = (q or "").strip()
        top_k = max(1, min(int(top_k or 5), 20))
        blob = retrieve_procedures(q, k=min(3, top_k))
        chunks: list[dict[str, Any]] = []
        if blob.strip():
            chunks.append(
                {
                    "doc_id": "rag_aggregate",
                    "title": "规程检索聚合片段",
                    "snippet": blob[:2000],
                    "score": 1.0,
                }
            )
        ql = q.lower()
        for doc in BUILTIN_KNOWLEDGE:
            hay = f"{doc.get('title','')} {' '.join(doc.get('keywords') or [])} {doc.get('category','')}".lower()
            if not q or q in hay or any(kw in ql for kw in doc.get("keywords") or []):
                chunks.append(
                    {
                        "doc_id": doc.get("id"),
                        "title": doc.get("title"),
                        "snippet": (doc.get("content") or "")[:400] + "…",
                        "score": 0.85,
                    }
                )
            if len(chunks) >= top_k:
                break
        return {"chunks": chunks[:top_k], "jurisdiction": jurisdiction, "doc_types": doc_types}

    def doc_meta(self, doc_id: str) -> dict[str, Any] | None:
        for doc in BUILTIN_KNOWLEDGE:
            if doc.get("id") == doc_id:
                return {
                    "doc_id": doc_id,
                    "title": doc.get("title"),
                    "category": doc.get("category"),
                    "keywords": doc.get("keywords"),
                }
        return None
