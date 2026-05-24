"""决策工作流 HUMAN_REVIEW 与记忆库审批队列打通。"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from mining_risk_serve.api.schemas.prediction import DecisionRequest, DecisionResponse
from mining_risk_serve.api.services.decision_store import DecisionStore, _relative_display, _sanitize_value

DECISION_REVIEW_TYPE = "decision_review"
HUMAN_REVIEW_STATUS = "HUMAN_REVIEW"


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _new_id() -> str:
    return str(uuid.uuid4())[:8]


def _get_approval_store() -> tuple[List[Dict[str, Any]], Any]:
    """延迟导入 memory 模块以避免循环依赖。"""
    from mining_risk_serve.api.routers import memory as memory_module

    return memory_module._approval_store, memory_module


def _persist_approvals(memory_module: Any) -> None:
    memory_module._persist_store("approval_store", memory_module._approval_store)


def _enterprise_name_from_data(data: Dict[str, Any]) -> str:
    for key in ("企业名称", "enterprise_name", "单位名称", "公司名称"):
        val = data.get(key)
        if val not in (None, ""):
            return str(val)
    return ""


def _has_pending_for_path(approval_store: List[Dict[str, Any]], decision_path: str) -> bool:
    for item in approval_store:
        if item.get("decision_path") == decision_path and item.get("status") == "pending":
            return True
    return False


def enqueue_decision_review(
    *,
    request: DecisionRequest,
    response: DecisionResponse,
    output: Dict[str, str],
    source: str,
) -> Optional[Dict[str, Any]]:
    """当 final_status 为 HUMAN_REVIEW 时自动加入审批队列。"""
    if response.final_status != HUMAN_REVIEW_STATUS:
        return None

    decision_path = output.get("path")
    if not decision_path:
        return None

    approval_store, memory_module = _get_approval_store()
    if _has_pending_for_path(approval_store, decision_path):
        return None

    ent_name = _enterprise_name_from_data(request.data) or request.enterprise_id
    approval = {
        "id": _new_id(),
        "type": DECISION_REVIEW_TYPE,
        "target_id": request.enterprise_id,
        "action": "decision_review",
        "actor": "system",
        "comment": f"工作流判定需人工审批: {response.predicted_level}级",
        "status": "pending",
        "created_at": _now_str(),
        "timestamp": time.time(),
        "enterprise_id": request.enterprise_id,
        "enterprise_name": ent_name,
        "scenario_id": response.scenario_id or request.scenario_id,
        "predicted_level": response.predicted_level,
        "final_status": response.final_status,
        "decision_path": decision_path,
        "decision_display_path": output.get("display_path") or _relative_display(Path(decision_path)),
        "source": source,
    }
    approval_store.insert(0, approval)
    _persist_approvals(memory_module)
    memory_module._record_audit(
        "create_approval",
        "system",
        request.enterprise_id,
        f"决策自动入队审批: {ent_name} ({response.predicted_level})",
    )
    return approval


def patch_decision_file_on_decide(
    approval: Dict[str, Any],
    decision: str,
    actor: str,
    comment: str,
) -> None:
    """审批通过/驳回后回写决策 JSON。"""
    decision_path = approval.get("decision_path")
    if not decision_path:
        return
    path = Path(decision_path)
    if not path.is_file():
        return

    try:
        with path.open("r", encoding="utf-8") as f:
            record = json.load(f)
    except Exception:
        return

    review_status = "APPROVED" if decision == "approved" else "REJECTED"
    record["approval"] = {
        "status": decision,
        "review_status": review_status,
        "decided_by": actor,
        "comment": comment,
        "decided_at": _now_str(),
    }
    resp = record.get("response") or {}
    if isinstance(resp, dict):
        resp["review_status"] = review_status
    record["response"] = resp

    with path.open("w", encoding="utf-8") as f:
        json.dump(_sanitize_value(record), f, ensure_ascii=False, indent=2)


def _valid_pending_decision_paths() -> set[str]:
    """磁盘上仍待人工审批的决策 JSON 绝对路径集合。"""
    store = DecisionStore()
    paths: set[str] = set()
    for summary in store.list_all_summaries():
        if summary.get("final_status") != HUMAN_REVIEW_STATUS:
            continue
        if summary.get("approval_status") in ("approved", "rejected"):
            continue
        decision_path = summary.get("path")
        if decision_path and Path(decision_path).is_file():
            paths.add(decision_path)
    return paths


def prune_orphaned_decision_approvals() -> int:
    """移除决策 JSON 已删除或不再待审的 pending 决策审批项。"""
    valid_paths = _valid_pending_decision_paths()
    approval_store, memory_module = _get_approval_store()
    kept: List[Dict[str, Any]] = []
    removed = 0
    for item in approval_store:
        if (
            item.get("status") == "pending"
            and item.get("type") == DECISION_REVIEW_TYPE
        ):
            path = item.get("decision_path")
            if not path or path not in valid_paths or not Path(path).is_file():
                removed += 1
                continue
        kept.append(item)
    if removed:
        approval_store.clear()
        approval_store.extend(kept)
        _persist_approvals(memory_module)
    return removed


def sync_decision_approvals_from_disk() -> Dict[str, int]:
    """扫描磁盘上的 HUMAN_REVIEW 决策 JSON 并补录待审批项；同时清理无效队列项。"""
    store = DecisionStore()
    approval_store, memory_module = _get_approval_store()
    removed = prune_orphaned_decision_approvals()
    scanned = 0
    created = 0
    skipped = 0

    for summary in store.list_all_summaries():
        if summary.get("final_status") != HUMAN_REVIEW_STATUS:
            continue
        scanned += 1
        decision_path = summary.get("path")
        if not decision_path:
            skipped += 1
            continue
        if summary.get("approval_status") in ("approved", "rejected"):
            skipped += 1
            continue
        if _has_pending_for_path(approval_store, decision_path):
            skipped += 1
            continue

        approval = {
            "id": _new_id(),
            "type": DECISION_REVIEW_TYPE,
            "target_id": summary.get("enterprise_id", "unknown"),
            "action": "decision_review",
            "actor": "system",
            "comment": "从磁盘历史决策同步入队",
            "status": "pending",
            "created_at": _now_str(),
            "timestamp": time.time(),
            "enterprise_id": summary.get("enterprise_id"),
            "enterprise_name": summary.get("enterprise_name"),
            "scenario_id": summary.get("scenario_id"),
            "predicted_level": summary.get("predicted_level"),
            "final_status": summary.get("final_status"),
            "decision_path": decision_path,
            "decision_display_path": summary.get("display_path"),
            "source": summary.get("source"),
            "job_id": summary.get("job_id"),
        }
        approval_store.insert(0, approval)
        created += 1

    if created:
        _persist_approvals(memory_module)
    return {"scanned": scanned, "created": created, "skipped": skipped, "removed": removed}


def count_pending_decision_reviews() -> int:
    approval_store, _ = _get_approval_store()
    return len([
        a for a in approval_store
        if a.get("status") == "pending" and a.get("type") == DECISION_REVIEW_TYPE
    ])
