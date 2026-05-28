#!/usr/bin/env python3
"""删除 datasets/raw/public 下同表旧时间戳重复文件，保留最新；同 stem 的 xlsx 若已有新 csv 则删 xlsx。"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "datasets" / "raw" / "public"
TIMESTAMP_SUFFIX = re.compile(r"_(\d{12,14})(?:-\d+)?\.(csv|xlsx)$", re.I)


def canonical_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"-\d{13}$", "", stem)
    m = re.search(r"_(\d{12,14})$", stem)
    if m:
        stem = stem[: m.start()]
    return stem


def timestamp_in_name(filename: str) -> int:
    m = TIMESTAMP_SUFFIX.search(filename)
    return int(m.group(1)) if m else 0


def collect_deletions() -> list[Path]:
    to_delete: list[Path] = []

    for subdir in sorted(ROOT.iterdir()):
        if not subdir.is_dir() or subdir.name.startswith("_"):
            continue

        by_stem_ext: dict[tuple[str, str], list[Path]] = defaultdict(list)
        by_stem: dict[str, list[Path]] = defaultdict(list)

        for path in subdir.iterdir():
            if path.suffix.lower() not in {".csv", ".xlsx"}:
                continue
            stem = canonical_stem(path.name)
            by_stem_ext[(stem, path.suffix.lower())].append(path)
            by_stem[stem].append(path)

        # 同目录、同 stem、同扩展名：只保留时间戳最大者
        for (_stem, _ext), paths in by_stem_ext.items():
            if len(paths) < 2:
                continue
            paths_sorted = sorted(paths, key=lambda p: (timestamp_in_name(p.name), p.stat().st_mtime))
            to_delete.extend(paths_sorted[:-1])

        # 同 stem 同时有 csv 与 xlsx：保留 csv（本轮从真实库导入），删旧 xlsx
        for stem, paths in by_stem.items():
            csvs = [p for p in paths if p.suffix.lower() == ".csv"]
            xlsxs = [p for p in paths if p.suffix.lower() == ".xlsx"]
            if csvs and xlsxs:
                to_delete.extend(xlsxs)

    # 去重
    unique: dict[Path, None] = {}
    for p in to_delete:
        unique[p.resolve()] = None
    return sorted(unique.keys())


def main() -> None:
    targets = collect_deletions()
    if not targets:
        print("无待删除重复文件")
        return

    report = ROOT / "_dedupe_deleted_files.txt"
    lines = [f"deleted_count={len(targets)}", ""]
    for path in targets:
        rel = path.relative_to(ROOT)
        lines.append(str(rel))
        path.unlink()
        print(f"已删除: {rel}")

    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n日志: {report}")


if __name__ == "__main__":
    main()
