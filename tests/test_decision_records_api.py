import json

import pytest
from fastapi.testclient import TestClient

from mining_risk_common.utils.config import get_config
from mining_risk_serve.api.main import create_app
from mining_risk_serve.api.routers import memory as memory_module
from mining_risk_serve.api.services.decision_store import DecisionStore


@pytest.fixture
def decision_config_tmp(monkeypatch, tmp_path):
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


def _seed_records(store: DecisionStore) -> tuple[str, str]:
    root = store.output_dir / "ENT-LIST_root.json"
    batch = store.batch_dir("job-list") / "0001_ENT-LIST_batch.json"
    root.write_text(
        json.dumps(
            {
                "created_at": "2026-05-20 09:00:00",
                "source": "single",
                "request": {"enterprise_id": "ENT-LIST-ROOT", "scenario_id": "chemical", "data": {}},
                "response": {
                    "enterprise_id": "ENT-LIST-ROOT",
                    "scenario_id": "chemical",
                    "final_status": "APPROVE",
                    "predicted_level": "蓝",
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    batch.parent.mkdir(parents=True, exist_ok=True)
    batch.write_text(
        json.dumps(
            {
                "created_at": "2026-05-20 10:00:00",
                "source": "batch",
                "job_id": "job-list",
                "request": {"enterprise_id": "ENT-LIST-BATCH", "scenario_id": "chemical", "data": {}},
                "response": {
                    "enterprise_id": "ENT-LIST-BATCH",
                    "scenario_id": "chemical",
                    "final_status": "HUMAN_REVIEW",
                    "predicted_level": "红",
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return "ENT-LIST_root.json", "batches/job-list/0001_ENT-LIST_batch.json"


def test_list_records_includes_batch_and_filter(decision_config_tmp):
    store = DecisionStore()
    _seed_records(store)
    client = TestClient(create_app())

    resp = client.get("/api/v1/agent/decision/records")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    record_ids = {item["record_id"] for item in data["items"]}
    assert "ENT-LIST_root.json" in record_ids
    assert "batches/job-list/0001_ENT-LIST_batch.json" in record_ids

    filtered = client.get("/api/v1/agent/decision/records", params={"final_status": "HUMAN_REVIEW"})
    assert filtered.status_code == 200
    fdata = filtered.json()
    assert fdata["total"] == 1
    assert fdata["items"][0]["enterprise_id"] == "ENT-LIST-BATCH"


def test_get_record_detail(decision_config_tmp):
    store = DecisionStore()
    _, batch_id = _seed_records(store)
    client = TestClient(create_app())

    resp = client.get(f"/api/v1/agent/decision/records/{batch_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["record_id"] == batch_id
    assert detail["response"]["final_status"] == "HUMAN_REVIEW"
    assert detail["job_id"] == "job-list"


def test_sync_from_disk_endpoint(decision_config_tmp, monkeypatch):
    monkeypatch.setenv("MRA_ALLOW_UNAUTHENTICATED_ADMIN", "true")
    store = DecisionStore()
    _seed_records(store)
    client = TestClient(create_app())

    resp = client.post("/api/v1/agent/decision/approvals/sync-from-disk")
    assert resp.status_code == 200
    body = resp.json()
    assert body["scanned"] == 1
    assert body["created"] == 1
