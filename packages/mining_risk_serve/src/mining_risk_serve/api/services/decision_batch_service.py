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
    PredictRequest,
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


def _discard_output_file(output_path: Optional[str]) -> None:
    if not output_path:
        return
    try:
        path = Path(output_path)
        if path.is_file():
            path.unlink()
    except OSError as exc:
        logger.warning("删除已终止任务的决策输出失败 path=%s: %s", output_path, exc)


def _mark_queued_cancelled(job: Dict[str, Any]) -> None:
    for item in job["results"]:
        if item["status"] == "queued":
            item["status"] = "cancelled"


def _mark_inflight_cancelling(job: Dict[str, Any]) -> None:
    for item in job["results"]:
        if item["status"] == "running":
            item["status"] = "cancelling"


def _refresh_job_status(job: Dict[str, Any]) -> None:
    if job.get("cancelled"):
        _mark_queued_cancelled(job)
        if job["running"] > 0:
            _mark_inflight_cancelling(job)
        job["status"] = "cancelled" if job["running"] == 0 else "cancelling"
        return
    if job["status"] in {"completed", "completed_with_errors", "cancelled", "cancelling"}:
        return
    if job["completed"] + job["failed"] >= job["total"] and job["running"] == 0:
        job["status"] = "completed" if job["failed"] == 0 else "completed_with_errors"
    elif job["running"] > 0 or job["completed"] + job["failed"] > 0:
        job["status"] = "running"


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

    def _start_job(
        self,
        rows: List[Dict[str, Any]],
        scenario_id: str,
        *,
        source: str = "batch",
    ) -> BatchDecisionResponse:
        if not rows:
            raise HTTPException(status_code=400, detail="没有可预测的企业数据")

        settings = get_decision_settings()
        max_rows = int(settings["batch_max_rows"])
        if len(rows) > max_rows:
            rows = rows[:max_rows]

        job_id = uuid.uuid4().hex[:12]
        store = DecisionStore()
        batch_dir = store.batch_dir(job_id)
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
                    "enterprise_id": str(
                        row.get("display_name")
                        or row.get("企业名称")
                        or row.get("enterprise_id")
                        or _enterprise_id(row, i)
                    ),
                    "status": "queued",
                    "risk_level": None,
                    "output_path": None,
                    "error": None,
                }
                for i, row in enumerate(rows)
            ],
            "errors": [],
            "created_at": time.time(),
            "finished_at": None,
            "cancelled": False,
        }
        _JOBS[job_id] = job
        if source != "map_predict_only":
            asyncio.create_task(self._run_job(job_id, rows, scenario_id, source=source))
        return BatchDecisionResponse(
            success=True,
            message=f"批量完整决策任务已创建，共 {len(rows)} 条企业数据",
            job_id=job_id,
            total=len(rows),
            status_url=f"/api/v1/agent/decision/batch/{job_id}",
        )

    async def create_job_from_enterprise_rows(
        self,
        rows: List[Dict[str, Any]],
        scenario_id: Optional[str] = None,
    ) -> BatchDecisionResponse:
        """从企业库扁平化记录创建批量决策任务（每项需含 enterprise_id 与 data）。"""
        scenario = scenario_id or "chemical"
        if scenario not in VALID_SCENARIO_IDS:
            raise HTTPException(status_code=400, detail="无效场景: %s" % scenario)
        payload_rows: List[Dict[str, Any]] = []
        for row in rows:
            data = row.get("data")
            if not isinstance(data, dict) or not data:
                continue
            ent_id = str(row.get("enterprise_id") or "").strip()
            if not ent_id:
                continue
            name = str(row.get("name") or data.get("企业名称") or ent_id).strip()
            payload_rows.append(
                {
                    "enterprise_id": ent_id,
                    "display_name": name,
                    **{**data, "企业名称": name},
                }
            )
        if not payload_rows:
            raise HTTPException(status_code=400, detail="企业库记录无法生成有效预测载荷")
        return self._start_job(payload_rows, scenario, source="enterprise_map_batch")

    async def create_map_predict_job(
        self,
        rows: List[Dict[str, Any]],
        scenario_id: Optional[str] = None,
    ) -> BatchDecisionResponse:
        """企业地图批量：仅 Stacking 模型预测，不调用 GLM。"""
        scenario = scenario_id or "chemical"
        if scenario not in VALID_SCENARIO_IDS:
            raise HTTPException(status_code=400, detail="无效场景: %s" % scenario)

        payload_rows: List[Dict[str, Any]] = []
        for row in rows:
            data = row.get("data")
            if not isinstance(data, dict) or not data:
                continue
            ent_id = str(row.get("enterprise_id") or "").strip()
            if not ent_id:
                continue
            name = str(row.get("name") or data.get("企业名称") or ent_id).strip()
            payload_rows.append(
                {
                    "enterprise_id": ent_id,
                    "display_name": name,
                    **{**data, "企业名称": name, "scenario_id": scenario},
                }
            )
        if not payload_rows:
            raise HTTPException(status_code=400, detail="企业库记录无法生成有效预测载荷")

        resp = self._start_job(payload_rows, scenario, source="map_predict_only")
        resp.message = f"批量模型预测任务已创建（不调用 GLM），共 {resp.total} 家企业"
        job_id = resp.job_id
        _JOBS[job_id]["predict_only"] = True
        asyncio.create_task(self._run_map_predict_job(job_id, payload_rows, scenario))
        return resp

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

        rows = [_row_to_data(row, list(df.columns)) for _, row in df.iterrows()]
        return self._start_job(rows, scenario, source="batch")

    def get_status(self, job_id: str) -> BatchJobStatus:
        job = _JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        _refresh_job_status(job)
        return _snapshot(job)

    def cancel_job(self, job_id: str) -> BatchJobStatus:
        """请求终止批量任务：不再处理新的排队行。"""
        job = _JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="批量任务不存在")
        if job["status"] in {"completed", "completed_with_errors", "cancelled"}:
            return _snapshot(job)
        job["cancelled"] = True
        _refresh_job_status(job)
        if job["status"] == "cancelled":
            job["finished_at"] = time.time()
        store = DecisionStore()
        self._write_manifest(store, job)
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

    async def _run_map_predict_job(
        self,
        job_id: str,
        rows: List[Dict[str, Any]],
        scenario_id: str,
    ) -> None:
        """批量仅模型预测：Stacking + 规则校验，无 GLM / MARCH 回环。"""
        job = _JOBS[job_id]
        settings = get_decision_settings()
        persist = bool(settings.get("persist_enabled", True))
        semaphore = asyncio.Semaphore(int(settings["batch_max_concurrency"]))
        store = DecisionStore()
        job["status"] = "running"
        self._write_manifest(store, job)

        async def run_one(row_index: int, row_data: Dict[str, Any]) -> None:
            item = job["results"][row_index]
            if job.get("cancelled"):
                _refresh_job_status(job)
                self._write_manifest(store, job)
                return
            async with semaphore:
                if job.get("cancelled"):
                    _refresh_job_status(job)
                    self._write_manifest(store, job)
                    return
                item["status"] = "running"
                job["running"] += 1
                _refresh_job_status(job)
                self._write_manifest(store, job)
                enterprise_id = str(row_data.get("enterprise_id") or item["enterprise_id"])
                display_name = str(
                    row_data.get("display_name")
                    or row_data.get("企业名称")
                    or enterprise_id
                )
                payload = {
                    k: v
                    for k, v in row_data.items()
                    if k not in ("enterprise_id", "display_name")
                }
                try:
                    predict_resp = await asyncio.to_thread(
                        self.prediction_service.predict,
                        PredictRequest(enterprise_id=enterprise_id, data=payload),
                    )
                    output = None
                    if persist:
                        output = store.save_predict_only(
                            enterprise_id=enterprise_id,
                            scenario_id=scenario_id,
                            data=payload,
                            predicted_level=predict_resp.predicted_level,
                            probability_distribution=predict_resp.probability_distribution,
                            shap_contributions=predict_resp.shap_contributions,
                            job_id=job_id,
                            row_index=row_index,
                        )
                    item["enterprise_id"] = display_name
                    if job.get("cancelled"):
                        _discard_output_file(
                            (output or {}).get("path") or (output or {}).get("display_path")
                        )
                        item["status"] = "cancelled"
                        item["risk_level"] = None
                        item["output_path"] = None
                    else:
                        item["status"] = "completed"
                        item["risk_level"] = predict_resp.predicted_level
                        item["output_path"] = (
                            (output or {}).get("display_path") if output else None
                        )
                        job["completed"] += 1
                except Exception as exc:
                    logger.error(
                        "批量模型预测单行失败 job=%s row=%s: %s",
                        job_id,
                        row_index,
                        exc,
                    )
                    item["status"] = "failed"
                    item["error"] = str(exc)
                    job["failed"] += 1
                    job["errors"].append(
                        {
                            "row_index": row_index,
                            "enterprise_id": display_name,
                            "error": str(exc),
                        }
                    )
                finally:
                    job["running"] -= 1
                    _refresh_job_status(job)
                    self._write_manifest(store, job)

        await asyncio.gather(*(run_one(i, row_data) for i, row_data in enumerate(rows)))
        if job.get("cancelled"):
            for item in job["results"]:
                if item["status"] in {"queued", "running"}:
                    _discard_output_file(item.get("output_path"))
                    item["status"] = "cancelled"
                    item["output_path"] = None
                    item["risk_level"] = None
            job["status"] = "cancelled"
        else:
            job["status"] = "completed" if job["failed"] == 0 else "completed_with_errors"
        job["finished_at"] = time.time()
        self._write_manifest(store, job)
        try:
            from mining_risk_serve.api.routers.visualization import invalidate_enterprise_map_cache

            invalidate_enterprise_map_cache()
        except Exception as cache_err:
            logger.debug("企业地图缓存失效跳过: %s", cache_err)

    async def _run_job(
        self,
        job_id: str,
        rows: List[Dict[str, Any]],
        scenario_id: str,
        *,
        source: str = "batch",
    ) -> None:
        job = _JOBS[job_id]
        settings = get_decision_settings()
        semaphore = asyncio.Semaphore(int(settings["batch_max_concurrency"]))
        store = DecisionStore()
        job["status"] = "running"
        self._write_manifest(store, job)

        async def run_one(row_index: int, row_data: Dict[str, Any]) -> None:
            item = job["results"][row_index]
            if job.get("cancelled"):
                _refresh_job_status(job)
                self._write_manifest(store, job)
                return
            async with semaphore:
                if job.get("cancelled"):
                    _refresh_job_status(job)
                    self._write_manifest(store, job)
                    return
                item["status"] = "running"
                job["running"] += 1
                _refresh_job_status(job)
                self._write_manifest(store, job)
                enterprise_id = str(
                    row_data.get("enterprise_id")
                    or row_data.get("企业ID")
                    or item["enterprise_id"]
                )
                try:
                    payload = {k: v for k, v in row_data.items() if k != "enterprise_id"}
                    request = DecisionRequest(
                        enterprise_id=enterprise_id,
                        scenario_id=scenario_id,
                        data={**payload, "scenario_id": scenario_id},
                    )
                    response = await self.prediction_service.run_decision(
                        request,
                        source=source,
                        job_id=job_id,
                        row_index=row_index,
                    )
                    item["enterprise_id"] = (
                        str(payload.get("企业名称") or "").strip() or enterprise_id
                    )
                    if job.get("cancelled"):
                        _discard_output_file(response.output_path)
                        item["status"] = "cancelled"
                        item["risk_level"] = None
                        item["output_path"] = None
                    else:
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
                    _refresh_job_status(job)
                    self._write_manifest(store, job)

        await asyncio.gather(*(run_one(i, row_data) for i, row_data in enumerate(rows)))
        if job.get("cancelled"):
            for item in job["results"]:
                if item["status"] in {"queued", "running"}:
                    _discard_output_file(item.get("output_path"))
                    item["status"] = "cancelled"
                    item["output_path"] = None
                    item["risk_level"] = None
            job["status"] = "cancelled"
        else:
            job["status"] = "completed" if job["failed"] == 0 else "completed_with_errors"
        job["finished_at"] = time.time()
        self._write_manifest(store, job)

    def _write_manifest(self, store: DecisionStore, job: Dict[str, Any]) -> None:
        _refresh_job_status(job)
        manifest = _snapshot(job).model_dump()
        output = store.save_manifest(job["job_id"], manifest)
        job["manifest_path"] = output["display_path"]


def get_batch_service(prediction_service: Any) -> DecisionBatchService:
    return DecisionBatchService(prediction_service)
