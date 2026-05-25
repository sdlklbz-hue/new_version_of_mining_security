from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from mining_risk_serve.api.main import create_app
from mining_risk_serve.api.routers import visualization
from mining_risk_serve.api.schemas.prediction import BatchDecisionResponse
from mining_risk_serve.api.services.decision_store import DecisionStore


def test_enterprise_map_markers_returns_valid_coordinates():
    client = TestClient(create_app())

    resp = client.get("/api/v1/visualization/enterprise-map/markers")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["meta"]["total_enterprises"] >= body["meta"]["with_coordinates"] > 0
    assert body["meta"]["returned"] == len(body["markers"])

    first = body["markers"][0]
    assert first["folder"]
    assert first["name"]
    assert 3 <= first["lat"] <= 54
    assert 73 <= first["lng"] <= 135


def test_enterprise_map_markers_filters_keyword_and_tracked():
    client = TestClient(create_app())

    base = client.get("/api/v1/visualization/enterprise-map/markers", params={"keyword": "苏州"})
    assert base.status_code == 200
    assert all("苏州" in marker["name"] for marker in base.json()["markers"])

    tracked = client.get(
        "/api/v1/visualization/enterprise-map/markers",
        params={"tracked_only": "true"},
    )
    assert tracked.status_code == 200
    assert all(marker["tracked"] for marker in tracked.json()["markers"])


def test_enterprise_decision_payload_flattens_real_enterprise_folder():
    client = TestClient(create_app())
    folder = "上海戊望实业有限公司"

    resp = client.get(
        f"/api/v1/visualization/enterprise-db/decision-payload/{folder}",
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["folder"] == folder
    assert body["name"] == folder
    assert body["enterprise_id"]
    payload = body["payload"]
    assert payload.get("企业名称") == folder
    assert payload.get("enterprise_id")
    assert len(payload) >= 3


def test_enterprise_map_markers_links_prediction_by_enterprise_id(monkeypatch):
    """决策记录按信用代码保存时，地图应能通过 enterprise_id 关联到企业点位。"""
    credit_code = "913205007938006482"
    monkeypatch.setattr(
        visualization,
        "_build_latest_predictions_index",
        lambda: {
            credit_code: {
                "predicted_level": "红",
                "probability": 0.91,
                "tracked": True,
                "last_predicted_at": "2026-05-25T16:00:44",
                "scenario_id": "chemical",
            }
        },
    )
    visualization.invalidate_enterprise_map_cache()

    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/enterprise-map/markers",
        params={"keyword": "汉丰"},
    )
    assert resp.status_code == 200
    markers = resp.json()["markers"]
    assert markers
    hanfeng = markers[0]
    assert hanfeng["name"] == "苏州汉丰新材料股份有限公司"
    assert hanfeng["predicted_level"] == "红"
    assert hanfeng["tracked"] is True


def test_build_latest_predictions_index_uses_enterprise_id(monkeypatch):
    from mining_risk_common.utils.config import resolve_project_path

    out_dir = resolve_project_path("var/decisions/_pytest_map_index")
    out_dir.mkdir(parents=True, exist_ok=True)
    store = DecisionStore(output_dir=str(out_dir))
    record_path = store.output_dir / "demo_ent_chemical_20260101_120000.json"
    record_path.write_text(
        """
        {
          "created_at": "2026-05-25T16:00:44",
          "request": {
            "enterprise_id": "913205007938006482",
            "scenario_id": "chemical",
            "data": {"企业名称": "宏达危化品储运有限公司"}
          },
          "response": {
            "enterprise_id": "913205007938006482",
            "predicted_level": "红",
            "scenario_id": "chemical",
            "probability_distribution": {"红": 0.9}
          }
        }
        """.strip(),
        encoding="utf-8",
    )
    monkeypatch.setattr(visualization, "DecisionStore", lambda: store)

    index = visualization._build_latest_predictions_index()
    assert index["913205007938006482"]["predicted_level"] == "红"
    assert index["宏达危化品储运有限公司"]["predicted_level"] == "红"


def test_enterprise_map_batch_predict_creates_job(monkeypatch):
    client = TestClient(create_app())
    mock_service = MagicMock()
    mock_batch = MagicMock()
    mock_batch.create_map_predict_job = AsyncMock(
        return_value=BatchDecisionResponse(
            success=True,
            message="批量模型预测任务已创建（不调用 GLM），共 1 家企业",
            job_id="testjob001",
            total=1,
            status_url="/api/v1/agent/decision/batch/testjob001",
        )
    )

    monkeypatch.setattr(
        "mining_risk_serve.api.routers.visualization.get_prediction_service",
        lambda: mock_service,
    )
    monkeypatch.setattr(
        "mining_risk_serve.api.routers.visualization.get_batch_service",
        lambda _svc: mock_batch,
    )
    monkeypatch.setattr(
        "mining_risk_serve.api.routers.visualization._build_enterprise_batch_rows",
        lambda folders: [
            {
                "folder": folders[0],
                "name": "苏州汉丰新材料股份有限公司",
                "enterprise_id": "913205007938006482",
                "data": {"企业名称": "苏州汉丰新材料股份有限公司", "enterprise_id": "913205007938006482"},
            }
        ],
    )

    resp = client.post(
        "/api/v1/visualization/enterprise-map/batch-predict",
        json={
            "folders": ["苏州汉丰新材料股份有限公司"],
            "scenario_id": "chemical",
        },
        headers={"X-Admin-Token": "test-admin"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["job_id"] == "testjob001"
    mock_batch.create_map_predict_job.assert_awaited_once()


def test_enterprise_map_coordinate_extraction_rejects_invalid_values():
    detail = {
        "详细数据": {
            "企业生产经营地址": [{"经度": 0, "纬度": 0}],
            "企业目录": [{"经度": 120.5, "纬度": 31.2}],
        }
    }

    assert visualization._extract_lat_lng(detail) == (31.2, 120.5)

    invalid = {"详细数据": {"企业生产经营地址": [{"经度": 240, "纬度": -10}]}}
    assert visualization._extract_lat_lng(invalid) is None
