"""FastAPI 主应用入口。

负责创建应用实例、注册 CORS、挂载各业务路由（数据、预测、知识库、记忆、
审计、智能体、模型迭代）以及全局健康检查与异常处理。
"""

import os
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mining_risk_common.compat.pickle_legacy import register_legacy_pickle_modules

register_legacy_pickle_modules()

from mining_risk_serve.api.exception_handlers import register_exception_handlers
from mining_risk_serve.api.routers import audit, data, iteration, knowledge, memory, prediction
from mining_risk_serve.api.routers.prediction import agent_router
from mining_risk_serve.api.schemas.common import HealthPayload
from mining_risk_common.utils.config import get_config, resolve_project_path
from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)

_RAG_ENV_SWITCHES = ("RAG_ENABLED", "MINING_RAG_ENABLED", "HARNESS_RAG_ENABLED")


def _rag_enabled_from_env_or_config(config) -> bool:
    """读取长期记忆 RAG 开关（环境变量优先于 config.yaml）。"""
    for name in _RAG_ENV_SWITCHES:
        raw = os.getenv(name)
        if raw is not None:
            return raw.strip().lower() in {"1", "true", "yes", "on", "y"}
    rag_cfg = config.harness.memory.long_term.rag
    return bool(rag_cfg.get("enabled", True))


def _log_rag_startup_status(config) -> None:
    """启动时检查 RAG 依赖与向量索引，便于排查「召回为空」。"""
    if not _rag_enabled_from_env_or_config(config):
        logger.info("长期记忆 RAG 已通过配置关闭（RAG_ENABLED 等）")
        return

    rag_cfg = config.harness.memory.long_term.rag
    persist = resolve_project_path(str(rag_cfg.get("persist_directory", "var/chroma")))
    db_file = persist / "chroma.sqlite3"
    if not db_file.exists():
        logger.warning(
            "RAG 索引尚未建立（%s 不存在）。"
            "请安装 requirements-rag.txt 后执行: python scripts/rebuild_rag_index.py",
            db_file,
        )
        return

    try:
        from mining_risk_serve.harness.vector_store import VectorStore

        backend = (
            os.getenv("RAG_EMBEDDING_BACKEND")
            or os.getenv("MINING_RAG_EMBEDDING_BACKEND")
            or str(rag_cfg.get("embedding_backend", "auto"))
        ).strip().lower()
        if backend == "auto":
            backend = "fallback"
        store = VectorStore(embedding_backend=backend)
        count = store.collection.count()
        if count == 0:
            logger.warning(
                "RAG 索引为空（collection=%s）。请执行: python scripts/rebuild_rag_index.py --clear",
                store.collection_name,
            )
        else:
            logger.info("RAG 索引已就绪: %d chunks @ %s", count, persist)
    except ImportError as exc:
        logger.warning(
            "RAG 依赖未安装，长期记忆召回与校验向量检索将不可用。"
            "请执行: pip install -r requirements-rag.txt （%s）",
            exc,
        )
    except Exception as exc:
        logger.warning("RAG 启动检查失败（不影响 API 启动）: %s", exc)


def _uvicorn_reload_options() -> dict:
    """开发态 reload 仅监视源码包，避免 .venv / var / logs 等触发无限重载。"""
    root = resolve_project_path(".")
    return {
        "reload_dirs": [
            str(root / "packages" / "mining_risk_serve" / "src"),
            str(root / "packages" / "mining_risk_common" / "src"),
        ],
        "reload_excludes": [
            ".venv",
            "**/.venv/**",
            "node_modules",
            "**/node_modules/**",
            "var",
            "artifacts",
            "catboost_info",
            "logs",
        ],
    }


def _get_cors_origins() -> List[str]:
    """从环境变量解析允许的 CORS 来源列表。

    读取 ``MRA_CORS_ORIGINS``（逗号分隔）；未设置时使用本地 Streamlit/Vite 默认地址。

    Returns:
        List[str]: 去重且去空白后的 Origin URL 列表。
    """

    raw = os.getenv(
        "MRA_CORS_ORIGINS",
        "http://localhost:8501,http://127.0.0.1:8501,http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用实例（含 lifespan、CORS、路由与异常处理器）。

    Returns:
        FastAPI: 可用于 uvicorn 挂载的 ASGI 应用对象。
    """

    config = get_config()
    
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(f"{config.project.name} v{config.project.version} 启动中...")
        _log_rag_startup_status(config)
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
    
    # 注册路由
    app.include_router(data.router, prefix="/api/v1/data", tags=["数据管理"])
    app.include_router(prediction.router, prefix="/api/v1/prediction", tags=["风险预测"])
    app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["知识库"])
    app.include_router(memory.router, prefix="/api/v1/memory", tags=["记忆系统"])
    app.include_router(audit.router, prefix="/api/v1/audit", tags=["审计日志"])
    app.include_router(agent_router, prefix="/api/v1/agent", tags=["决策智能体"])
    app.include_router(iteration.router, prefix="/api/v1/iteration", tags=["模型迭代"])
    app.include_router(memory.router, prefix="/api/v1/memory", tags=["记忆库管理"])

    register_exception_handlers(app)

    @app.get("/health", response_model=HealthPayload)
    async def health_check() -> HealthPayload:
        """健康检查端点。"""

        return HealthPayload(status="healthy", version=config.project.version)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    config = get_config()
    reload_kwargs = _uvicorn_reload_options() if config.api.reload else {}
    uvicorn.run(
        "mining_risk_serve.api.main:app",
        host=config.api.host,
        port=config.api.port,
        reload=config.api.reload,
        workers=config.api.workers,
        **reload_kwargs,
    )
