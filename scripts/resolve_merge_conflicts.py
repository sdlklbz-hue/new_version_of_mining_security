#!/usr/bin/env python3
"""一次性脚本：在 addition <- new_origin/main 合并中批量消解冲突。

策略：以 addition（HEAD / --ours）为 monorepo 主干，移植数据可视化前后端，删除 *_1 重复文件。

用法:
    python scripts/resolve_merge_conflicts.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 保留 HEAD，不做三方合并的文件（相对路径）
OURS_ONLY_GLOBS = [
    "tests/",
    "scripts/",
    "requirements",
    "requirements-",
    "config.yaml",
    "Dockerfile",
    "docker-compose.yml",
    ".dockerignore",
    ".env.example",
    "ARCHITECTURE_AUDIT.md",
    "DEPLOY.md",
    "KNOWLEDGE_BASE.md",
    "prompts/",
    "knowledge_base/",
    ".gitignore",
    "frontend/.dockerignore",
    "frontend/Dockerfile",
    "frontend/package",
    "frontend/src/components/",
    "frontend/src/pages/IterationPage",
    "frontend/src/pages/KnowledgeMemoryPage",
    "frontend/src/pages/RiskPredictionPage",
    "frontend/src/pages/SystemConfigPage",
    "frontend/src/styles/",
    "frontend/tsconfig",
    "frontend/vite.config",
]

# 需要手工/脚本智能合并
SMART_MERGE = {
    "README.md",
    "frontend/src/App.tsx",
    "frontend/src/api/client.ts",
    "frontend/src/api/types.ts",
}

JUNK_PREFIXES = (
    "python312",
    "pip.whl",
    "get-pip.py",
    "catboost_info/",
)


def run(cmd: list[str], *, check: bool = True, dry_run: bool = False) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    if dry_run:
        return subprocess.CompletedProcess(cmd, 0, "", "")
    return subprocess.run(cmd, cwd=ROOT, check=check, text=True, capture_output=True)


def git(*args: str, dry_run: bool = False) -> str:
    cp = run(["git", *args], dry_run=dry_run)
    return (cp.stdout or "").strip()


def unmerged() -> list[str]:
    out = git("diff", "--name-only", "--diff-filter=U")
    return [line for line in out.splitlines() if line.strip()]


def should_ours(path: str) -> bool:
    if path in SMART_MERGE:
        return False
    return any(
        path == g.rstrip("/")
        or path.startswith(g)
        or (g.endswith("/") and path.startswith(g))
        for g in OURS_ONLY_GLOBS
    )


def checkout_ours(paths: list[str], dry_run: bool) -> None:
    for p in paths:
        run(["git", "checkout", "--ours", "--", p], dry_run=dry_run)
        run(["git", "add", "--", p], dry_run=dry_run)


def remove_dup_artifacts(dry_run: bool) -> None:
    files = git("ls-files", "-z", "*_1*").split("\0") if not dry_run else []
    for f in files:
        if f:
            run(["git", "rm", "-f", "--", f], check=False, dry_run=dry_run)


def remove_junk(dry_run: bool) -> None:
    tracked = git("ls-files").splitlines() if not dry_run else []
    for p in tracked:
        if any(p == j.rstrip("/") or p.startswith(j) for j in JUNK_PREFIXES):
            run(["git", "rm", "-rf", "--cached", p], check=False, dry_run=dry_run)


def patch_readme(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace("4 标签页 SCADA Dashboard", "5 标签页 SCADA Dashboard（含数据可视化）")
    text = text.replace("1. 四标签页切换无报错", "1. 五标签页切换无报错")
    old = (
        "| 企业风险预测 | 场景切换、上传/模拟数据、风险仪表盘、SHAP、决策卡片、SSE 日志 |\n"
        "| 知识库与记忆 |"
    )
    new = (
        "| 企业风险预测 | 场景切换、上传/模拟数据、风险仪表盘、SHAP、决策卡片、SSE 日志 |\n"
        "| 数据可视化 | 预警趋势、相关性热力图、企业统计分布（读取 `datasets/raw/public`） |\n"
        "| 知识库与记忆 |"
    )
    if old in text:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def port_visualization_router(dry_run: bool) -> None:
    src = ROOT / "api" / "routers" / "visualization.py"
    dest = (
        ROOT
        / "packages/mining_risk_serve/src/mining_risk_serve/api/routers/visualization.py"
    )
    if dry_run or not src.exists():
        return
    text = src.read_text(encoding="utf-8")
    text = text.replace(
        "from utils.logger import get_logger\nfrom utils.config import get_config",
        "from mining_risk_common.utils.logger import get_logger\n"
        "from mining_risk_common.utils.config import get_config, resolve_project_path",
    )
    text = re.sub(
        r"# 项目根目录\nPROJECT_ROOT = .*?\nNEW_DATA_DIR = os\.path\.join\(PROJECT_ROOT, \"new_data\"\)",
        'def _public_data_root() -> str:\n'
        '    config = get_config()\n'
        '    rel = getattr(config.data, "public_data_root", "datasets/raw/public")\n'
        '    return str(resolve_project_path(str(rel)))\n\n\n'
        "NEW_DATA_DIR = _public_data_root()",
        text,
        flags=re.DOTALL,
    )
    if not dry_run:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dry = args.dry_run

    try:
        git("rev-parse", "-q", "--verify", "MERGE_HEAD", dry_run=dry)
    except Exception:
        print("不在 merge 状态，退出。", file=sys.stderr)
        return 1

    conflicts = unmerged() if not dry else []
    ours_batch = [p for p in conflicts if should_ours(p)]
    if ours_batch:
        checkout_ours(ours_batch, dry)

    if not dry and (ROOT / "README.md").exists():
        if "<<<<<<<" in (ROOT / "README.md").read_text(encoding="utf-8"):
            run(["git", "checkout", "--ours", "--", "README.md"])
        patch_readme(ROOT / "README.md")
        run(["git", "add", "README.md"])

    if not dry:
        run(
            [
                "git",
                "show",
                "new_origin/main:frontend/src/pages/VisualizationPage.tsx",
            ],
            check=False,
        )
        viz = ROOT / "frontend/src/pages/VisualizationPage.tsx"
        cp = subprocess.run(
            [
                "git",
                "show",
                "new_origin/main:frontend/src/pages/VisualizationPage.tsx",
            ],
            cwd=ROOT,
            capture_output=True,
        )
        if cp.returncode == 0:
            viz.write_bytes(cp.stdout)

    port_visualization_router(dry)
    remove_dup_artifacts(dry)
    remove_junk(dry)

    remaining = unmerged() if not dry else []
    if remaining:
        print("仍有未合并文件:", *remaining, sep="\n  ")
        return 2
    print("冲突已处理完毕。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
