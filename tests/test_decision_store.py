from pathlib import Path

import pytest

from mining_risk_common.utils.config import get_config
from mining_risk_serve.api.schemas.prediction import DecisionRequest, DecisionResponse
from mining_risk_serve.api.services.decision_store import DecisionStore, resolve_output_dir, update_decision_settings


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


def _response() -> DecisionResponse:
    return DecisionResponse(
        enterprise_id="ENT-1",
        scenario_id="chemical",
        final_status="APPROVE",
        predicted_level="红",
        probability_distribution={"红": 0.9},
        shap_contributions=[],
    )


def test_decision_store_writes_json_under_var(decision_config_tmp):
    request = DecisionRequest(enterprise_id="ENT-1", scenario_id="chemical", data={"企业名称": "测试企业"})
    output = DecisionStore().save_decision(
        request=request,
        response=_response(),
        final_state={"memory_results": [{"text": "case"}]},
    )

    path = Path(output["path"])
    assert path.exists()
    assert path.is_file()
    assert "var" in path.parts


def test_decision_output_rejects_path_outside_var(decision_config_tmp):
    with pytest.raises(ValueError):
        resolve_output_dir(str(decision_config_tmp / "outside"))


def test_runtime_settings_update_validates_and_persists(decision_config_tmp):
    settings = update_decision_settings({
        "output_dir": str(decision_config_tmp / "var" / "custom_decisions"),
        "persist_enabled": False,
        "batch_max_concurrency": 2,
        "batch_max_rows": 12,
    })

    assert settings["persist_enabled"] is False
    assert settings["batch_max_concurrency"] == 2
    assert settings["batch_max_rows"] == 12
    assert Path(settings["resolved_path"]).name == "custom_decisions"
