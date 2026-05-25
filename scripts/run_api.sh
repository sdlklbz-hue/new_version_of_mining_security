#!/usr/bin/env bash
# 启动 FastAPI（需已创建 .venv 并安装 workspace 包）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export MINING_PROJECT_ROOT="$ROOT"

if [[ -f "$ROOT/.venv/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/.venv/bin/activate"
fi

if ! python -c "import mining_risk_serve" 2>/dev/null; then
  echo "正在安装 monorepo 包（首次需要）..."
  uv pip install -e packages/mining_risk_common -e packages/mining_risk_train -e packages/mining_risk_serve
fi

# --reload 默认监视 cwd，pip install 会改动 .venv 导致 WatchFiles 无限重载。
# 开发态仅监视源码包，并显式排除虚拟环境与大型产物目录。
RELOAD=0
UVICORN_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--reload" ]]; then
    RELOAD=1
  else
    UVICORN_ARGS+=("$arg")
  fi
done

# macOS 默认 bash 3.2 + set -u：空数组 "${arr[@]}" 会报 unbound variable
uvicorn_base=(mining_risk_serve.api.main:app --host 0.0.0.0 --port 8000)
if ((${#UVICORN_ARGS[@]} > 0)); then
  uvicorn_base+=("${UVICORN_ARGS[@]}")
fi

if [[ "$RELOAD" -eq 1 ]]; then
  exec uvicorn "${uvicorn_base[@]}" \
    --reload \
    --reload-dir "$ROOT/packages/mining_risk_serve/src" \
    --reload-dir "$ROOT/packages/mining_risk_common/src" \
    --reload-exclude '.venv' \
    --reload-exclude '**/.venv/**' \
    --reload-exclude 'node_modules' \
    --reload-exclude '**/node_modules/**' \
    --reload-exclude 'var' \
    --reload-exclude 'artifacts' \
    --reload-exclude 'catboost_info' \
    --reload-exclude 'logs'
fi

exec uvicorn "${uvicorn_base[@]}"
