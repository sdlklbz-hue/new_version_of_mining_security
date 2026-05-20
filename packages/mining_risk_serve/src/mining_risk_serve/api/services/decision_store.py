"""完整决策结果持久化与运行时设置。"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

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
