import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mining_risk_serve.api.main import create_app
from mining_risk_serve.api.services import amap_poi
from mining_risk_serve.api.services.amap_poi import (
    AmapFetchResult,
    PoiBounds,
    filter_facilities_by_bounds,
    is_amap_rate_limit_response,
    load_static_facilities,
    should_exclude_emergency_poi,
)


@pytest.fixture
def static_fixture(tmp_path: Path, monkeypatch) -> Path:
    payload = {
        "version": 1,
        "region": "test",
        "source": "test",
        "facilities": [
            {
                "id": "hosp-1",
                "name": "测试综合医院",
                "type": "hospital",
                "type_label": "医院",
                "lat": 31.298886,
                "lng": 120.585316,
                "address": "医院路 1 号",
            },
            {
                "id": "park-1",
                "name": "中央公园",
                "type": "hospital",
                "type_label": "医院",
                "lat": 31.2995,
                "lng": 120.586,
                "address": "公园路",
            },
            {
                "id": "fire-1",
                "name": "测试消防站",
                "type": "fire_station",
                "type_label": "消防站/局",
                "lat": 31.31,
                "lng": 120.59,
                "address": "消防路",
            },
            {
                "id": "far-hosp",
                "name": "远处医院",
                "type": "hospital",
                "type_label": "医院",
                "lat": 32.0,
                "lng": 121.5,
                "address": "范围外",
            },
        ],
    }
    path = tmp_path / "emergency_facilities_test.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("EMERGENCY_FACILITIES_DATA_PATH", str(path))
    amap_poi._STATIC_CACHE.clear()
    amap_poi._FILTER_CACHE.clear()
    return path


def test_emergency_facilities_returns_static_filtered(static_fixture):
    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/emergency-facilities",
        params={
            "min_lat": 31.29,
            "min_lng": 120.58,
            "max_lat": 31.31,
            "max_lng": 120.59,
            "types": "hospital",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["meta"]["source"] == "static"
    assert body["meta"]["cached"] is False
    names = {item["name"] for item in body["facilities"]}
    assert "测试综合医院" in names
    assert "远处医院" not in names
    assert "测试消防站" not in names


def test_emergency_facilities_static_no_live_amap(monkeypatch, static_fixture):
    """运行时不再调用高德 HTTP。"""
    called = {"value": False}

    def fake_get(*args, **kwargs):
        called["value"] = True
        raise AssertionError("不应发起高德请求")

    monkeypatch.setattr(amap_poi.requests, "get", fake_get)
    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/emergency-facilities",
        params={
            "min_lat": 31.29,
            "min_lng": 120.58,
            "max_lat": 31.31,
            "max_lng": 120.59,
            "types": "hospital,fire_station",
        },
    )
    assert resp.status_code == 200
    assert called["value"] is False
    assert resp.json()["meta"]["source"] == "static"


def test_emergency_facilities_empty_when_no_static_file(monkeypatch, tmp_path: Path):
    missing = tmp_path / "missing.json"
    monkeypatch.setenv("EMERGENCY_FACILITIES_DATA_PATH", str(missing))
    monkeypatch.setenv("MRA_ENABLE_MOCK_FALLBACK", "true")
    amap_poi._STATIC_CACHE.clear()
    amap_poi._FILTER_CACHE.clear()

    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/emergency-facilities",
        params={
            "min_lat": 31.25,
            "min_lng": 120.54,
            "max_lat": 31.34,
            "max_lng": 120.63,
            "types": "hospital,fire_station",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["source"] == "empty"
    assert body["meta"]["hint"]
    assert body["facilities"] == []


def test_emergency_facilities_empty_static_dataset(monkeypatch, tmp_path: Path):
    payload = {
        "version": 1,
        "region": "test",
        "source": "empty",
        "facilities": [],
    }
    path = tmp_path / "emergency_facilities_empty.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("EMERGENCY_FACILITIES_DATA_PATH", str(path))
    amap_poi._STATIC_CACHE.clear()
    amap_poi._FILTER_CACHE.clear()

    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/emergency-facilities",
        params={
            "min_lat": 31.29,
            "min_lng": 120.58,
            "max_lat": 31.31,
            "max_lng": 120.59,
            "types": "hospital",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["source"] == "static"
    assert body["facilities"] == []


def test_emergency_facilities_rejects_when_no_static_and_mock_disabled(monkeypatch, tmp_path: Path):
    missing = tmp_path / "missing.json"
    monkeypatch.setenv("EMERGENCY_FACILITIES_DATA_PATH", str(missing))
    monkeypatch.setenv("MRA_ENABLE_MOCK_FALLBACK", "false")
    amap_poi._STATIC_CACHE.clear()
    amap_poi._FILTER_CACHE.clear()

    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/visualization/emergency-facilities",
        params={
            "min_lat": 31.29,
            "min_lng": 120.58,
            "max_lat": 31.31,
            "max_lng": 120.59,
            "types": "hospital",
        },
    )

    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["code"] == "MISSING_STATIC_DATASET"


def test_load_static_facilities_and_filter(static_fixture):
    facilities, meta = load_static_facilities(static_fixture)
    assert meta["exists"] is True
    assert len(facilities) == 4

    bounds = PoiBounds(min_lat=31.29, min_lng=120.58, max_lat=31.31, max_lng=120.59)
    filtered = filter_facilities_by_bounds(facilities, bounds, ["hospital"])
    assert len(filtered) == 2
    assert all(item["type"] == "hospital" for item in filtered)


def test_fetch_from_amap_paginates_and_filters(monkeypatch):
    pages = {"hospital": 0}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            pages["hospital"] += 1
            if pages["hospital"] == 1:
                return {
                    "status": "1",
                    "pois": [
                        {
                            "id": "park-1",
                            "name": "中央公园",
                            "location": "120.585316,31.298886",
                            "typecode": "110101",
                            "type": "风景名胜;公园广场;公园",
                        },
                        {
                            "id": "hosp-1",
                            "name": "测试综合医院",
                            "location": "120.586000,31.299000",
                            "typecode": "090100",
                            "type": "医疗保健服务;综合医院;综合医院",
                        },
                    ],
                }
            return {"status": "1", "pois": []}

    monkeypatch.setattr(amap_poi.requests, "get", lambda *args, **kwargs: FakeResponse())

    bounds = PoiBounds(min_lat=31.29, min_lng=120.58, max_lat=31.31, max_lng=120.59)
    monkeypatch.setattr(amap_poi.time, "sleep", lambda *_args, **_kwargs: None)
    result = amap_poi.fetch_emergency_facilities_from_amap(
        bounds,
        ["hospital"],
        api_key="test-key",
        key_source="AMAP_WEB_SERVICE_KEY",
        request_interval=0,
    )
    assert isinstance(result, AmapFetchResult)
    assert len(result.facilities) == 1
    assert result.facilities[0]["name"] == "测试综合医院"
    assert result.partial is False
    assert pages["hospital"] >= 1


def test_fetch_from_amap_retries_on_rate_limit_then_succeeds(monkeypatch):
    calls = {"count": 0}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            calls["count"] += 1
            if calls["count"] == 1:
                return {
                    "status": "0",
                    "info": "CUQPS_HAS_EXCEEDED_THE_LIMIT",
                    "infocode": "10021",
                }
            return {
                "status": "1",
                "pois": [
                    {
                        "id": "hosp-1",
                        "name": "限流后医院",
                        "location": "120.586000,31.299000",
                        "typecode": "090100",
                        "type": "医疗保健服务;综合医院;综合医院",
                    }
                ],
            }

    sleeps: list[float] = []

    monkeypatch.setattr(amap_poi.requests, "get", lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr(amap_poi.time, "sleep", lambda sec: sleeps.append(sec))

    bounds = PoiBounds(min_lat=31.29, min_lng=120.58, max_lat=31.31, max_lng=120.59)
    result = amap_poi.fetch_emergency_facilities_from_amap(
        bounds,
        ["hospital"],
        api_key="test-key",
        key_source="AMAP_WEB_SERVICE_KEY",
        request_interval=0,
    )

    assert calls["count"] == 2
    assert any(s >= 2 for s in sleeps)
    assert len(result.facilities) == 1
    assert result.facilities[0]["name"] == "限流后医院"
    assert result.partial is False


def test_is_amap_rate_limit_response_detects_infocode():
    assert is_amap_rate_limit_response({"info": "CUQPS_HAS_EXCEEDED_THE_LIMIT", "infocode": "10021"})
    assert not is_amap_rate_limit_response({"info": "INVALID_USER_KEY", "infocode": "10001"})


@pytest.mark.parametrize(
    "poi,facility_type,expected_exclude",
    [
        (
            {"name": "中央公园", "typecode": "110101", "type": "风景名胜;公园广场;公园"},
            "hospital",
            True,
        ),
        (
            {"name": "金鸡湖景区", "typecode": "110202", "type": "风景名胜;风景名胜;国家级景点"},
            "fire_station",
            True,
        ),
        (
            {"name": "公园管理处医务室", "typecode": "090100", "type": "医疗保健服务;综合医院;综合医院"},
            "hospital",
            True,
        ),
        (
            {"name": "某某宠物医院", "typecode": "090702", "type": "医疗保健服务;动物医疗场所;宠物诊所"},
            "hospital",
            True,
        ),
        (
            {"name": "苏州市立医院", "typecode": "090100", "type": "医疗保健服务;综合医院;综合医院"},
            "hospital",
            False,
        ),
        (
            {"name": "姑苏区消防救援站", "typecode": "130504", "type": "政府机构及社会团体;公检法机构;消防机关"},
            "fire_station",
            False,
        ),
    ],
)
def test_should_exclude_emergency_poi_filter(poi, facility_type, expected_exclude):
    assert should_exclude_emergency_poi(poi, facility_type) is expected_exclude
