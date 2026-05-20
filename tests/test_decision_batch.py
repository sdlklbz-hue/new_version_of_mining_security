import asyncio
import io
from pathlib import Path

import pytest
from fastapi import UploadFile

from mining_risk_common.utils.config import get_config
from mining_risk_serve.api.schemas.prediction import DecisionResponse
from mining_risk_serve.api.services.decision_batch_service import DecisionBatchService
from mining_risk_serve.api.services.decision_store import DecisionStore


@pytest.fixture
def batch_config_tmp(monkeypatch, tmp_path):
    config = get_config()
    old_var_root = config.paths.var_root
    old_output_dir = config.decision.output_dir
    old_enabled = config.decision.persist_enabled
    old_concurrency = config.decision.batch_max_concurrency
    old_rows = config.decision.batch_max_rows
    monkeypatch.setattr(config.paths, "var_root", str(tmp_path / "var"))
    monkeypatch.setattr(config.decision, "output_dir", str(tmp_path / "var" / "decisions"))
    monkeypatch.setattr(config.decision, "persist_enabled", True)
    monkeypatch.setattr(config.decision, "batch_max_concurrency", 2)
    monkeypatch.setattr(config.decision, "batch_max_rows", 10)
    yield tmp_path
    monkeypatch.setattr(config.paths, "var_root", old_var_root)
    monkeypatch.setattr(config.decision, "output_dir", old_output_dir)
    monkeypatch.setattr(config.decision, "persist_enabled", old_enabled)
    monkeypatch.setattr(config.decision, "batch_max_concurrency", old_concurrency)
    monkeypatch.setattr(config.decision, "batch_max_rows", old_rows)


class FakePredictionService:
    async def run_decision(self, request, *, source, job_id, row_index, **_kwargs):
        response = DecisionResponse(
            enterprise_id=request.enterprise_id,
            scenario_id=request.scenario_id or "chemical",
            final_status="APPROVE",
            predicted_level="蓝",
            probability_distribution={"蓝": 1.0},
            shap_contributions=[],
        )
        output = DecisionStore().save_decision(
            request=request,
            response=response,
            final_state={"memory_results": []},
            source=source,
            job_id=job_id,
            row_index=row_index,
        )
        response.output_path = output["path"]
        response.output_display_path = output["display_path"]
        return response


def test_batch_job_processes_rows_and_writes_manifest(batch_config_tmp):
    async def run_case():
        csv = "企业ID,企业名称\nE001,甲矿\nE002,乙矿\n".encode("utf-8")
        upload = UploadFile(filename="batch.csv", file=io.BytesIO(csv))
        service = DecisionBatchService(FakePredictionService())

        created = await service.create_job(upload, "chemical")
        assert created.total == 2

        for _ in range(30):
            status = service.get_status(created.job_id)
            if status.status in {"completed", "completed_with_errors"}:
                break
            await asyncio.sleep(0.05)

        status = service.get_status(created.job_id)
        assert status.status == "completed"
        assert status.completed == 2
        assert status.failed == 0
        assert status.manifest_path
        assert all(item.output_path for item in status.results)
        assert Path(batch_config_tmp / "var" / "decisions" / "batches" / created.job_id / "manifest.json").exists()

    asyncio.run(run_case())
