"""
配置加载模块
加载并解析 config.yaml 中的全局配置参数
"""

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, Field, model_validator

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in minimal runtimes
    load_dotenv = None

def _find_project_root() -> Path:
    """定位项目根目录。

优先读取环境变量 ``MINING_PROJECT_ROOT``；否则从当前文件向上
查找包含 ``config.yaml`` 的目录。

Returns:
    Path: 仓库根路径。"""

    env_root = os.getenv("MINING_PROJECT_ROOT")
    if env_root:
        return Path(env_root).resolve()
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / "config.yaml").is_file():
            return parent
    return here.parents[4]


PROJECT_ROOT = _find_project_root()
if load_dotenv is not None:
    load_dotenv(PROJECT_ROOT / ".env")


def resolve_project_path(path: str | Path) -> Path:
    """将配置中的相对路径解析为基于项目根的绝对路径。

Args:
    path (str | Path): 相对或绝对路径。

Returns:
    Path: 解析后的绝对路径。"""

    path_obj = Path(path)
    if path_obj.is_absolute():
        return path_obj.resolve()
    return (PROJECT_ROOT / path_obj).resolve()


class ProjectConfig(BaseModel):
    """
    项目元信息（名称、版本、调试开关）。
    """

    name: str
    version: str
    debug: bool = False


class PathsConfig(BaseModel):
    """顶层路径根，支持通过环境变量在部署时覆盖。"""


    dataset_root: str = "datasets"
    var_root: str = "var"
    artifacts_root: str = "artifacts"

    @model_validator(mode="after")
    def _apply_env_override(self) -> "PathsConfig":
        """从环境变量覆盖路径/LLM 等配置字段（Pydantic ``model_validator``）。

Returns:
    Self: 更新后的配置实例。"""

        env_dataset = os.getenv("MINING_DATASET_ROOT")
        env_var = os.getenv("MINING_VAR_ROOT")
        env_artifacts = os.getenv("MINING_ARTIFACTS_ROOT")
        if env_dataset:
            self.dataset_root = env_dataset
        if env_var:
            self.var_root = env_var
        if env_artifacts:
            self.artifacts_root = env_artifacts
        return self


class DecisionConfig(BaseModel):
    """完整决策结果持久化与批量处理配置。"""

    output_dir: str = "var/decisions"
    persist_enabled: bool = True
    batch_max_concurrency: int = 3
    batch_max_rows: int = 500

    @model_validator(mode="after")
    def _apply_env_override(self) -> "DecisionConfig":
        """从环境变量覆盖决策输出目录。"""

        env_output_dir = os.getenv("MINING_DECISION_OUTPUT_DIR")
        if env_output_dir:
            self.output_dir = env_output_dir
        return self


class DataConfig(BaseModel):
    """
    数据集路径、编码与表关联配置。
    """

    public_data_root: Optional[str] = None
    all_public_data_paths: Optional[List[str]] = None
    raw_data_path: str
    reference_data_path: str
    merged_data_path: Optional[str] = None  # 预合并训练集路径（new_已清洗.xlsx）
    supported_formats: List[str]
    encoding: str = "utf-8-sig"
    csv_encoding_fallbacks: List[str] = Field(
        default_factory=lambda: ["utf-8-sig", "utf-8", "gb18030", "gbk"]
    )
    batch_size: int = 1000
    table_join_keys: Optional[Dict[str, Any]] = None  # 各原始表的主键/外键映射


class FeatureConfig(BaseModel):
    """
    特征列定义与缺失值、离群处理策略。
    """

    target_column: str = "new_level"  # 目标列（A/B/C/D）
    id_columns: List[str]
    binary_columns: List[str]
    numeric_columns: List[str]
    enum_columns: List[str]
    text_columns: List[str]
    industry_columns: List[str]
    special_features: Optional[Dict[str, Any]] = None  # 特殊逻辑特征列显式映射
    missing_value_strategy: Dict[str, Any]
    outlier_clip_quantile: float = 0.99


class BaseLearnerConfig(BaseModel):
    """Stacking 基学习器配置（名称、算法类型与超参）。"""

    name: str
    type: str
    params: Dict[str, Any] = Field(default_factory=dict)


class MetaLearnerConfig(BaseModel):
    """Stacking 元学习器配置（算法类型与超参）。"""

    type: str
    params: Dict[str, Any] = Field(default_factory=dict)


class CVConfig(BaseModel):
    """交叉验证折数与是否打乱配置。"""

    n_splits: int = 5
    shuffle: bool = False


class SplitRatioConfig(BaseModel):
    """训练/验证/测试集划分比例。"""

    train: float = 0.7
    val: float = 0.2
    test: float = 0.1


class StackingConfig(BaseModel):
    """堆叠模型整体配置（基学习器、元学习器、路径等）。"""

    base_learners: List[BaseLearnerConfig]
    meta_learner: MetaLearnerConfig
    cv: CVConfig
    split_ratio: SplitRatioConfig
    model_path: str
    pipeline_path: str


class ModelConfig(BaseModel):
    """模型相关顶层配置（堆叠、风险等级、行业系数）。"""

    stacking: StackingConfig
    risk_levels: List[str]
    industry_risk_coefficients: Dict[str, Any]


class AgentFSConfig(BaseModel):
    """AgentFS 虚拟文件系统路径与快照策略。"""

    db_path: str
    snapshot_interval: int
    git_repo_path: str
    snapshots_dir: str = "var/snapshots"


class ShortTermMemoryConfig(BaseModel):
    """短期记忆容量、清理策略与优先级。"""

    max_tokens: int
    safety_threshold: float
    cleanup_strategy: str
    priority_levels: Dict[str, Any]


class LongTermMemoryConfig(BaseModel):
    """长期记忆知识文件与 RAG 检索配置。"""

    knowledge_files: List[str]
    archive_files: Optional[List[str]] = None
    rag: Dict[str, Any]


class MemoryConfig(BaseModel):
    """短期与长期记忆子配置集合。"""

    short_term: ShortTermMemoryConfig
    long_term: LongTermMemoryConfig


class MarchConfig(BaseModel):
    """MARCH 三重隔离校验开关与检查层级。"""

    enabled: bool
    check_levels: List[str]


class MonteCarloConfig(BaseModel):
    """蒙特卡洛校验采样数、置信阈值与风险维度。"""

    enabled: bool
    n_samples: int
    confidence_threshold: float
    risk_dimensions: List[Dict[str, Any]]


class ValidationConfig(BaseModel):
    """决策校验流水线（MARCH + 蒙特卡洛）配置。"""

    march: MarchConfig
    monte_carlo: MonteCarloConfig


class GitFlowConfig(BaseModel):
    """模型迭代 Git 分支命名规范。"""

    main_branch: str
    dev_branch: str
    feature_branch_prefix: str
    release_branch_prefix: str


class CIConfig(BaseModel):
    """模型迭代 CI 流水线与回归测试配置。"""

    enabled: bool
    pipeline: List[str]
    regression: Dict[str, Any]


class ApprovalConfig(BaseModel):
    """模型上线审批层级与试运行时长。"""

    levels: List[Dict[str, Any]]
    trial_period_hours: int


class ModelIterationConfig(BaseModel):
    """模型迭代管控（Git/CI/审批）配置。"""

    git_flow: GitFlowConfig
    ci: CIConfig
    approval: ApprovalConfig


class HarnessConfig(BaseModel):
    """Harness 子系统（AgentFS/记忆/校验/迭代）顶层配置。"""

    agentfs: AgentFSConfig
    memory: MemoryConfig
    validation: ValidationConfig
    model_iteration: ModelIterationConfig


class APIConfig(BaseModel):
    """FastAPI 服务监听地址、文档路径与 worker 数。"""

    host: str
    port: int
    reload: bool
    workers: int
    docs_url: str
    openapi_url: str


class FrontendConfig(BaseModel):
    """Streamlit 前端端口与展示元信息。"""

    port: int
    title: str
    page_icon: str


class LoggingConfig(BaseModel):
    """日志级别、格式、文件路径与轮转策略。"""

    level: str
    format: str
    file: str
    max_bytes: int
    backup_count: int


class AuditConfig(BaseModel):
    """审计日志数据库路径与保留策略。"""

    db_path: str
    retention_days: int
    auto_archive: bool


class DataSourceConfig(BaseModel):
    """迭代数据源类型与演示回放目录。"""

    type: str = "demo_replay"
    demo_dir: str = "datasets/demo"
    reports_dir: str = "reports/demo_replay"


class MonitorConfig(BaseModel):
    """线上监控样本阈值与 F1 告警阈值。"""

    sample_threshold: int = 5000
    f1_threshold: float = 0.85
    db_path: str = "var/audit/audit.db"


class ApproversConfig(BaseModel):
    """审批流程中安全/技术负责人联系邮箱。"""

    security: str = "security@example.com"
    tech: str = "tech@example.com"


class CanaryConfig(BaseModel):
    """灰度发布流量比例阶梯。"""

    ratios: List[float] = Field(default_factory=lambda: [0.0, 0.1, 0.5, 1.0])


class StagingConfig(BaseModel):
    """预发环境观察时长与采样间隔。"""

    duration_hours: int = 24
    sample_interval_minutes: int = 5


class SMTPConfig(BaseModel):
    """审批通知邮件 SMTP 连接参数。"""

    host: str = ""
    port: int = 587
    use_tls: bool = True
    username: str = ""
    password: str = ""
    from_addr: str = Field(default="agent@example.com", alias="from")


class IterationConfig(BaseModel):
    """模型迭代闭环（数据源/监控/灰度/邮件）配置。"""

    data_source: DataSourceConfig = Field(default_factory=DataSourceConfig)
    monitor: MonitorConfig = Field(default_factory=MonitorConfig)
    approvers: ApproversConfig = Field(default_factory=ApproversConfig)
    canary: CanaryConfig = Field(default_factory=CanaryConfig)
    staging: StagingConfig = Field(default_factory=StagingConfig)
    smtp: SMTPConfig = Field(default_factory=SMTPConfig)
    webhook_url: str = ""


def _env_prefix(provider: str) -> str:
    """将 provider 名称转换为环境变量前缀（大写、下划线分隔）。

Args:
    provider (str): LLM 服务商名称。

Returns:
    str: 如 ``GLM5``、``OPENAI``。"""

    return re.sub(r"[^A-Z0-9]+", "_", provider.upper()).strip("_")


class LLMProviderConfig(BaseModel):
    """单个 LLM 服务商的模型名、密钥与端点。"""

    model: str = ""
    api_key: str = ""
    api_key_env: str = ""
    base_url: str = ""
    default_temperature: float = 0.3
    default_max_tokens: int = 8192
    max_retries: int = 3


class LLMConfig(BaseModel):
    """多服务商 LLM 配置与当前激活 provider。"""

    provider: str = "glm5"
    providers: Dict[str, LLMProviderConfig] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _apply_env_override(self) -> "LLMConfig":
        """读取 ``MINING_*`` 环境变量并覆盖路径根配置。"""

        env_provider = os.getenv("LLM_PROVIDER")
        if env_provider:
            self.provider = env_provider
        self.provider = self.provider.lower()

        self.providers = {
            name.lower(): cfg for name, cfg in self.providers.items()
        }
        if not self.providers:
            self.providers[self.provider] = LLMProviderConfig(
                model=os.getenv("LLM_MODEL", self.provider),
                base_url=os.getenv("LLM_BASE_URL", ""),
            )
        if self.provider not in self.providers:
            self.providers[self.provider] = LLMProviderConfig(
                model=os.getenv("LLM_MODEL", self.provider),
                base_url=os.getenv("LLM_BASE_URL", ""),
            )

        for name, cfg in self.providers.items():
            prefix = _env_prefix(name)
            env_key = (
                os.getenv(cfg.api_key_env)
                if cfg.api_key_env
                else None
            ) or os.getenv(f"LLM_{prefix}_API_KEY")
            env_model = os.getenv(f"LLM_{prefix}_MODEL")
            env_base_url = os.getenv(f"LLM_{prefix}_BASE_URL")

            if name == self.provider:
                env_key = os.getenv("LLM_API_KEY") or env_key or os.getenv("OPENAI_API_KEY")
                env_model = os.getenv("LLM_MODEL") or env_model
                env_base_url = os.getenv("LLM_BASE_URL") or env_base_url

            if env_key:
                cfg.api_key = env_key
            if env_model:
                cfg.model = env_model
            if env_base_url:
                cfg.base_url = env_base_url
        return self

    @property
    def active(self) -> LLMProviderConfig:
        """
                当前激活的 LLM 服务商配置。
            
                Returns:
                    LLMProviderConfig: 与 provider 字段对应的配置。
        """
        return self.providers[self.provider]

    @property
    def available_provider_names(self) -> List[str]:
        """
                已配置的全部 LLM 服务商名称列表。
            
                Returns:
                    List[str]: 排序后的 provider 名称。
        """
        return sorted(self.providers.keys())


class SingleScenarioConfig(BaseModel):
    """单一场景（危化/冶金/粉尘）的 KB 与阈值配置。"""

    name: str
    kb_subdir: str
    prompt_template: str
    checker_strictness: str
    confidence_threshold: float
    risk_threshold: float
    memory_top_k: int


class ScenariosConfig(BaseModel):
    """三类行业场景的集合配置。"""

    chemical: SingleScenarioConfig
    metallurgy: SingleScenarioConfig
    dust: SingleScenarioConfig


class AppConfig(BaseModel):
    """应用全局配置根对象，对应 config.yaml 结构。"""

    project: ProjectConfig
    paths: PathsConfig = Field(default_factory=PathsConfig)
    decision: DecisionConfig = Field(default_factory=DecisionConfig)
    data: DataConfig
    features: FeatureConfig
    model: ModelConfig
    harness: HarnessConfig
    llm: LLMConfig = Field(default_factory=LLMConfig)
    scenarios: ScenariosConfig
    api: APIConfig
    frontend: FrontendConfig
    logging: LoggingConfig
    audit: AuditConfig
    iteration: IterationConfig = Field(default_factory=IterationConfig)


class ConfigManager:
    """配置管理器单例类"""


    _instance: Optional["ConfigManager"] = None
    _config: Optional[AppConfig] = None

    def __new__(cls, config_path: Optional[str] = None) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, config_path: Optional[str] = None):
        """初始化 ConfigManager；参数含义见类型注解与类文档。"""
        if self._config is not None:
            return
        if config_path is None:
            # 默认从项目根目录加载（src/mining_risk/utils/config.py → 向上 4 层）
            config_path = PROJECT_ROOT / "config.yaml"
        self.load_config(str(config_path))

    def load_config(self, config_path: str) -> None:
        """从 YAML 文件加载并解析为 ``AppConfig``。

Args:
    config_path (str): ``config.yaml`` 文件路径。

Raises:
    FileNotFoundError: 配置文件不存在。"""

        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        self._config = AppConfig(**raw)

    @property
    def config(self) -> AppConfig:
        """
                已加载的应用配置对象。
            
                Returns:
                    AppConfig: 全局配置根对象。
            
                Raises:
                    RuntimeError: 尚未 load_config 时。
        """
        if self._config is None:
            raise RuntimeError("配置尚未加载")
        return self._config


def get_config() -> AppConfig:
    """获取全局 ``AppConfig`` 单例的便捷函数。

Returns:
    AppConfig: 已通过 ``ConfigManager`` 加载的配置对象。"""

    return ConfigManager().config
