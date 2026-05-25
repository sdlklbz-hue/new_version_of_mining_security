from fastapi.testclient import TestClient

from mining_risk_serve.api.main import create_app
from mining_risk_serve.api.routers import visualization


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
