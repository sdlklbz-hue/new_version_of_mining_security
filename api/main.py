"""
FastAPI 主应用
提供异步接口服务 + 前端静态文件托管
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.routers import audit, data, iteration, knowledge, memory, prediction, visualization
from api.routers.prediction import agent_router
from utils.config import get_config
from utils.logger import get_logger

logger = get_logger(__name__)

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _get_cors_origins() -> List[str]:
    raw = os.getenv(
        "MRA_CORS_ORIGINS",
        "http://localhost:8501,http://127.0.0.1:8501,http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    """创建 FastAPI 应用实例"""
    config = get_config()
    
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(f"{config.project.name} v{config.project.version} 启动中...")
        yield
        logger.info("应用关闭")
    
    app = FastAPI(
        title=config.project.name,
        version=config.project.version,
        docs_url=config.api.docs_url,
        openapi_url=config.api.openapi_url,
        lifespan=lifespan,
    )
    
    cors_origins = _get_cors_origins()

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials="*" not in cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # 注册 API 路由
    app.include_router(data.router, prefix="/api/v1/data", tags=["数据管理"])
    app.include_router(prediction.router, prefix="/api/v1/prediction", tags=["风险预测"])
    app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["知识库"])
    app.include_router(audit.router, prefix="/api/v1/audit", tags=["审计日志"])
    app.include_router(agent_router, prefix="/api/v1/agent", tags=["决策智能体"])
    app.include_router(iteration.router, prefix="/api/v1/iteration", tags=["模型迭代"])
    app.include_router(memory.router, prefix="/api/v1/memory", tags=["记忆库管理"])
    app.include_router(visualization.router, prefix="/api/v1/visualization", tags=["数据可视化"])
    
    @app.get("/health")
    async def health_check() -> Dict[str, str]:
        return {"status": "healthy", "version": config.project.version}
    
    # 托管前端静态文件（JS/CSS）
    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend_assets")

        @app.get("/favicon.svg")
        async def favicon():
            return FileResponse(str(FRONTEND_DIST / "favicon.svg"))

        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("health") or full_path in ("docs", "openapi.json", "redoc"):
                raise HTTPException(status_code=404, detail="Not found")
            file_path = FRONTEND_DIST / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(str(file_path))
            return FileResponse(str(FRONTEND_DIST / "index.html"))
    
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    config = get_config()
    uvicorn.run(
        "api.main:app",
        host=config.api.host,
        port=config.api.port,
        reload=config.api.reload,
        workers=config.api.workers,
    )
