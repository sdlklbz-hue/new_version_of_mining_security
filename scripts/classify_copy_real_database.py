#!/usr/bin/env python3
"""将「真正的数据库」目录中的 CSV 按表名/表头分类复制到 datasets/raw/public 四个子目录。"""

from __future__ import annotations

import csv
import re
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SOURCE_DIR = Path(r"D:\Desktop\真正的数据库")
TARGET_ROOT = Path(__file__).resolve().parents[1] / "datasets" / "raw" / "public"

SUBDIR_SUPPLEMENT = "数据补充"
SUBDIR_REFERENCE = "数据参考"
SUBDIR_NEW = "新数据"
SUBDIR_ENTERPRISE = "企业相关表导出"

# 与现有 datasets/raw/public 对齐的参考表（无时间戳、约百行抽样）
REFERENCE_STEMS = {
    "enterprise_routine_check_log",
    "enterprise_routine_check_plan",
    "st_enterprise_directory",
    "st_enterprise_production_status_record",
    "st_enterprise_rating_information_filling",
    "st_fxsb_enterprise_routine_check_trouble",
    "szs_business_address",
    "szs_enterprise_dust_clear_record",
    "szs_enterprise_industry_category",
    "szs_enterprise_information",
    "szs_enterprise_risk",
    "szs_enterprise_risk_history",
    "szs_enterprise_safety",
    "szs_enterprise_volkswirtschaft",
    "szs_ent_label",
    "szs_ent_label_report_history",
    "szs_risk_target",
    "zjj_house_base_info",
    "zjj_house_safety_identify",
    "zjstreet2_gcj02",
}

# 企业主数据宽表导出（与现有 xlsx 清单一致；st_ds_aczf 优先归「新数据」）
ENTERPRISE_EXPORT_STEMS = {
    "enterprise_routine_check_log",
    "st_enterprise_directory",
    "st_enterprise_production_status_record",
    "st_enterprise_rating_information_filling",
    "szs_business_address",
    "szs_enterprise_dust_clear_record",
    "szs_enterprise_industry_category",
    "szs_enterprise_information",
    "szs_enterprise_risk_history",
    "szs_enterprise_safety",
    "szs_enterprise_volkswirtschaft",
    "szs_ent_label_report_history",
    "zjj_house_base_info",
    "zjstreet2_gcj02",
}

NEW_DATA_PREFIXES = ("ds_aczf_", "st_ds_aczf_")

# 表头关键词 → 新数据（行政处罚/文书）
NEW_DATA_HEADER_KEYWORDS = (
    "案件id",
    "案件名称",
    "文书记录id",
    "文书号",
    "文书来源",
    "立案id",
    "立案对象",
    "处罚裁量",
    "行政处罚类型",
    "违法事实",
    "罚款金额",
    "附件id",
)

REFERENCE_SAMPLE_ROWS = 100
REFERENCE_MAX_ROWS = 150


def canonical_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"-\d{13}$", "", stem)
    stem = re.sub(r"_\d{14}$", "", stem)
    stem = re.sub(r"_\d{12}$", "", stem)
    return stem


def file_priority(path: Path) -> tuple[int, int]:
    m = re.search(r"_(\d{12,14})(?:-\d+)?\.csv$", path.name, re.I)
    ts = int(m.group(1)) if m else 0
    return ts, path.stat().st_size


def read_header_and_row_count(path: Path) -> tuple[list[str], int]:
    """读取表头与数据行数（不含表头）。"""
    encodings = ("utf-8-sig", "utf-8", "gb18030", "gbk")
    for enc in encodings:
        try:
            with path.open("r", encoding=enc, newline="") as f:
                reader = csv.reader(f)
                header = next(reader, [])
                rows = sum(1 for _ in reader)
            return header, rows
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError(f"无法解码: {path}")


def header_text(columns: list[str]) -> str:
    return " ".join(columns).lower()


def is_new_data_table(stem: str, columns: list[str]) -> bool:
    lower_stem = stem.lower()
    if any(lower_stem.startswith(p) for p in NEW_DATA_PREFIXES):
        return True
    hay = header_text(columns)
    hits = sum(1 for kw in NEW_DATA_HEADER_KEYWORDS if kw.lower() in hay)
    return hits >= 2


def classify_primary(stem: str, columns: list[str], row_count: int) -> str:
    if is_new_data_table(stem, columns):
        return SUBDIR_NEW
    if stem in ENTERPRISE_EXPORT_STEMS:
        return SUBDIR_ENTERPRISE
    if row_count <= REFERENCE_MAX_ROWS and stem in REFERENCE_STEMS:
        return SUBDIR_REFERENCE
    if stem in REFERENCE_STEMS:
        return SUBDIR_SUPPLEMENT
    return SUBDIR_SUPPLEMENT


def dest_name_for_folder(stem: str, folder: str, export_ts: str) -> str:
    if folder == SUBDIR_REFERENCE:
        return f"{stem}.csv"
    if folder == SUBDIR_ENTERPRISE:
        return f"{stem}.csv"
    return f"{stem}_{export_ts}.csv"


def write_reference_sample(src: Path, dest: Path, max_rows: int) -> None:
    encodings = ("utf-8-sig", "utf-8", "gb18030", "gbk")
    for enc in encodings:
        try:
            with src.open("r", encoding=enc, newline="") as fin:
                reader = csv.reader(fin)
                header = next(reader, None)
                if header is None:
                    return
                rows = []
                for i, row in enumerate(reader):
                    if i >= max_rows:
                        break
                    rows.append(row)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open("w", encoding="utf-8-sig", newline="") as fout:
                writer = csv.writer(fout)
                writer.writerow(header)
                writer.writerows(rows)
            return
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError(f"无法写参考抽样: {src}")


def main() -> None:
    if not SOURCE_DIR.is_dir():
        raise SystemExit(f"源目录不存在: {SOURCE_DIR}")

    export_ts = datetime.now().strftime("%Y%m%d%H%M")
    groups: dict[str, list[Path]] = defaultdict(list)
    for path in SOURCE_DIR.glob("*.csv"):
        groups[canonical_stem(path.name)].append(path)

    stats: dict[str, int] = defaultdict(int)
    ref_samples = 0
    log_lines: list[str] = []

    for stem, paths in sorted(groups.items()):
        src = max(paths, key=file_priority)
        try:
            columns, row_count = read_header_and_row_count(src)
        except Exception as exc:
            log_lines.append(f"SKIP {src.name}: {exc}")
            continue

        folder = classify_primary(stem, columns, row_count)
        dest_dir = TARGET_ROOT / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / dest_name_for_folder(stem, folder, export_ts)
        shutil.copy2(src, dest_file)
        stats[folder] += 1
        log_lines.append(f"{folder}\t{stem}\t<- {src.name}\trows={row_count}")

        if stem in REFERENCE_STEMS and row_count > REFERENCE_MAX_ROWS:
            ref_dest = TARGET_ROOT / SUBDIR_REFERENCE / f"{stem}.csv"
            write_reference_sample(src, ref_dest, REFERENCE_SAMPLE_ROWS)
            ref_samples += 1

    report_path = TARGET_ROOT / "_import_classification_report.txt"
    summary = [
        f"source={SOURCE_DIR}",
        f"export_ts={export_ts}",
        f"unique_tables={len(groups)}",
        f"reference_samples_generated={ref_samples}",
        "",
        "counts_by_folder:",
    ]
    for key in (SUBDIR_NEW, SUBDIR_ENTERPRISE, SUBDIR_REFERENCE, SUBDIR_SUPPLEMENT):
        summary.append(f"  {key}: {stats[key]}")
    summary.append("")
    summary.extend(log_lines)
    report_path.write_text("\n".join(summary), encoding="utf-8")

    print("\n".join(summary[:12]))
    print(f"... 完整日志: {report_path}")


if __name__ == "__main__":
    main()
