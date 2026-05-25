# mining_risk_agent — Agent 工作指南

工矿企业风险预警智能体 monorepo。本文档供 Cursor / Claude 等 coding agent 在仓库内协作时快速建立上下文，并约定开发流程。

详细用户文档见 [README.md](README.md)、[DEPLOY.md](DEPLOY.md)、[docs/PIPELINE.md](docs/PIPELINE.md)。

---

## 1. 项目是什么

基于 **Harness 工程化管控** 的工矿企业风险预警系统：本地 **Stacking 集成学习** 产出风险等级（蓝/黄/橙/红），**GLM（OpenAI 兼容）** 仅负责结构化处置文案，**MARCH + 蒙特卡洛 + 三维风险** 做三重校验，配套知识库 RAG、记忆归档与模型迭代 CI/CD 演示。

| 能力域 | 实现要点 |
|--------|----------|
| 数据接入 | CSV/Excel/JSON；`DataLoader` 扫描 `datasets/raw/public/`；预合并训练表 `datasets/interim/merged/new_已清洗.xlsx` |
| 特征与预测 | `FeatureEngineeringPipeline` + `StackingRiskModel`（当前 config 配置 **5** 个基学习器：LR、XGBoost、LightGBM、CatBoost、RF） |
| 决策智能体 | LangGraph 五节点 DAG；场景 `chemical` / `metallurgy` / `dust` |
| Harness | AgentFS、P0–P3 短期记忆、长期记忆 RAG（ChromaDB）、三重校验、RKS 驳回沉淀 |
| 知识库 | 6 份主 Markdown（见下）；COM/PHY/SOP 规则库 + 企业条件 + 事故案例 |
| 模型迭代 | 监控触发 → 训练 → 回归/漂移 → 两级审批 → 试运行 → 灰度；`datasets/demo/*.json` 可回放 |
| 前端 | React + Vite + ECharts；Docker 下 Nginx `:8501` 反代 API |
| 风险地图（规划） | Leaflet + OpenStreetMap；`enterprise_db` 经纬度落点 + 模型等级着色；见 **§8** |

---

## 2. 仓库结构

```
mining_risk_agent/
├── packages/
│   ├── mining_risk_common/   # 配置、特征工程、Stacking、DataLoader
│   ├── mining_risk_serve/    # FastAPI、agent/workflow、harness、iteration
│   ├── mining_risk_train/    # 离线训练、回归/漂移、可视化
│   └── mining_risk_compat/   # 旧 mining_risk.* 重导出（勿新写依赖）
├── frontend/                 # React SPA
├── datasets/                 # raw / interim / demo / processed（体量大，慎改）
├── artifacts/                # 模型 pkl、NER、pipeline
├── knowledge_base/           # 六库 Markdown（权威正文源）
├── var/                      # 运行时：chroma、agentfs、decisions（gitignore）
├── scripts/                  # 训练、KB 重建、RAG 索引、审计
├── tests/                    # pytest（314+ 用例，改代码后应跑通）
├── config.yaml               # 特征列、模型、RAG、LLM、场景阈值（权威配置）
├── pyproject.toml            # uv workspace 根
└── docker-compose.yml
```

### 包职责与导入

| 包 | 职责 |
|----|------|
| `mining_risk_common` | `dataplane/`、`model/stacking.py`、`utils/config.py` |
| `mining_risk_serve` | `api/`、`agent/workflow.py`、`harness/`、`iteration/` |
| `mining_risk_train` | `train.py`、`iteration/pipeline.py` |

**禁止**在新代码中使用已废弃路径：

- `api.main` → `mining_risk_serve.api.main`
- `agent.workflow` → `mining_risk_serve.agent.workflow`
- `data.crawler` → `mining_risk_common.dataplane.crawler`
- `mining_risk.*` → 对应 `mining_risk_serve` / `mining_risk_common`（compat 仅过渡）

Mock / patch 目标必须使用真实模块路径（例如 `@patch("mining_risk_serve.agent.workflow._get_memory")`）。

---

## 3. 核心功能与 API 面

启动前设置：

```bash
export MINING_PROJECT_ROOT="$(pwd)"
```

| 服务 | 命令 | 地址 |
|------|------|------|
| API | `bash scripts/run_api.sh [--reload]` | http://localhost:8000/docs |
| 前端 | `cd frontend && npm run dev` | http://localhost:5173 |
| 全栈 Docker | `docker compose up -d --build` | http://localhost:8501 |

### 主要路由前缀

| 前缀 | 内容 |
|------|------|
| `/api/v1/data` | 上传、公开数据扫描 |
| `/api/v1/prediction` | Stacking 预测 + 规则校验 |
| `/api/v1/agent` | 决策工作流、SSE 流、场景切换、决策记录 |
| `/api/v1/knowledge` | 六库 CRUD、**`/system/overview`**、**`/rag/search`** |
| `/api/v1/memory` | 短期/长期记忆、统计 **`/statistics`**、导出 **`/export`** |
| `/api/v1/iteration` | 迭代触发、审批、灰度、demo-batches 回放 |
| `/api/v1/visualization` | 预警趋势、企业统计等图表数据 |
| `/api/v1/audit` | 审计日志 |

敏感写操作需 `X-Admin-Token`（`MRA_ADMIN_TOKEN`）。本地可设 `MRA_ALLOW_UNAUTHENTICATED_ADMIN=true`。

### 决策与 ML 分工（改代码前必读）

- **风险等级**：仅 `StackingRiskModel` + `preprocessing_pipeline.pkl`，GLM **不参与**训练与等级判定。
- **GLM**：仅在 `decision_generation` 节点生成 `government_intervention` / `enterprise_control` JSON。
- **校验**：MARCH、蒙特卡洛、三维风险均为 Harness 规则/采样，非 LLM。

离线训练：`python scripts/train_model.py` → 产物 `artifacts/models/*.pkl` + `artifacts/pipelines/*.pkl`。

### 六库知识文件（`knowledge_base/`）

1. `工矿风险预警智能体合规执行书.md`（COM）
2. `部门分级审核SOP.md`（SOP）
3. `工业物理常识及传感器时间序列逻辑.md`（PHY）
4. `企业已具备的执行条件.md`
5. `类似事故处理案例.md`
6. `预警历史经验与短期记忆摘要.md`

正文以 **文件系统** 为权威源；运行时副本在 AgentFS。修改主库后需同步并视情况重建 RAG。

---

## 4. Agent 工作流程（必须遵守）

### 4.1 接到任务时

1. **明确范围**：预测 / 决策 / 知识库 / 迭代 / 前端 / 数据 — 只改相关包与文件，避免无关 diff。
2. **读配置**：行为以 `config.yaml` 为准；路径可用 `MINING_PROJECT_ROOT`、`MINING_DATASET_ROOT`、`MINING_VAR_ROOT` 覆盖。
3. **读邻近代码**：匹配现有命名、分层（Router → Service → 领域模块）与日志风格。
4. **勿提交**：`.env`、`var/`、`python312/`、`get-pip.py`、Windows 专用脚本、大型二进制；见 `.gitignore`。

### 4.2 环境

```bash
cd mining_risk_agent
uv venv .venv && source .venv/bin/activate
export MINING_PROJECT_ROOT="$(pwd)"

uv pip install -r requirements-serve.txt
uv pip install -e packages/mining_risk_common \
               -e packages/mining_risk_train \
               -e packages/mining_risk_serve

# 跑全量测试时
uv pip install -r requirements-full.txt
```

Python **3.10+**。推荐 `uv`；入口脚本：`bash scripts/run_api.sh`、`python run_api.py`（勿使用硬编码 Windows 路径的 `start.py` 旧写法）。

### 4.3 常见改动场景

| 场景 | 主要位置 | 注意 |
|------|----------|------|
| 新 API | `packages/mining_risk_serve/.../api/routers/` + `schemas/` | 在 `main.py` 注册；前端类型在 `frontend/src/api/types.ts` |
| 决策节点 | `agent/workflow.py` | 保持五节点顺序；mock 测试 patch `mining_risk_serve.agent.workflow` |
| 特征/模型 | `mining_risk_common/dataplane/`、`model/stacking.py` | 改 `config.yaml` `features`；训练后更新 pkl |
| 知识库正文 | `knowledge_base/*.md` 或 `scripts/rebuild_*.py` | 禁止「待填写」占位；避免重复「增量更新」整段 |
| RAG | `harness/vector_store.py`、`scripts/rebuild_rag_index.py` | **嵌入维度一致**：`fallback`(384) vs `bge-large`(1024)；切换须 `--clear` 重建 |
| AgentFS 同步 | `scripts/sync_kb_to_agentfs.py --sync --verify` | 改六库后执行 |
| 演示数据 | `datasets/demo/`（非 `data/demo`） | 迭代回放测试依赖此路径 |
| 前端 | `frontend/src/` | API 基址见 `vite.config` / Nginx 代理 |

### 4.4 知识库与 RAG 维护顺序

修改六库或公开数据衍生库时，建议顺序：

```bash
export MINING_PROJECT_ROOT="$(pwd)"

# 按需要执行（可只跑相关脚本）
python scripts/rebuild_rule_kbs.py
python scripts/rebuild_enterprise_conditions_kb.py
python scripts/rebuild_accident_cases_kb.py

python scripts/sync_kb_to_agentfs.py --sync --verify

# 嵌入后端与索引一致
python scripts/rebuild_rag_index.py --clear --embedding-backend auto   # 或 fallback（CI/离线）

python scripts/audit_knowledge_system.py   # 质量门禁
```

审计脚本：`scripts/audit_knowledge_system.py`（pytest：`tests/test_knowledge_system_audit.py`）。

### 4.5 测试与验证

```bash
export MINING_PROJECT_ROOT="$(pwd)"
# 隔离 LLM 密钥干扰（可选）
export GLM5_API_KEY=test-key

pytest tests/ -q
```

- 改 `mining_risk_common` / `mining_risk_serve` / `scripts/` 后应保证 **全量 tests 通过**。
- 网络/爬虫相关：`tests/test_crawler.py`、`tests/test_nlp_pipeline.py` 可单独忽略（见 README）。
- 单测构造坏 xlsx 请用 **临时目录**，勿依赖已删除的数据集坏文件路径。

### 4.6 Git 与 PR

- **不要**擅自 `git commit` / `git push`，除非用户明确要求。
- 不要 amend 已推送提交；不要改 `git config`。
- PR 说明用完整句子，写清「为什么」；不提交密钥与 `var/` 内容。

### 4.7 代码原则

1. **最小 diff**：只解决当前问题，不顺手重构无关模块。
2. **不过度抽象**：一行能写清的逻辑不要拆成多层 helper。
3. **注释**：仅解释非显而易见的业务或 Harness 约束。
4. **测试**：用户未要求时不堆砌断言显而易见的单测。
5. **兼容**：新功能优先走 `mining_risk_serve` / `mining_risk_common`，避免扩大 `mining_risk_compat` 表面。

---

## 5. 配置与环境变量速查

| 变量 | 用途 |
|------|------|
| `MINING_PROJECT_ROOT` | 仓库根（**必填**，否则路径解析失败） |
| `GLM5_API_KEY` / `LLM_GLM5_*` | GLM 调用 |
| `LLM_PROVIDER` | 切换 LLM 服务商 |
| `LLM_*_API_KEY` | 按 provider 前缀的密钥（优先于全局 `LLM_API_KEY`） |
| `MRA_ENABLE_MOCK_FALLBACK` | API/决策 Mock 降级（默认 true，生产建议 false） |
| `MRA_ADMIN_TOKEN` | 管理接口令牌 |
| `RAG_EMBEDDING_BACKEND` | `auto` / `fallback` / `sentence_transformers` |
| `HF_HOME` | Hugging Face 缓存目录 |

默认值见 `config.yaml` 与 `.env.example`（如 `llm.providers.glm5.model: glm-5.1`）。

---

## 6. 文档索引

| 文档 | 内容 |
|------|------|
| [README.md](README.md) | 安装、API 列表、架构、前端演示 |
| [DEPLOY.md](DEPLOY.md) | 生产部署 |
| [docs/PIPELINE.md](docs/PIPELINE.md) | 训练/推理流水线、字段字典 |
| [datasets/README.md](datasets/README.md) | 数据目录约定 |
| [frontend/README.md](frontend/README.md) | 前端结构 |

---

## 7. 当前仓库健康状态（维护参考）

- 测试：`pytest tests/` 应全部通过（维护后 314 passed）。
- 已清理：嵌入式 `python312/`、`get-pip.py`、Windows 管道测试脚本等不应再入库。
- 入口：`run_api.py` / `scripts/run_api.sh` 使用 `mining_risk_serve.api.main:app`。
- Demo 路径：`datasets/demo/`。
- Stacking 基学习器数量以 **`config.yaml` → `model.stacking.base_learners`** 为准（当前 5 个），与 README 中「7 基学习器」表述可能不一致，改测试时以 config 为准。

若用户只要求文档/评审、不修代码：只读分析，不创建 commit，不扩大改动范围。

---

## 8. 未来发展方向：企业风险实时地图

> **状态**：已实现 v1。当前包含后端 markers API、React Leaflet 地图页、风险筛选与已跟踪企业侧栏；二期可继续做聚类、bbox 分页加载、SSE 增量更新与侧栏一键重新预测。

### 8.1 目标

在 Web 仪表盘增加**实时地图视图**，将 `datasets/enterprise_db/` 下各企业按经纬度落点，并用**颜色 + 文本**展示 Stacking 模型预测风险等级（蓝 / 黄 / 橙 / 红，与 `RiskPredictionPage` 一致）。支持**搜索**与**侧边栏**快速定位「已跟踪预测」的企业（有决策记录或批量预测结果的企业优先展示）。

### 8.2 地图技术（参照 `map.html`）

根目录 [`map.html`](map.html) 为最小可行原型，生产实现应迁入 React 前端，勿长期依赖独立 HTML。

| 项 | 约定 |
|----|------|
| 库 | [Leaflet](https://leafletjs.com/)（与原型一致） |
| 底图 | OpenStreetMap 栅格切片：`https://tile.openstreetmap.org/{z}/{x}/{y}.png`，`attribution: © OpenStreetMap` |
| 默认视野 | 苏州片区中心 `[31.298886, 120.585316]`，初始 `zoom: 11–12`；支持 `fitBounds` 包裹全部有效点位 |
| 依赖 | 前端 `npm install leaflet react-leaflet`（或等价封装），CSS 在 `main.tsx` 全局引入 |

```javascript
// 原型核心（map.html）— 实现时改为 React 组件 + SCADA 容器
const map = L.map('map').setView([31.298886, 120.585316], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
}).addTo(map);
```

### 8.3 数据来源与坐标

| 来源 | 路径 / 说明 |
|------|-------------|
| 企业库 | `datasets/enterprise_db/<文件夹名>/<文件夹名>.json` |
| 索引 | `datasets/enterprise_db/_enterprise_index.json`（列表元数据） |
| 经纬度 | 优先 `详细数据 → 企业生产经营地址` 最新一条的 `经度`、`纬度`；可回退 `企业基本信息` / `企业目录` 中带坐标字段 |
| 历史评级 | `企业评级信息填报` 的 `NEW_LEVEL`（A/B/C/D）仅作对照，**地图主展示以模型 `predicted_level` 为准** |
| 已跟踪企业 | `var/decisions/` 决策 JSON、`/api/v1/agent/decision/records`、批量预测任务产物；侧边栏「已跟踪」= 有 `enterprise_id` 或企业名称匹配预测记录 |

后端可复用现有 `visualization.py` 中 `ENTERPRISE_DB_DIR`、`_load_enterprise_detail()`、`_get_cached_enterprises()`，**新增**地图专用聚合接口（避免前端扫描 500+ JSON）。

### 8.4 建议 API（待实现）

| 接口 | 说明 |
|------|------|
| `GET /api/v1/visualization/enterprise-map/markers` | 返回落点列表：`folder`, `name`, `lat`, `lng`, `industry`, `predicted_level`, `probability`, `tracked`, `last_predicted_at`, `scenario_id` |
| `GET /api/v1/visualization/enterprise-map/markers?tracked_only=true` | 仅已跟踪企业 |
| `POST /api/v1/predict` 或批量预测 | 地图侧栏触发单企业刷新预测时调用；结果写回 markers 缓存 |

聚合逻辑建议：

1. 遍历索引 → 解析坐标（无效/缺失经纬度跳过并计数）。
2. 按企业名称 / `enterprise_id` 关联最近一次 `predicted_level`（决策存储或内存索引）。
3. 无预测记录：灰点或「未预测」样式，仍可在全量列表中选择。

### 8.5 前端 UI 与交互

**入口**：新增主标签「风险地图」或在「数据可视化」下增加子 Tab `地图`（`App.tsx` → `TAB_DEFS` + hash `#map`）。

**布局**（对齐 SCADA 仪表盘，`frontend/src/styles/scada.css`）：

```
┌─────────────────────────────────────────────────────────┐
│ StatusBar + 全局 Sidebar（场景 / 健康）                    │
├──────────┬──────────────────────────────────────────────┤
│ 地图侧栏   │  Leaflet 全宽地图区（ScadaCard 边框 + 深色底） │
│ · 搜索框   │  · 分级图例（蓝黄橙红）                        │
│ · 筛选     │  · 聚类（点位过多时 leaflet.markercluster）    │
│ · 已跟踪列表│  · Marker：颜色=风险等级，Popup=企业名+等级+概率  │
│ · 企业详情  │  · 点击侧栏项 → flyTo + 打开 Popup              │
└──────────┴──────────────────────────────────────────────┘
```

| UI 元素 | 规范 |
|---------|------|
| 风险配色 | 与 `RiskPredictionPage.tsx` 一致：蓝 `#3b82f6`、黄 `#eab308`、橙 `#f97316`、红 `#ef4444`；未预测 `#64748b` |
| Marker | `L.circleMarker` 或自定义 `DivIcon`（内嵌等级汉字）；高等级可加 `glow-red` 类光晕 |
| 侧栏 | 复用 `EnterpriseProfilePage` 搜索/筛选模式；列表项展示名称、行业、`predicted_level` 标签 |
| 查找 | 名称模糊匹配；Enter 或选中后地图定位 |
| 详情 | 点击可打开 `EnterpriseDetailPanel` 或跳转 `#enterprise` 并带 `folder` 参数 |

**实时性**：首版可用轮询（如 30s 刷新 markers）；后续可接 SSE（`/api/v1/agent/decision/stream` 同类）仅更新变更企业。

### 8.6 实现步骤（推荐顺序）

1. **后端** `enterprise-map/markers`：坐标抽取 + 预测等级合并 + 缓存（TTL 与现有 `_CACHE_TTL` 一致）。
2. **前端** `EnterpriseMapPage.tsx` + `react-leaflet`：底图、图例、Marker 层。
3. **侧栏**：跟踪列表 + 搜索，与地图 `selectedFolder` 状态联动。
4. **预测联动**：侧栏「重新预测」调用现有 predict/decision API，更新 Marker 样式。
5. **测试**：markers API 单测；前端 smoke（有点位、筛选、flyTo）。
6. **文档**：README 前端表格增加「风险地图」行；可从仓库删除或归档根目录 `map.html`（逻辑已迁入 SPA）。

### 8.7 Agent 实现本功能时的注意点

- 勿把 Leaflet 脚本硬编码进 `index.html` 而不走 Vite 打包；遵守现有 `frontend/src/api/client.ts` 请求模式。
- 地图页不得阻塞全量加载：markers 接口需分页或按视野 bbox 加载（二期优化）。
- 坐标系默认 WGS84（与公开数据 `经度`/`纬度` 一致）；勿与国内加密坐标混用除非统一转换。
- 新代码与 `CLAUDE.md` §4 流程一致：改 API → 改 types → 改页面 → `pytest` + 前端手动验证。
