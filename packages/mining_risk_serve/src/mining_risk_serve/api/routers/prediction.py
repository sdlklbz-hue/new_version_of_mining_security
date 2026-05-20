"""
风险预测路由 + GLM-5 决策智能体 Workflow 路由

Router 层仅负责 HTTP 绑定；业务逻辑见 ``api.services.prediction_service``。
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from mining_risk_serve.api.schemas.prediction import (
    DecisionRequest,
    DecisionResponse,
    DecisionSettingsResponse,
    DecisionSettingsUpdate,
    BatchDecisionResponse,
    BatchJobStatus,
    LLMConfigResponse,
    LLMUpdateRequest,
    PredictRequest,
    PredictResponse,
    QueryRequest,
    ScenarioSwitchResponse,
)
from mining_risk_serve.api.security import require_admin_token
from mining_risk_serve.api.services.decision_batch_service import get_batch_service
from mining_risk_serve.api.services.decision_store import get_decision_settings, update_decision_settings
from mining_risk_serve.api.services.prediction_service import PredictionService, get_prediction_service
from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()
agent_router = APIRouter()


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: PredictRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> PredictResponse:
    """风险预测接口（传统堆叠模型链路）。"""

    try:
        return service.predict(request)
    except Exception as exc:
        logger.error("预测失败: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/query")
async def query_history(
    request: QueryRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> List[Dict[str, Any]]:
    """预警历史查询（演示占位）。"""

    return service.query_history(request.enterprise_id, request.risk_level)


@agent_router.post("/decision", response_model=DecisionResponse)
async def decision(
    request: DecisionRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> DecisionResponse:
    """
    触发完整决策工作流。

    默认保留演示降级；生产环境可设置 ``MRA_ENABLE_MOCK_FALLBACK=false``，
    使 Workflow 失败时返回 503，避免真实故障被 HTTP 200 掩盖。
    """

    return await service.run_decision(request)


@agent_router.post("/decision/stream")
async def decision_stream(
    request: DecisionRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> StreamingResponse:
    """SSE 流式输出决策工作流节点状态。"""

    return StreamingResponse(
        service.decision_stream(request),
        media_type="text/event-stream",
    )


@agent_router.post("/decision/batch", response_model=BatchDecisionResponse)
async def create_decision_batch(
    file: UploadFile = File(...),
    scenario_id: str = Form("chemical"),
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> BatchDecisionResponse:
    """上传 CSV/Excel 并创建批量完整决策任务。"""

    return await get_batch_service(service).create_job(file, scenario_id)


@agent_router.get("/decision/batch/{job_id}", response_model=BatchJobStatus)
async def decision_batch_status(
    job_id: str,
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> BatchJobStatus:
    """查询批量完整决策任务状态。"""

    return get_batch_service(service).get_status(job_id)


@agent_router.get("/decision/batch/{job_id}/download")
async def download_decision_batch(
    job_id: str,
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> FileResponse:
    """下载批量完整决策任务输出 ZIP。"""

    zip_path = get_batch_service(service).zip_path(job_id)
    return FileResponse(path=zip_path, filename=zip_path.name, media_type="application/zip")


@agent_router.get("/decision/settings", response_model=DecisionSettingsResponse)
async def decision_settings(
    _: None = Depends(require_admin_token),
) -> DecisionSettingsResponse:
    """返回完整决策结果输出设置。"""

    return DecisionSettingsResponse(**get_decision_settings())


@agent_router.put("/decision/settings", response_model=DecisionSettingsResponse)
async def update_decision_output_settings(
    request: DecisionSettingsUpdate,
    _: None = Depends(require_admin_token),
) -> DecisionSettingsResponse:
    """更新完整决策结果输出设置。"""

    try:
        settings = update_decision_settings(request.model_dump(exclude_unset=True))
        return DecisionSettingsResponse(**settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@agent_router.get("/llm", response_model=LLMConfigResponse)
async def get_llm_config(
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> LLMConfigResponse:
    """返回当前 LLM 提供方与模型配置。"""

    return service.get_llm_config()


@agent_router.post("/llm/{provider}", response_model=LLMConfigResponse)
async def switch_llm_provider(
    provider: str,
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> LLMConfigResponse:
    """切换当前运行时 LLM 提供方。"""

    return service.switch_llm_provider(provider)


@agent_router.post("/llm", response_model=LLMConfigResponse)
async def update_llm_config(
    request: LLMUpdateRequest,
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> LLMConfigResponse:
    """创建或更新 OpenAI 兼容 LLM provider 并切换为当前运行时配置。"""

    return service.update_llm_config(request)


@agent_router.post("/scenario/{scenario_id}", response_model=ScenarioSwitchResponse)
async def switch_scenario(
    scenario_id: str,
    _: None = Depends(require_admin_token),
    service: PredictionService = Depends(get_prediction_service),
) -> ScenarioSwitchResponse:
    """切换当前场景配置（chemical / metallurgy / dust）。"""

    return service.switch_scenario(scenario_id)
