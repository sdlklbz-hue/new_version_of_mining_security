"""高德 POI 与急救设施静态数据集：离线抓取、运行时本地过滤。"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

from mining_risk_common.utils.config import resolve_project_path
from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)

AMAP_PLACE_POLYGON_URL = "https://restapi.amap.com/v3/place/polygon"
CACHE_TTL_SECONDS = 300.0
DEFAULT_MAX_POI_PAGES = 5
DEFAULT_POI_REQUEST_INTERVAL_SEC = 0.4
AMAP_POI_MAX_RETRIES = 3
AMAP_POI_BACKOFF_BASE_SEC = 2.0

AMAP_RATE_LIMIT_INFO_CODES = frozenset({"10021"})
AMAP_RATE_LIMIT_INFO_NAMES = frozenset(
    {
        "CUQPS_HAS_EXCEEDED_THE_LIMIT",
        "ACCESS_TOO_FREQUENT",
    }
)

DEFAULT_STATIC_CANDIDATES: Tuple[str, ...] = (
    "datasets/processed/emergency_facilities.json",
    "datasets/demo/emergency_facilities_suzhou.json",
)

FACILITY_TYPE_KEYWORDS: Dict[str, str] = {
    "hospital": "综合医院|专科医院",
    "fire_station": "消防站|消防队|消防救援",
    "emergency_center": "急救中心",
    "police": "派出所",
}

FACILITY_TYPE_TYPECODES: Dict[str, str] = {
    "hospital": (
        "090100|090101|090102|090200|090202|090203|090204|090205|090206|090207|090208|090209|090210|090211"
    ),
    "fire_station": "130504",
    "emergency_center": "090400",
    "police": "130501|130506",
}

EXCLUDED_NAME_FRAGMENTS: Tuple[str, ...] = (
    "公园",
    "广场",
    "绿地",
    "风景区",
    "游乐园",
    "动物园",
    "植物园",
    "风景名胜",
    "旅游景点",
    "游乐场",
    "森林公园",
    "湿地",
    "生态园",
    "度假区",
    "水上乐园",
    "水族馆",
    "博物馆",
    "纪念馆",
    "售票",
    "健身",
    "体育场",
    "球场",
    "高尔夫",
    "管理处",
)

HOSPITAL_EXCLUDED_NAME_FRAGMENTS: Tuple[str, ...] = (
    "宠物",
    "动物医院",
    "兽药",
    "美容",
    "整形",
)

EXCLUDED_TYPECODE_PREFIXES: Tuple[str, ...] = (
    "110",
    "0806",
    "140",
    "050",
    "060",
    "070",
    "080",
    "100",
    "120",
    "150",
)

HOSPITAL_ALLOWED_TYPECODE_PREFIXES: Tuple[str, ...] = ("0901", "0902", "0904")

FACILITY_TYPE_LABELS: Dict[str, str] = {
    "hospital": "医院",
    "fire_station": "消防站/局",
    "emergency_center": "急救中心",
    "police": "派出所",
}

AMAP_ERROR_HINTS: Dict[str, str] = {
    "USERKEY_PLAT_NOMATCH": (
        "当前 Key 未开通「Web 服务」平台。请在高德控制台为该 Key 勾选 Web 服务，"
        "或在 .env 单独配置 AMAP_WEB_SERVICE_KEY。"
    ),
    "INVALID_USER_KEY": "高德 Key 无效，请检查 AMAP_WEB_SERVICE_KEY 是否正确。",
    "DAILY_QUERY_OVER_LIMIT": "高德 Web 服务日调用量超限，请明日再试或升级配额。",
    "ACCESS_TOO_FREQUENT": "高德 Web 服务请求过于频繁，请稍后重试。",
    "CUQPS_HAS_EXCEEDED_THE_LIMIT": (
        "高德 Web 服务并发/QPS 超限（infocode=10021）。"
        "离线脚本会自动退避重试；仍失败时会保存已抓取数据，请稍后重新运行 fetch 脚本。"
    ),
    "SERVICE_NOT_AVAILABLE": "高德 Web 服务暂不可用，请稍后重试。",
}

EMPTY_DATASET_HINT = (
    "暂无急救设施数据。请运行 python scripts/fetch_emergency_facilities.py 生成静态数据集。"
)

_STATIC_CACHE: Dict[str, Any] = {"path": "", "mtime": 0.0, "facilities": [], "file_meta": {}}
_FILTER_CACHE: Dict[Tuple[float, float, float, float, Tuple[str, ...]], Tuple[float, List[Dict[str, Any]], str]] = {}


class AmapPoiError(RuntimeError):
    """高德 POI 或静态数据集错误。"""

    def __init__(
        self,
        message: str,
        *,
        code: str = "",
        hint: str = "",
        key_source: str = "",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.hint = hint or _hint_for_amap_error(message)
        self.key_source = key_source


@dataclass
class AmapFetchResult:
    """离线高德 POI 抓取结果（含部分成功标记）。"""

    facilities: List[Dict[str, Any]]
    partial: bool = False
    warnings: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class PoiBounds:
    min_lat: float
    min_lng: float
    max_lat: float
    max_lng: float

    def normalized(self) -> "PoiBounds":
        return PoiBounds(
            min_lat=min(self.min_lat, self.max_lat),
            min_lng=min(self.min_lng, self.max_lng),
            max_lat=max(self.min_lat, self.max_lat),
            max_lng=max(self.min_lng, self.max_lng),
        )


def supported_facility_types() -> List[str]:
    return list(FACILITY_TYPE_KEYWORDS.keys())


def default_static_dataset_path() -> Path:
    override = os.getenv("EMERGENCY_FACILITIES_DATA_PATH", "").strip()
    if override:
        return resolve_project_path(override)
    for rel in DEFAULT_STATIC_CANDIDATES:
        candidate = resolve_project_path(rel)
        if candidate.is_file():
            return candidate
    return resolve_project_path(DEFAULT_STATIC_CANDIDATES[-1])


def _hint_for_amap_error(info: str) -> str:
    return AMAP_ERROR_HINTS.get(
        info,
        f"高德 POI 查询失败（{info}）。请检查 AMAP_WEB_SERVICE_KEY 是否正确且已开通 Web 服务。",
    )


def poi_request_interval_sec(override: float | None = None) -> float:
    if override is not None:
        return max(0.0, float(override))
    raw = os.getenv("AMAP_POI_REQUEST_INTERVAL_SEC", str(DEFAULT_POI_REQUEST_INTERVAL_SEC)).strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return DEFAULT_POI_REQUEST_INTERVAL_SEC


def is_amap_rate_limit_response(payload: Dict[str, Any]) -> bool:
    info = str(payload.get("info") or "")
    infocode = str(payload.get("infocode") or "")
    if infocode in AMAP_RATE_LIMIT_INFO_CODES:
        return True
    if info in AMAP_RATE_LIMIT_INFO_NAMES:
        return True
    return "CUQPS" in info.upper()


def split_bounds_grid(bounds: PoiBounds, rows: int = 2, cols: int = 2) -> List[PoiBounds]:
    """将 bbox 均分为 rows×cols 子区域（用于降低单次 polygon 结果量）。"""
    b = bounds.normalized()
    if rows < 1 or cols < 1:
        return [b]
    lat_step = (b.max_lat - b.min_lat) / rows
    lng_step = (b.max_lng - b.min_lng) / cols
    tiles: List[PoiBounds] = []
    for row in range(rows):
        for col in range(cols):
            tiles.append(
                PoiBounds(
                    min_lat=b.min_lat + row * lat_step,
                    min_lng=b.min_lng + col * lng_step,
                    max_lat=b.min_lat + (row + 1) * lat_step,
                    max_lng=b.min_lng + (col + 1) * lng_step,
                )
            )
    return tiles


def _resolve_amap_api_key() -> Tuple[str, str]:
    for env_name in ("AMAP_WEB_SERVICE_KEY", "AMAP_API_KEY", "VITE_AMAP_KEY"):
        value = os.getenv(env_name, "").strip()
        if value:
            return value, env_name
    return "", ""


def _cache_key(bounds: PoiBounds, facility_types: Iterable[str]) -> Tuple[float, float, float, float, Tuple[str, ...]]:
    b = bounds.normalized()
    return (
        round(b.min_lat, 3),
        round(b.min_lng, 3),
        round(b.max_lat, 3),
        round(b.max_lng, 3),
        tuple(sorted(facility_types)),
    )


def _in_bounds(item: Dict[str, Any], bounds: PoiBounds) -> bool:
    return bounds.min_lat <= item["lat"] <= bounds.max_lat and bounds.min_lng <= item["lng"] <= bounds.max_lng


def _parse_location(location: str) -> Tuple[float, float] | None:
    try:
        lng_text, lat_text = str(location).split(",", 1)
        return float(lat_text), float(lng_text)
    except (TypeError, ValueError):
        return None


def _poi_typecode(poi: Dict[str, Any]) -> str:
    return str(poi.get("typecode") or "").strip()


def _poi_type_text(poi: Dict[str, Any]) -> str:
    return str(poi.get("type") or "").strip()


def _name_has_fragment(name: str, fragments: Iterable[str]) -> bool:
    return any(fragment in name for fragment in fragments)


def should_exclude_emergency_poi(poi: Dict[str, Any], facility_type: str) -> bool:
    """剔除公园、景区等与应急无关的 POI（仅用于急救设施图层）。"""
    name = str(poi.get("name") or "")
    typecode = _poi_typecode(poi)
    type_text = _poi_type_text(poi)

    if _name_has_fragment(name, EXCLUDED_NAME_FRAGMENTS):
        return True

    for prefix in EXCLUDED_TYPECODE_PREFIXES:
        if typecode.startswith(prefix):
            return True

    scenic_markers = ("风景名胜", "公园", "旅游景点", "动物园", "植物园")
    if any(marker in type_text for marker in scenic_markers):
        return True

    if facility_type == "hospital":
        if _name_has_fragment(name, HOSPITAL_EXCLUDED_NAME_FRAGMENTS):
            return True
        if typecode and not any(typecode.startswith(prefix) for prefix in HOSPITAL_ALLOWED_TYPECODE_PREFIXES):
            return True
        if typecode.startswith(("0903", "090701", "090702")):
            return True
    elif facility_type == "fire_station":
        if typecode and not typecode.startswith("130504") and "消防" not in type_text:
            return True
    elif facility_type == "emergency_center":
        if typecode and not typecode.startswith("0904") and "急救" not in type_text:
            return True
    elif facility_type == "police":
        if typecode and not typecode.startswith(("130501", "130506")) and "公安" not in type_text and "警察" not in type_text:
            return True

    return False


def _normalize_poi(poi: Dict[str, Any], facility_type: str) -> Dict[str, Any] | None:
    location = _parse_location(str(poi.get("location") or ""))
    if not location:
        return None
    lat, lng = location
    return {
        "id": str(poi.get("id") or f"{facility_type}:{poi.get('name')}:{location}"),
        "name": str(poi.get("name") or FACILITY_TYPE_LABELS[facility_type]),
        "type": facility_type,
        "type_label": FACILITY_TYPE_LABELS[facility_type],
        "lat": lat,
        "lng": lng,
        "address": str(poi.get("address") or ""),
    }


def load_static_facilities(path: Path | None = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """从磁盘加载预构建急救设施 JSON（进程内缓存，按 mtime 失效）。"""
    dataset_path = path or default_static_dataset_path()
    if not dataset_path.is_file():
        return [], {"dataset_path": str(dataset_path), "exists": False}

    mtime = dataset_path.stat().st_mtime
    cached_path = str(_STATIC_CACHE.get("path") or "")
    if cached_path == str(dataset_path) and _STATIC_CACHE.get("mtime") == mtime:
        return list(_STATIC_CACHE["facilities"]), dict(_STATIC_CACHE["file_meta"])

    with dataset_path.open(encoding="utf-8") as fh:
        payload = json.load(fh)

    raw_items = payload.get("facilities", payload if isinstance(payload, list) else [])
    facilities: List[Dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        facility_type = str(item.get("type") or "")
        if facility_type not in FACILITY_TYPE_KEYWORDS:
            continue
        try:
            lat = float(item["lat"])
            lng = float(item["lng"])
        except (KeyError, TypeError, ValueError):
            continue
        facilities.append(
            {
                "id": str(item.get("id") or f"{facility_type}:{item.get('name')}:{lat},{lng}"),
                "name": str(item.get("name") or FACILITY_TYPE_LABELS[facility_type]),
                "type": facility_type,
                "type_label": str(item.get("type_label") or FACILITY_TYPE_LABELS[facility_type]),
                "lat": lat,
                "lng": lng,
                "address": str(item.get("address") or ""),
            }
        )

    file_meta = {
        "dataset_path": str(dataset_path),
        "exists": True,
        "version": payload.get("version") if isinstance(payload, dict) else None,
        "region": payload.get("region") if isinstance(payload, dict) else None,
        "fetched_at": payload.get("fetched_at") if isinstance(payload, dict) else None,
        "dataset_source": payload.get("source") if isinstance(payload, dict) else None,
        "total_in_file": len(facilities),
    }
    _STATIC_CACHE.update(
        path=str(dataset_path),
        mtime=mtime,
        facilities=facilities,
        file_meta=file_meta,
    )
    return facilities, file_meta


def filter_facilities_by_bounds(
    facilities: Iterable[Dict[str, Any]],
    bounds: PoiBounds,
    facility_types: Iterable[str],
) -> List[Dict[str, Any]]:
    """按视野 bbox 与设施类型在内存中过滤静态数据集。"""
    selected = {item for item in facility_types if item in FACILITY_TYPE_KEYWORDS}
    if not selected:
        selected = set(FACILITY_TYPE_KEYWORDS.keys())
    normalized = bounds.normalized()
    return [
        item
        for item in facilities
        if item.get("type") in selected and _in_bounds(item, normalized)
    ]


def _amap_place_polygon_request(
    params: Dict[str, Any],
    *,
    key_source: str,
    facility_type: str,
    page: int,
    request_interval: float,
    max_retries: int = AMAP_POI_MAX_RETRIES,
) -> Dict[str, Any]:
    """单次 polygon 请求，遇 QPS 限流时指数退避重试。"""
    last_payload: Dict[str, Any] = {}
    for attempt in range(max_retries + 1):
        if request_interval > 0:
            time.sleep(request_interval)
        try:
            resp = requests.get(AMAP_PLACE_POLYGON_URL, params=params, timeout=10)
            resp.raise_for_status()
            payload = resp.json()
        except requests.RequestException as exc:
            raise AmapPoiError(
                f"请求高德 POI 服务失败: {exc}",
                hint="请检查网络连接或稍后重试。",
                key_source=key_source,
            ) from exc

        if str(payload.get("status")) == "1":
            return payload

        last_payload = payload
        info = str(payload.get("info") or "高德 POI 查询失败")
        infocode = str(payload.get("infocode") or "")

        if is_amap_rate_limit_response(payload) and attempt < max_retries:
            backoff = AMAP_POI_BACKOFF_BASE_SEC * (2**attempt)
            logger.warning(
                "高德 POI QPS 超限，%ss 后重试 (%s/%s, infocode=%s, facility_type=%s, page=%s)",
                backoff,
                attempt + 1,
                max_retries,
                infocode,
                facility_type,
                page,
            )
            time.sleep(backoff)
            continue

        logger.warning(
            "高德急救设施 POI 查询失败: %s (infocode=%s, facility_type=%s, page=%s)",
            info,
            infocode,
            facility_type,
            page,
        )
        raise AmapPoiError(
            info,
            code=infocode,
            hint=_hint_for_amap_error(info),
            key_source=key_source,
        )

    return last_payload


def _merge_pois_into_facilities(
    pois: Iterable[Dict[str, Any]],
    facility_type: str,
    bounds: PoiBounds,
    seen: set[str],
    facilities: List[Dict[str, Any]],
) -> None:
    b = bounds.normalized()
    for poi in pois:
        if should_exclude_emergency_poi(poi, facility_type):
            continue
        item = _normalize_poi(poi, facility_type)
        if not item or item["id"] in seen or not _in_bounds(item, b):
            continue
        seen.add(item["id"])
        facilities.append(item)


def _fetch_facility_type_in_bounds(
    bounds: PoiBounds,
    facility_type: str,
    *,
    api_key: str,
    key_source: str,
    max_pages: int,
    request_interval: float,
    seen: set[str],
    facilities: List[Dict[str, Any]],
    warnings: List[str],
) -> bool:
    """抓取单一设施类型；遇限流且重试耗尽时返回 False（调用方继续其它类型）。"""
    b = bounds.normalized()
    polygon = f"{b.min_lng},{b.min_lat}|{b.max_lng},{b.max_lat}"
    page = 1
    while page <= max_pages:
        params: Dict[str, Any] = {
            "key": api_key,
            "polygon": polygon,
            "types": FACILITY_TYPE_TYPECODES[facility_type],
            "keywords": FACILITY_TYPE_KEYWORDS[facility_type],
            "offset": 25,
            "page": page,
            "extensions": "base",
        }
        try:
            payload = _amap_place_polygon_request(
                params,
                key_source=key_source,
                facility_type=facility_type,
                page=page,
                request_interval=request_interval,
            )
        except AmapPoiError as exc:
            if exc.code in AMAP_RATE_LIMIT_INFO_CODES or str(exc) in AMAP_RATE_LIMIT_INFO_NAMES:
                msg = (
                    f"设施类型 {facility_type} 在第 {page} 页触发 QPS 限流，"
                    f"已保留此前 {len(facilities)} 条记录"
                )
                warnings.append(msg)
                logger.warning(msg)
                return False
            raise

        pois = payload.get("pois") or []
        _merge_pois_into_facilities(pois, facility_type, b, seen, facilities)
        if len(pois) < 25:
            return True
        page += 1
    return True


def fetch_emergency_facilities_from_amap(
    bounds: PoiBounds,
    facility_types: Iterable[str] | None = None,
    *,
    api_key: str = "",
    key_source: str = "",
    max_pages: int = DEFAULT_MAX_POI_PAGES,
    request_interval: float | None = None,
    tile_grid: bool = False,
) -> AmapFetchResult:
    """调用高德 Web 服务抓取 POI（仅供离线脚本使用，运行时 API 不调用）。"""
    selected = [item for item in (facility_types or FACILITY_TYPE_KEYWORDS) if item in FACILITY_TYPE_KEYWORDS]
    if not selected:
        selected = list(FACILITY_TYPE_KEYWORDS.keys())

    resolved_key, resolved_source = (api_key, key_source) if api_key else _resolve_amap_api_key()
    if not resolved_key:
        raise AmapPoiError(
            "未配置高德 Web 服务 Key",
            code="MISSING_AMAP_KEY",
            hint="请在根目录 .env 配置 AMAP_WEB_SERVICE_KEY（须开通 Web 服务）。",
        )

    interval = poi_request_interval_sec(request_interval)
    bounds_list = split_bounds_grid(bounds, 2, 2) if tile_grid else [bounds.normalized()]
    facilities: List[Dict[str, Any]] = []
    seen: set[str] = set()
    warnings: List[str] = []
    partial = False

    for tile_bounds in bounds_list:
        for facility_type in selected:
            ok = _fetch_facility_type_in_bounds(
                tile_bounds,
                facility_type,
                api_key=resolved_key,
                key_source=resolved_source,
                max_pages=max_pages,
                request_interval=interval,
                seen=seen,
                facilities=facilities,
                warnings=warnings,
            )
            if not ok:
                partial = True
                # 限流后多等一会再抓下一类型/分片
                time.sleep(max(interval, AMAP_POI_BACKOFF_BASE_SEC))

    return AmapFetchResult(facilities=facilities, partial=partial, warnings=warnings)


def search_emergency_facilities(
    bounds: PoiBounds,
    facility_types: Iterable[str],
    *,
    allow_mock: bool = True,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """运行时查询：读取静态 JSON 并按 bbox 本地过滤，不发起高德 HTTP。"""
    selected = [item for item in facility_types if item in FACILITY_TYPE_KEYWORDS]
    if not selected:
        selected = ["hospital", "fire_station", "emergency_center"]
    normalized_bounds = bounds.normalized()
    key = _cache_key(normalized_bounds, selected)
    now = time.time()
    cached = _FILTER_CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1], {"source": cached[2], "cached": True, "supported_types": supported_facility_types()}

    dataset_path = default_static_dataset_path()
    all_facilities, file_meta = load_static_facilities(dataset_path)
    if file_meta.get("exists"):
        facilities = filter_facilities_by_bounds(all_facilities, normalized_bounds, selected)
        meta = {
            "source": "static",
            "cached": False,
            "supported_types": supported_facility_types(),
            "dataset_path": file_meta.get("dataset_path"),
            "total_in_dataset": file_meta.get("total_in_file"),
        }
        _FILTER_CACHE[key] = (now, facilities, "static")
        return facilities, meta

    if not allow_mock:
        raise AmapPoiError(
            "未找到急救设施静态数据集",
            code="MISSING_STATIC_DATASET",
            hint=(
                f"请运行 python scripts/fetch_emergency_facilities.py 生成 {dataset_path}，"
                "或设置 EMERGENCY_FACILITIES_DATA_PATH。"
            ),
        )

    meta = {
        "source": "empty",
        "cached": False,
        "supported_types": supported_facility_types(),
        "hint": EMPTY_DATASET_HINT,
        "error": "MISSING_STATIC_DATASET",
    }
    _FILTER_CACHE[key] = (now, [], "empty")
    return [], meta
