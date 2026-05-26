#!/usr/bin/env python3
"""离线抓取苏州片区急救设施 POI，写入静态 JSON 供运行时本地过滤。

需要高德 Web 服务 Key（.env 中 AMAP_WEB_SERVICE_KEY）。无 Key 时写入空数据集并提示配置。

用法::

    export MINING_PROJECT_ROOT="$(pwd)"
    python scripts/fetch_emergency_facilities.py
    python scripts/fetch_emergency_facilities.py --output datasets/demo/emergency_facilities_suzhou.json
    python scripts/fetch_emergency_facilities.py --max-pages 5 --tile-grid
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from _bootstrap import setup_project_paths

PROJECT_ROOT = setup_project_paths()

from mining_risk_common.utils.config import resolve_project_path  # noqa: E402
from mining_risk_serve.api.services.amap_poi import (  # noqa: E402
    DEFAULT_MAX_POI_PAGES,
    PoiBounds,
    _resolve_amap_api_key,
    fetch_emergency_facilities_from_amap,
    poi_request_interval_sec,
    supported_facility_types,
)

DEFAULT_BOUNDS = PoiBounds(min_lat=31.0, min_lng=120.3, max_lat=31.5, max_lng=121.0)
DEFAULT_OUTPUT = "datasets/demo/emergency_facilities_suzhou.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="离线抓取苏州急救设施 POI 并保存为静态 JSON")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(DEFAULT_OUTPUT),
        help=f"输出路径（默认 {DEFAULT_OUTPUT}）",
    )
    parser.add_argument("--min-lat", type=float, default=DEFAULT_BOUNDS.min_lat)
    parser.add_argument("--min-lng", type=float, default=DEFAULT_BOUNDS.min_lng)
    parser.add_argument("--max-lat", type=float, default=DEFAULT_BOUNDS.max_lat)
    parser.add_argument("--max-lng", type=float, default=DEFAULT_BOUNDS.max_lng)
    parser.add_argument(
        "--types",
        default=",".join(supported_facility_types()),
        help="设施类型，逗号分隔（默认全部）",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=DEFAULT_MAX_POI_PAGES,
        help=f"每种设施类型最多分页数（每页 25 条，默认 {DEFAULT_MAX_POI_PAGES}）",
    )
    parser.add_argument(
        "--request-interval",
        type=float,
        default=None,
        help="请求间隔秒数（默认读取 AMAP_POI_REQUEST_INTERVAL_SEC，约 0.4s）",
    )
    parser.add_argument(
        "--tile-grid",
        action="store_true",
        help="将 bbox 切为 2×2 分片逐片抓取，降低单次 polygon 结果量",
    )
    args = parser.parse_args()

    bounds = PoiBounds(
        min_lat=args.min_lat,
        min_lng=args.min_lng,
        max_lat=args.max_lat,
        max_lng=args.max_lng,
    ).normalized()
    facility_types = [t.strip() for t in args.types.split(",") if t.strip()]
    output_path = resolve_project_path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    api_key, key_source = _resolve_amap_api_key()
    partial = False
    fetch_warnings: list[str] = []
    if api_key:
        interval = poi_request_interval_sec(args.request_interval)
        result = fetch_emergency_facilities_from_amap(
            bounds,
            facility_types,
            api_key=api_key,
            key_source=key_source,
            max_pages=max(1, args.max_pages),
            request_interval=interval,
            tile_grid=args.tile_grid,
        )
        facilities = result.facilities
        partial = result.partial
        fetch_warnings = result.warnings
        print(
            f"已从高德抓取 {len(facilities)} 条 POI（key_source={key_source}, "
            f"interval={interval}s, max_pages={args.max_pages}, tile_grid={args.tile_grid}）"
        )
        if partial:
            print("警告：部分类型因 QPS 限流未抓全，已保存当前结果。请稍后重试脚本补全。", file=sys.stderr)
            for warning in fetch_warnings:
                print(f"  - {warning}", file=sys.stderr)
    else:
        facilities = []
        source = "empty"
        print(
            "未配置 AMAP_WEB_SERVICE_KEY，已写入空数据集。",
            file=sys.stderr,
        )
        print(
            "请在根目录 .env 配置 AMAP_WEB_SERVICE_KEY（须开通 Web 服务）后重新运行本脚本。",
            file=sys.stderr,
        )

    source = "amap" if api_key else "empty"
    payload = {
        "version": 1,
        "region": "suzhou",
        "source": source,
        "partial": partial,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "bounds": {
            "min_lat": bounds.min_lat,
            "min_lng": bounds.min_lng,
            "max_lat": bounds.max_lat,
            "max_lng": bounds.max_lng,
        },
        "facility_types": facility_types or supported_facility_types(),
        "fetch_warnings": fetch_warnings,
        "facilities": facilities,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已保存 -> {output_path}（{len(facilities)} 条）")


if __name__ == "__main__":
    main()
