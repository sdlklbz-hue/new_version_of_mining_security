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


class SlowPredictionService:
    async def run_decision(self, request, *, source, job_id, row_index, **_kwargs):
        await asyncio.sleep(0.2)
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


def test_batch_job_cancel_stops_queued_rows(batch_config_tmp):
    async def run_case():
        rows = ["企业ID\n"] + [f"E{i:03d}\n" for i in range(8)]
        csv = "".join(rows).encode("utf-8")
        upload = UploadFile(filename="batch.csv", file=io.BytesIO(csv))
        service = DecisionBatchService(SlowPredictionService())

        created = await service.create_job(upload, "chemical")
        assert created.total == 8

        await asyncio.sleep(0.05)
        cancelled = service.cancel_job(created.job_id)
        assert cancelled.status in {"cancelled", "cancelling"}

        for _ in range(60):
            status = service.get_status(created.job_id)
            if status.status == "cancelled":
                break
            await asyncio.sleep(0.05)

        status = service.get_status(created.job_id)
        assert status.status == "cancelled"
        cancelled_rows = [item for item in status.results if item.status == "cancelled"]
        assert len(cancelled_rows) >= 1
        assert status.completed + status.failed + len(cancelled_rows) == status.total

        batch_dir = batch_config_tmp / "var" / "decisions" / "batches" / created.job_id
        decision_files = [p for p in batch_dir.glob("*.json") if p.name != "manifest.json"]
        assert len(decision_files) == status.completed

    asyncio.run(run_case())


def test_cancel_job_reports_cancelling_while_rows_inflight(batch_config_tmp):
    async def run_case():
        rows = ["企业ID\n"] + [f"E{i:03d}\n" for i in range(6)]
        csv = "".join(rows).encode("utf-8")
        upload = UploadFile(filename="batch.csv", file=io.BytesIO(csv))
        service = DecisionBatchService(SlowPredictionService())

        created = await service.create_job(upload, "chemical")
        await asyncio.sleep(0.05)
        status = service.cancel_job(created.job_id)
        assert status.status == "cancelling"
        assert status.running > 0
        running_rows = [item for item in status.results if item.status == "cancelling"]
        assert len(running_rows) >= 1
        polled = service.get_status(created.job_id)
        assert polled.status == "cancelling"

    asyncio.run(run_case())


def test_batch_cancel_discards_inflight_json(batch_config_tmp):
    async def run_case():
        rows = ["企业ID\n"] + [f"E{i:03d}\n" for i in range(4)]
        csv = "".join(rows).encode("utf-8")
        upload = UploadFile(filename="batch.csv", file=io.BytesIO(csv))
        service = DecisionBatchService(SlowPredictionService())

        created = await service.create_job(upload, "chemical")
        await asyncio.sleep(0.25)
        service.cancel_job(created.job_id)

        for _ in range(80):
            status = service.get_status(created.job_id)
            if status.status == "cancelled":
                break
            await asyncio.sleep(0.05)

        status = service.get_status(created.job_id)
        assert status.status == "cancelled"
        batch_dir = batch_config_tmp / "var" / "decisions" / "batches" / created.job_id
        decision_files = [p for p in batch_dir.glob("*.json") if p.name != "manifest.json"]
        completed_rows = [item for item in status.results if item.status == "completed"]
        assert len(decision_files) == len(completed_rows)
        for item in status.results:
            if item.status == "cancelled":
                assert not item.output_path

    asyncio.run(run_case())
