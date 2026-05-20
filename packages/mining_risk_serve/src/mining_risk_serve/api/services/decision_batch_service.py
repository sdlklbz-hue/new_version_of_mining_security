"""批量完整决策任务服务。"""

from __future__ import annotations

import asyncio
import io
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import HTTPException, UploadFile

from mining_risk_serve.api.schemas.prediction import (
    BatchDecisionResponse,
    BatchJobStatus,
    DecisionRequest,
    VALID_SCENARIO_IDS,
)
from mining_risk_serve.api.services.decision_store import DecisionStore, get_decision_settings
from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)

_JOBS: Dict[str, Dict[str, Any]] = {}


def _read_table(content: bytes, filename: str) -> pd.DataFrame:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        engine = "openpyxl" if suffix == ".xlsx" else "xlrd"
        return pd.read_excel(io.BytesIO(content), engine=engine)
    if suffix == ".csv":
        for encoding in ("utf-8-sig", "utf-8", "gb18030", "gbk", "gb2312", "latin-1"):
            try:
                return pd.read_csv(io.BytesIO(content), encoding=encoding)
            except UnicodeError:
                continue
        return pd.read_csv(io.BytesIO(content), encoding="utf-8", errors="replace")
    raise HTTPException(status_code=400, detail=f"不支持的文件格式: {suffix}")


def _row_to_data(row: pd.Series, columns: List[str]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    for col in columns:
        value = row.get(col)
        if pd.notna(value):
            data[str(col)] = value.item() if hasattr(value, "item") else value
    return data


def _enterprise_id(row_data: Dict[str, Any], row_index: int) -> str:
    for key in ("企业ID", "企业id", "enterprise_id", "主键ID", "主键id", "id"):
        value = row_data.get(key)
        if value not in (None, ""):
            return str(value)
    return f"ROW-{row_index + 1}"


def _snapshot(job: Dict[str, Any]) -> BatchJobStatus:
    return BatchJobStatus(
        job_id=job["job_id"],
        status=job["status"],
        total=job["total"],
        completed=job["completed"],
        failed=job["failed"],
        running=job["running"],
        output_dir=job["output_dir"],
        manifest_path=job.get("manifest_path"),
        results=job["results"],
        errors=job["errors"],
    )


class DecisionBatchService:
    """创建并跟踪批量完整决策任务。"""

    def __init__(self, prediction_service: Any) -> None:
        self.prediction_service = prediction_service

    async def create_job(
        self,
        file: UploadFile,
        scenario_id: Optional[str] = None,
    ) -> BatchDecisionResponse:
        scenario = scenario_id or "chemical"
        if scenario not in VALID_SCENARIO_IDS:
            raise HTTPException(status_code=400, detail="无效场景: %s" % scenario)

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="文件内容为空")
        df = _read_table(content, file.filename or "batch.csv")
        if df.empty:
            raise HTTPException(status_code=400, detail="文件内容为空或无法解析")

        settings = get_decision_settings()
        max_rows = int(settings["batch_max_rows"])
        if len(df) > max_rows:
            df = df.head(max_rows)

        job_id = uuid.uuid4().hex[:12]
        store = DecisionStore()
        batch_dir = store.batch_dir(job_id)
        rows = [_row_to_data(row, list(df.columns)) for _, row in df.iterrows()]
        job = {
            "job_id": job_id,
            "status": "queued",
            "total": len(rows),
            "completed": 0,
            "failed": 0,
            "running": 0,
            "output_dir": str(batch_dir),
            "manifest_path": None,
            "results": [
                {
                    "row_index": i,
                    "enterprise_id": _enterprise_id(row_data, i),
                    "status": "queued",
                    "risk_level": None,
                    "output_path": None,
                    "error": None,
                }
                for i, row_data in enumerate(rows)
            ],
            "errors": [],
            "created_at": time.time(),
            "finished_at": None,
        }
        _JOBS[job_id] = job
        asyncio.create_task(self._run_job(job_id, rows, scenario))
        return BatchDecisionResponse(
            success=True,
            message=f"批量完整决策任务已创建，共 {len(rows)} 条企业数据",
            job_id=job_id,
            total=len(rows),
            status_url=f"/api/v1/agent/decision/batch/{job_id}",
        )

    def get_status(self, job_id: str) -> BatchJobStatus:
        job = _JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        return _snapshot(job)

    def zip_path(self, job_id: str) -> Path:
        job = _JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        batch_dir = Path(job["output_dir"])
        zip_path = batch_dir.with_suffix(".zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in batch_dir.glob("*.json"):
                zf.write(path, arcname=path.name)
        return zip_path

    async def _run_job(self, job_id: str, rows: List[Dict[str, Any]], scenario_id: str) -> None:
        job = _JOBS[job_id]
        settings = get_decision_settings()
        semaphore = asyncio.Semaphore(int(settings["batch_max_concurrency"]))
        store = DecisionStore()
        job["status"] = "running"
        self._write_manifest(store, job)

        async def run_one(row_index: int, row_data: Dict[str, Any]) -> None:
            item = job["results"][row_index]
            async with semaphore:
                item["status"] = "running"
                job["running"] += 1
                self._write_manifest(store, job)
                enterprise_id = str(item["enterprise_id"])
                try:
                    request = DecisionRequest(
                        enterprise_id=enterprise_id,
                        scenario_id=scenario_id,
                        data={**row_data, "scenario_id": scenario_id},
                    )
                    response = await self.prediction_service.run_decision(
                        request,
                        source="batch",
                        job_id=job_id,
                        row_index=row_index,
                    )
                    item["status"] = "completed"
                    item["risk_level"] = response.predicted_level
                    item["output_path"] = response.output_display_path or response.output_path
                    job["completed"] += 1
                except Exception as exc:
                    logger.error("批量完整决策单行失败 job=%s row=%s: %s", job_id, row_index, exc)
                    item["status"] = "failed"
                    item["error"] = str(exc)
                    job["failed"] += 1
                    job["errors"].append({"row_index": row_index, "enterprise_id": enterprise_id, "error": str(exc)})
                finally:
                    job["running"] -= 1
                    self._write_manifest(store, job)

        await asyncio.gather(*(run_one(i, row_data) for i, row_data in enumerate(rows)))
        job["status"] = "completed" if job["failed"] == 0 else "completed_with_errors"
        job["finished_at"] = time.time()
        self._write_manifest(store, job)

    def _write_manifest(self, store: DecisionStore, job: Dict[str, Any]) -> None:
        manifest = _snapshot(job).model_dump()
        output = store.save_manifest(job["job_id"], manifest)
        job["manifest_path"] = output["display_path"]


def get_batch_service(prediction_service: Any) -> DecisionBatchService:
    return DecisionBatchService(prediction_service)
