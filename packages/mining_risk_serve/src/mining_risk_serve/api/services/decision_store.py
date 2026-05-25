"""完整决策结果持久化与运行时设置。"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from mining_risk_common.utils.config import get_config, resolve_project_path
from mining_risk_common.utils.logger import get_logger
from mining_risk_serve.api.schemas.prediction import DecisionRequest, DecisionResponse

logger = get_logger(__name__)

SETTINGS_FILE = "settings/decision.json"


def _sanitize_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _sanitize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_value(v) for v in value]
    if hasattr(value, "model_dump"):
        return _sanitize_value(value.model_dump())
    return str(value)


def _settings_path() -> Path:
    config = get_config()
    return resolve_project_path(Path(config.paths.var_root) / SETTINGS_FILE)


def _load_runtime_settings() -> Dict[str, Any]:
    path = _settings_path()
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning("决策运行时设置读取失败: %s", exc)
        return {}


def _write_runtime_settings(settings: Dict[str, Any]) -> None:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(_sanitize_value(settings), f, ensure_ascii=False, indent=2)


def _safe_filename(value: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", value).strip("._")
    return safe or "unknown"


def _relative_display(path: Path) -> str:
    try:
        return str(path.relative_to(resolve_project_path(".")))
    except ValueError:
        return str(path)


def _ensure_under_var(path: Path) -> None:
    var_root = resolve_project_path(get_config().paths.var_root)
    try:
        path.relative_to(var_root)
    except ValueError as exc:
        raise ValueError(f"决策输出目录必须位于运行时目录 {var_root} 下") from exc


def resolve_output_dir(output_dir: Optional[str] = None) -> Path:
    """解析并校验完整决策输出目录。"""

    config = get_config()
    runtime = _load_runtime_settings()
    raw = output_dir or runtime.get("output_dir") or config.decision.output_dir
    path = resolve_project_path(raw)
    _ensure_under_var(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_decision_settings() -> Dict[str, Any]:
    """返回合并后的决策输出运行时设置。"""

    config = get_config()
    runtime = _load_runtime_settings()
    output_dir = str(runtime.get("output_dir") or config.decision.output_dir)
    persist_enabled = bool(runtime.get("persist_enabled", config.decision.persist_enabled))
    batch_max_concurrency = int(runtime.get("batch_max_concurrency", config.decision.batch_max_concurrency))
    batch_max_rows = int(runtime.get("batch_max_rows", config.decision.batch_max_rows))
    resolved = resolve_output_dir(output_dir)
    return {
        "output_dir": output_dir,
        "resolved_path": str(resolved),
        "persist_enabled": persist_enabled,
        "batch_max_concurrency": max(1, batch_max_concurrency),
        "batch_max_rows": max(1, batch_max_rows),
    }


def update_decision_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """更新运行时决策输出设置。"""

    current = get_decision_settings()
    allowed = {"output_dir", "persist_enabled", "batch_max_concurrency", "batch_max_rows"}
    next_settings = {k: current[k] for k in allowed}
    for key, value in updates.items():
        if key in allowed and value is not None:
            next_settings[key] = value

    next_settings["batch_max_concurrency"] = max(1, int(next_settings["batch_max_concurrency"]))
    next_settings["batch_max_rows"] = max(1, int(next_settings["batch_max_rows"]))
    next_settings["persist_enabled"] = bool(next_settings["persist_enabled"])
    resolve_output_dir(str(next_settings["output_dir"]))
    _write_runtime_settings(next_settings)
    return get_decision_settings()


class DecisionStore:
    """将完整决策结果写入服务端可配置目录。"""

    def __init__(self, output_dir: Optional[str] = None) -> None:
        self.output_dir = resolve_output_dir(output_dir)

    def batch_dir(self, job_id: str) -> Path:
        path = self.output_dir / "batches" / _safe_filename(job_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_decision(
        self,
        *,
        request: DecisionRequest,
        response: DecisionResponse,
        final_state: Optional[Dict[str, Any]] = None,
        source: str = "single",
        job_id: Optional[str] = None,
        row_index: Optional[int] = None,
    ) -> Dict[str, str]:
        target_dir = self.batch_dir(job_id) if job_id else self.output_dir
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        enterprise = _safe_filename(request.enterprise_id)
        scenario = _safe_filename(response.scenario_id or request.scenario_id or "unknown")
        prefix = f"{row_index:04d}_" if row_index is not None else ""
        path = target_dir / f"{prefix}{enterprise}_{scenario}_{timestamp}.json"
        display_path = _relative_display(path)
        response.output_path = str(path)
        response.output_display_path = display_path

        record = {
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "source": source,
            "job_id": job_id,
            "row_index": row_index,
            "mock": bool(response.mock),
            "request": {
                "enterprise_id": request.enterprise_id,
                "scenario_id": request.scenario_id,
                "data": request.data,
            },
            "response": response.model_dump(),
            "memory_results": (final_state or {}).get("memory_results"),
            "final_state_summary": {
                "features_present": (final_state or {}).get("features") is not None,
                "retry_count": (final_state or {}).get("retry_count"),
                "error": (final_state or {}).get("error"),
            },
        }
        with path.open("w", encoding="utf-8") as f:
            json.dump(_sanitize_value(record), f, ensure_ascii=False, indent=2)
        logger.info("完整决策结果已输出: %s", path)
        return {"path": str(path), "display_path": display_path}

    def save_predict_only(
        self,
        *,
        enterprise_id: str,
        scenario_id: str,
        data: Dict[str, Any],
        predicted_level: str,
        probability_distribution: Dict[str, float],
        shap_contributions: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        row_index: Optional[int] = None,
    ) -> Dict[str, str]:
        """仅保存 Stacking 模型预测结果（不经过 GLM 决策节点）。"""
        request = DecisionRequest(
            enterprise_id=enterprise_id,
            scenario_id=scenario_id,
            data=data,
        )
        response = DecisionResponse(
            enterprise_id=enterprise_id,
            scenario_id=scenario_id,
            final_status="PREDICT_ONLY",
            predicted_level=predicted_level,
            probability_distribution=probability_distribution,
            shap_contributions=shap_contributions,
            mock=False,
        )
        return self.save_decision(
            request=request,
            response=response,
            source="map_predict_only",
            job_id=job_id,
            row_index=row_index,
        )

    def save_manifest(self, job_id: str, manifest: Dict[str, Any]) -> Dict[str, str]:
        path = self.batch_dir(job_id) / "manifest.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(_sanitize_value(manifest), f, ensure_ascii=False, indent=2)
        return {"path": str(path), "display_path": _relative_display(path)}

    def list_records(self, limit: int = 50) -> Iterable[Dict[str, Any]]:
        records = sorted(self.output_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for path in records[: max(1, limit)]:
            yield {
                "filename": path.name,
                "path": str(path),
                "display_path": _relative_display(path),
                "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(path.stat().st_mtime)),
                "bytes": path.stat().st_size,
            }

    def _iter_decision_files(self) -> Iterable[Path]:
        """递归扫描输出目录下所有决策 JSON（排除 manifest）。"""
        for path in self.output_dir.rglob("*.json"):
            if path.name == "manifest.json":
                continue
            if path.is_file():
                yield path

    @staticmethod
    def record_id_from_path(path: Path, base: Path) -> str:
        rel = path.relative_to(base)
        return rel.as_posix()

    def resolve_record_path(self, record_id: str) -> Path:
        """将 URL 中的 record_id 解析为安全路径。"""
        safe_id = record_id.replace("..", "").lstrip("/")
        path = (self.output_dir / safe_id).resolve()
        _ensure_under_var(path)
        try:
            path.relative_to(self.output_dir.resolve())
        except ValueError as exc:
            raise ValueError("无效的记录路径") from exc
        if not path.is_file() or path.name == "manifest.json":
            raise FileNotFoundError(f"决策记录不存在: {record_id}")
        return path

    @staticmethod
    def _enterprise_name_from_record(record: Dict[str, Any]) -> str:
        req = record.get("request") or {}
        data = req.get("data") or {}
        for key in ("企业名称", "enterprise_name", "单位名称", "公司名称"):
            val = data.get(key)
            if val not in (None, ""):
                return str(val)
        return str(req.get("enterprise_id") or record.get("response", {}).get("enterprise_id", ""))

    @staticmethod
    def _approval_status_from_record(record: Dict[str, Any]) -> Optional[str]:
        approval = record.get("approval")
        if isinstance(approval, dict) and approval.get("status"):
            return str(approval["status"])
        resp = record.get("response") or {}
        if resp.get("review_status"):
            return "approved" if resp["review_status"] == "APPROVED" else "rejected"
        return None

    def summarize_file(self, path: Path) -> Dict[str, Any]:
        """读取决策文件并生成列表摘要。"""
        with path.open("r", encoding="utf-8") as f:
            record = json.load(f)
        resp = record.get("response") or {}
        req = record.get("request") or {}
        rel = self.record_id_from_path(path, self.output_dir)
        job_id = record.get("job_id")
        if not job_id and "batches/" in rel:
            parts = rel.split("/")
            if len(parts) >= 2 and parts[0] == "batches":
                job_id = parts[1]
        return {
            "record_id": rel,
            "enterprise_id": resp.get("enterprise_id") or req.get("enterprise_id", ""),
            "enterprise_name": self._enterprise_name_from_record(record),
            "scenario_id": resp.get("scenario_id") or req.get("scenario_id", ""),
            "predicted_level": resp.get("predicted_level", ""),
            "final_status": resp.get("final_status", ""),
            "review_status": resp.get("review_status"),
            "mock": bool(record.get("mock")),
            "source": record.get("source", ""),
            "job_id": job_id,
            "created_at": record.get("created_at") or time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(path.stat().st_mtime)
            ),
            "display_path": _relative_display(path),
            "path": str(path.resolve()),
            "approval_status": self._approval_status_from_record(record),
            "bytes": path.stat().st_size,
        }

    def list_all_summaries(
        self,
        *,
        enterprise_id: Optional[str] = None,
        final_status: Optional[str] = None,
        source: Optional[str] = None,
        job_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for path in self._iter_decision_files():
            try:
                summary = self.summarize_file(path)
            except Exception as exc:
                logger.warning("跳过无法解析的决策文件 %s: %s", path, exc)
                continue
            if enterprise_id and summary.get("enterprise_id") != enterprise_id:
                continue
            if final_status and summary.get("final_status") != final_status:
                continue
            if source and summary.get("source") != source:
                continue
            if job_id and summary.get("job_id") != job_id:
                continue
            items.append(summary)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items

    def load_record(self, record_id: str) -> Dict[str, Any]:
        path = self.resolve_record_path(record_id)
        with path.open("r", encoding="utf-8") as f:
            record = json.load(f)
        record["record_id"] = self.record_id_from_path(path, self.output_dir)
        record["display_path"] = _relative_display(path)
        return record
