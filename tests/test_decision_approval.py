import json
from pathlib import Path

import pytest

from mining_risk_serve.api.routers import memory as memory_module
from mining_risk_serve.api.schemas.prediction import DecisionRequest, DecisionResponse
from mining_risk_serve.api.services.decision_approval import (
    enqueue_decision_review,
    patch_decision_file_on_decide,
    prune_orphaned_decision_approvals,
    sync_decision_approvals_from_disk,
)
from mining_risk_serve.api.services.decision_store import DecisionStore


@pytest.fixture
def decision_config_tmp(monkeypatch, tmp_path):
    from mining_risk_common.utils.config import get_config

    config = get_config()
    old_var_root = config.paths.var_root
    old_output_dir = config.decision.output_dir
    old_enabled = config.decision.persist_enabled
    monkeypatch.setattr(config.paths, "var_root", str(tmp_path / "var"))
    monkeypatch.setattr(config.decision, "output_dir", str(tmp_path / "var" / "decisions"))
    monkeypatch.setattr(config.decision, "persist_enabled", True)
    yield tmp_path
    monkeypatch.setattr(config.paths, "var_root", old_var_root)
    monkeypatch.setattr(config.decision, "output_dir", old_output_dir)
    monkeypatch.setattr(config.decision, "persist_enabled", old_enabled)


@pytest.fixture(autouse=True)
def clear_approval_store():
    memory_module._approval_store.clear()
    yield
    memory_module._approval_store.clear()


def _human_review_response() -> DecisionResponse:
    return DecisionResponse(
        enterprise_id="ENT-HR-1",
        scenario_id="chemical",
        final_status="HUMAN_REVIEW",
        predicted_level="橙",
        probability_distribution={"橙": 0.8},
        shap_contributions=[],
    )


def test_enqueue_on_human_review(decision_config_tmp):
    request = DecisionRequest(
        enterprise_id="ENT-HR-1",
        scenario_id="chemical",
        data={"企业名称": "待审企业"},
    )
    output = DecisionStore().save_decision(
        request=request,
        response=_human_review_response(),
        final_state={"memory_results": []},
        source="single",
    )
    approval = enqueue_decision_review(
        request=request,
        response=_human_review_response(),
        output=output,
        source="single",
    )
    assert approval is not None
    assert approval["type"] == "decision_review"
    assert approval["status"] == "pending"
    assert approval["decision_path"] == output["path"]
    assert len(memory_module._approval_store) == 1

    # 同路径不重复入队
    again = enqueue_decision_review(
        request=request,
        response=_human_review_response(),
        output=output,
        source="single",
    )
    assert again is None
    assert len(memory_module._approval_store) == 1


def test_patch_decision_file_on_decide(decision_config_tmp):
    request = DecisionRequest(enterprise_id="ENT-HR-2", scenario_id="chemical", data={})
    output = DecisionStore().save_decision(
        request=request,
        response=_human_review_response(),
        final_state={},
        source="batch",
    )
    approval = enqueue_decision_review(
        request=request,
        response=_human_review_response(),
        output=output,
        source="batch",
    )
    patch_decision_file_on_decide(approval, "approved", "admin", "通过")
    with Path(output["path"]).open("r", encoding="utf-8") as f:
        record = json.load(f)
    assert record["approval"]["status"] == "approved"
    assert record["approval"]["review_status"] == "APPROVED"
    assert record["response"]["review_status"] == "APPROVED"


def test_sync_from_disk_creates_pending(decision_config_tmp):
    store = DecisionStore()
    root_file = store.output_dir / "ENT-SYNC_1.json"
    batch_file = store.batch_dir("job-sync") / "0001_ENT-SYNC_2.json"
    for path, ent in ((root_file, "ENT-SYNC-1"), (batch_file, "ENT-SYNC-2")):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "created_at": "2026-05-20 12:00:00",
                    "source": "batch" if "batches" in str(path) else "single",
                    "job_id": "job-sync" if "batches" in str(path) else None,
                    "request": {"enterprise_id": ent, "scenario_id": "chemical", "data": {}},
                    "response": {
                        "enterprise_id": ent,
                        "scenario_id": "chemical",
                        "final_status": "HUMAN_REVIEW",
                        "predicted_level": "红",
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    result = sync_decision_approvals_from_disk()
    assert result["scanned"] == 2
    assert result["created"] == 2
    assert len(memory_module._approval_store) == 2

    result2 = sync_decision_approvals_from_disk()
    assert result2["created"] == 0
    assert result2["skipped"] >= 2


def test_prune_orphaned_when_decision_json_deleted(decision_config_tmp):
    store = DecisionStore()
    path = store.output_dir / "ENT-ORPHAN.json"
    path.write_text(
        json.dumps(
            {
                "created_at": "2026-05-20 12:00:00",
                "source": "single",
                "request": {"enterprise_id": "ENT-ORPHAN", "scenario_id": "chemical", "data": {}},
                "response": {
                    "enterprise_id": "ENT-ORPHAN",
                    "scenario_id": "chemical",
                    "final_status": "HUMAN_REVIEW",
                    "predicted_level": "红",
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    sync_decision_approvals_from_disk()
    assert len(memory_module._approval_store) == 1
    decision_path = memory_module._approval_store[0]["decision_path"]
    path.unlink()
    removed = prune_orphaned_decision_approvals()
    assert removed == 1
    assert len(memory_module._approval_store) == 0
    result = sync_decision_approvals_from_disk()
    assert result["removed"] == 0
    assert result["scanned"] == 0
