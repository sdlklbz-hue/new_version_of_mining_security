"""本地开发启动 FastAPI。推荐: bash scripts/run_api.sh [--reload]"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "mining_risk_serve.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
