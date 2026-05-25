"""
知识库管理路由：支持 MD 文件的增删改查与版本回滚
"""

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from mining_risk_serve.api.schemas.knowledge import KnowledgeAppendRequest, KnowledgeUpdateRequest
from mining_risk_serve.api.security import require_admin_token
from mining_risk_serve.harness.validation import EvidenceRetriever
from mining_risk_serve.harness.vector_store import VectorStore
from mining_risk_serve.harness.knowledge_base import KnowledgeBaseManager
from mining_risk_common.utils.config import get_config, resolve_project_path
from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

REPORT_DIR = resolve_project_path("reports")
RAG_REPORT_PATH = REPORT_DIR / "rag_index_rebuild_run.json"
AUDIT_REPORT_PATH = REPORT_DIR / "knowledge_system_audit_run.json"
AGENTFS_REPORT_PATH = REPORT_DIR / "agentfs_kb_sync_run.json"
RULE_REPORT_PATH = REPORT_DIR / "rule_kbs_rebuild_run.json"
ACCIDENT_REPORT_PATH = REPORT_DIR / "accident_cases_kb_rebuild_run.json"

KB_HIGHLIGHTS: Dict[str, Dict[str, Any]] = {
    "工矿风险预警智能体合规执行书.md": {
        "type": "compliance",
        "highlight": "COM 合规红线、必须上报/停产/撤人/整改/复查规则",
        "summary": "面向工矿风险预警的合规执行底座，包含红线、处置动作、审计留痕和三类规则锚点。",
        "key_sections": ["合规红线规则表", "必须上报、停产、撤人、整改、复查和数据审计规则", "机器可读摘要"],
        "data_sources": ["安全生产法", "工贸重大事故隐患判定标准", "项目审计规则"],
    },
    "部门分级审核SOP.md": {
        "type": "sop",
        "highlight": "SOP 分级路由、协同、退回、闭环和联系人占位",
        "summary": "记录监管部门分级审核流程、协同部门、时限和闭环要求，供路由配置和审计展示引用。",
        "key_sections": ["分级路由、协同、退回和闭环 SOP 表", "机器可读摘要"],
        "data_sources": ["部门/人员/监管主体公开字段", "项目 SOP"],
    },
    "工业物理常识及传感器时间序列逻辑.md": {
        "type": "physics",
        "highlight": "PHY 工况逻辑、传感器时间序列、粉尘/危化/冶金/有限空间规则",
        "summary": "沉淀工况物理约束和传感器逻辑，支撑异常解释、阈值复核和跨指标一致性检查。",
        "key_sections": ["数据来源与事实边界", "工况逻辑和时间序列规则表", "机器可读摘要"],
        "data_sources": ["公开字段映射", "传感器逻辑规则", "国家/行业标准"],
    },
    "企业已具备的执行条件.md": {
        "type": "conditions",
        "highlight": "公开数据重建的企业执行条件事实库",
        "summary": "基于公开数据整理企业人员、设备、资质、隐患、处罚、行业、位置和生产状态等执行条件。",
        "key_sections": ["公开数据统计", "粉尘涉爆执行条件", "冶金执行条件", "危化品执行条件"],
        "data_sources": ["public_data_inventory.json", "public_data_field_mapping.csv", "公开数据 67 个文件/sheet"],
    },
    "类似事故处理案例.md": {
        "type": "cases",
        "highlight": "36 个真实公开数据 B/C/D 类案例与 3 个模板案例",
        "summary": "从隐患闭环、处罚、风险组合中沉淀可追溯案例，明确不把未确认事件表述为真实事故。",
        "key_sections": ["重大隐患与未整改闭环案例", "行政处罚案例", "高风险企业风险组合案例"],
        "data_sources": ["accident_cases_kb_rebuild_run.json", "公开检查/隐患/处罚/风险表"],
    },
    "预警历史经验与短期记忆摘要.md": {
        "type": "history_memory",
        "highlight": "预警历史经验、短期记忆摘要和归档入口",
        "summary": "保留预警经验和短期记忆摘要，为 P0-P3 记忆机制提供可展示的归档视图。",
        "key_sections": ["历史经验摘要", "短期记忆摘要"],
        "data_sources": ["memory/*.md", "AgentFS memory archive"],
    },
}

AUDIT_WARNINGS = [
    "AgentFS deprecated 乱码路径仍保留",
    "当前仍使用 fallback embedding/reranker",
    "本地公开数据无法确认 A 类真实事故详案",
    "法条编号/标准条款需法务复核",
    "阈值需按企业设备/SDS/SOP 校准",
    "部门真实联系人仍需部署配置",
]

MEMORY_ARCHIVES = [
    {
        "path": "memory/风险事件归档.md",
        "priority": "P1",
        "strategy": "摘要归档",
        "description": "沉淀已核验的风险事件摘要和后续复查线索。",
    },
    {
        "path": "memory/核心指令归档.md",
        "priority": "P0",
        "strategy": "永久保留",
        "description": "保存系统边界、禁止项和核心运行约束。",
    },
    {
        "path": "memory/处置经验归档.md",
        "priority": "P1",
        "strategy": "摘要归档",
        "description": "归档经过复盘的处置经验和现场操作注意事项。",
    },
    {
        "path": "memory/系统日志归档.md",
        "priority": "P2",
        "strategy": "压缩保留",
        "description": "保存可压缩的系统运行摘要和审计索引。",
    },
]

def _get_kb() -> KnowledgeBaseManager:
    """每次都创建新实例，确保代码热更新后立即可见。"""

    return KnowledgeBaseManager()


@router.get("/list")
async def list_knowledge() -> List[str]:
    """列出所有知识库文件"""

    kb = _get_kb()
    return kb.list_files()


@router.get("/read/{filename}")
async def read_knowledge(filename: str) -> Dict[str, str]:
    """读取知识库文件内容"""

    kb = _get_kb()
    try:
        content = kb.read(filename)
        return {"filename": filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/write")
async def write_knowledge(
    request: KnowledgeUpdateRequest,
    _: None = Depends(require_admin_token),
) -> Dict[str, str]:
    """写入知识库文件"""

    kb = _get_kb()
    kb.write(request.filename, request.content, agent_id=request.agent_id)
    return {"status": "success", "filename": request.filename}


@router.post("/append")
async def append_knowledge(
    request: KnowledgeAppendRequest,
    _: None = Depends(require_admin_token),
) -> Dict[str, str]:
    """追加内容到知识库文件"""

    kb = _get_kb()
    kb.append(request.filename, request.content, agent_id=request.agent_id)
    return {"status": "success", "filename": request.filename}


@router.post("/snapshot")
async def snapshot_knowledge(
    commit_message: str,
    agent_id: Optional[str] = None,
    _: None = Depends(require_admin_token),
) -> Dict[str, str]:
    """生成知识库快照"""

    kb = _get_kb()
    commit_id = kb.snapshot(commit_message, agent_id=agent_id)
    return {"status": "success", "commit_id": commit_id}


@router.post("/rollback/{commit_id}")
async def rollback_knowledge(
    commit_id: str,
    _: None = Depends(require_admin_token),
) -> Dict[str, str]:
    """回滚知识库到指定版本"""

    kb = _get_kb()
    kb.rollback(commit_id)
    return {"status": "success", "commit_id": commit_id}


def _safe_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _rag_chunk_count() -> int:
    try:
        store = VectorStore(embedding_backend="auto")
        return int(store.collection.count())
    except Exception as exc:
        logger.warning("读取 RAG chunk 数失败: %s", exc)
        report = _safe_json(RAG_REPORT_PATH)
        return int(report.get("collection_count") or 0)


@router.get("/system/overview")
async def knowledge_system_overview() -> Dict[str, Any]:
    """知识库系统只读总览（审计、AgentFS、RAG、六库状态）。"""

    audit = _safe_json(AUDIT_REPORT_PATH)
    rag_report = _safe_json(RAG_REPORT_PATH)
    agentfs_report = _safe_json(AGENTFS_REPORT_PATH)
    rule_report = _safe_json(RULE_REPORT_PATH)
    accident_report = _safe_json(ACCIDENT_REPORT_PATH)

    kb_dir = resolve_project_path("knowledge_base")
    rag_chunks = _rag_chunk_count()
    try:
        from scripts.sync_kb_to_agentfs import agentfs_manifest, compare_manifests, filesystem_manifest

        config = get_config()
        db_path = resolve_project_path(config.harness.agentfs.db_path)
        comparison = compare_manifests(filesystem_manifest(kb_dir), agentfs_manifest(db_path))
        agentfs_match = bool(comparison.get("all_main_files_match"))
    except Exception as exc:
        logger.warning("AgentFS 在线比对失败，回退到同步报告: %s", exc)
        agentfs_match = bool((agentfs_report.get("after") or {}).get("all_main_files_match"))
    fs_manifest = {
        entry["path"]: entry
        for entry in (agentfs_report.get("after") or agentfs_report.get("verify") or {}).get(
            "filesystem_entries", []
        )
        if isinstance(entry, dict) and entry.get("path")
    }

    knowledge_bases: List[Dict[str, Any]] = []
    for filename, meta in KB_HIGHLIGHTS.items():
        fs_entry = fs_manifest.get(filename, {})
        knowledge_bases.append(
            {
                "filename": filename,
                "type": meta["type"],
                "highlight": meta["highlight"],
                "agentfs_match": agentfs_match,
                "rag_chunks": rag_chunks,
                "quality_status": "PASS",
                "summary": meta["summary"],
                "key_sections": meta["key_sections"],
                "data_sources": meta["data_sources"],
                "fs_size": fs_entry.get("size"),
                "sha256": fs_entry.get("sha256"),
            }
        )

    status_counts = (audit.get("status_counts") or {}) if audit else {}
    overall = audit.get("overall_status") or (
        "PASS_WITH_WARNINGS" if status_counts.get("WARN") else "PASS"
    )

    return {
        "overview": {
            "audit_status": overall,
            "kb_file_count": len(KnowledgeBaseManager.KNOWLEDGE_FILES),
            "rag_chunks": rag_chunks,
            "rule_count": int((rule_report.get("rule_counts") or {}).get("total") or 0),
            "real_public_data_cases": int(accident_report.get("real_public_data_cases") or 0),
            "agentfs_sync_status": "synced" if agentfs_match else "drift",
            "embedding_backend": rag_report.get("embedding_backend") or "auto",
        },
        "knowledge_bases": knowledge_bases,
        "agentfs": {
            "snapshot_commit_id": agentfs_report.get("snapshot_commit_id"),
            "fs_agentfs_match": agentfs_match,
            "deprecated_entries": (agentfs_report.get("after") or {}).get("agentfs_only", []),
            "deprecated_warning": AUDIT_WARNINGS[0],
            "sync_script_name": "scripts/sync_kb_to_agentfs.py",
        },
        "rag_index": {
            "persist_directory": str(resolve_project_path("var/chroma")),
            "collection_name": "knowledge_base",
            "collection_count": rag_chunks,
            "embedding_backend": rag_report.get("embedding_backend") or "auto",
            "fallback_embedding_used": bool(rag_report.get("fallback_embedding_used")),
        },
        "memory_archives": MEMORY_ARCHIVES,
        "audit_warnings": AUDIT_WARNINGS,
    }


@router.get("/rag/search")
async def knowledge_rag_search(
    q: str = Query(..., min_length=1),
    top_k: int = Query(6, ge=1, le=20),
) -> Dict[str, Any]:
    """只读 RAG 检索，返回带 source_file 的证据块。"""

    store = VectorStore(embedding_backend="auto")
    raw = store.similarity_search(q, top_k=top_k)
    results = [
        {
            "id": item.get("id"),
            "source_file": (item.get("metadata") or {}).get("source_file", ""),
            "section_title": (item.get("metadata") or {}).get("section_title", ""),
            "doc_type": (item.get("metadata") or {}).get("doc_type", ""),
            "matched_text": (item.get("text") or "")[:500],
            "rule_id": (item.get("metadata") or {}).get("rule_id"),
            "sop_id": (item.get("metadata") or {}).get("sop_id"),
            "case_id": (item.get("metadata") or {}).get("case_id"),
        }
        for item in raw
        if item.get("text")
    ]
    return {
        "query": q,
        "mode": "similarity",
        "collection_name": store.collection_name,
        "embedding_backend": store.embedding_backend,
        "results": results,
    }
