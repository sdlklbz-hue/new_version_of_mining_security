#!/usr/bin/env python3
"""生成演示用企业模拟数据 CSV（按风险等级从低到高排序）。"""

from __future__ import annotations

import argparse
from pathlib import Path

from _bootstrap import setup_project_paths

setup_project_paths()

from mining_risk_common.demo.generator import export_mock_csv  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="生成并按风险等级导出模拟企业 CSV")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("datasets/demo/csv"),
        help="CSV 输出目录（默认 datasets/demo/csv）",
    )
    parser.add_argument(
        "--per-level",
        type=int,
        default=10,
        help="每个场景、每个风险等级生成的企业数量（默认 10）",
    )
    parser.add_argument("--seed", type=int, default=42, help="随机种子（默认可复现）")
    args = parser.parse_args()

    paths = export_mock_csv(
        args.output_dir,
        per_level_per_scenario=args.per_level,
        seed=args.seed,
    )
    total = sum(1 for _ in (args.output_dir / "mock_enterprises_all.csv").open(encoding="utf-8-sig")) - 1

    print(f"已生成 {total} 条模拟企业记录 -> {args.output_dir.resolve()}")
    for name, path in sorted(paths.items(), key=lambda x: x[1].name):
        lines = sum(1 for _ in path.open(encoding="utf-8-sig")) - 1
        print(f"  - {path.name}: {lines} 行 ({name})")


if __name__ == "__main__":
    main()
