"""本地启动 FastAPI（无热重载）。推荐: bash scripts/run_api.sh"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
os.environ.setdefault("MINING_PROJECT_ROOT", ROOT)

import uvicorn
from mining_risk_serve.api.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
