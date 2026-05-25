# Frontend (React + Vite SPA)

工矿企业风险预警智能体的独立前端工程。原 Streamlit 单文件版已迁移至 React，
保留 `app_legacy_streamlit.py` 仅作历史参考，**不再纳入 docker-compose 默认启动**。

## 目录

```
frontend/
├── Dockerfile               # 多阶段构建（node 构建 → nginx 托管）
├── nginx.conf               # 反向代理 /api、/health、/docs 至后端
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/                  # 静态资源
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                 # API 分层（详见主 README §12.3）
│   │   ├── http.ts          # 传输层：URL、Admin Token、JSON 解析
│   │   ├── client.ts        # 领域 API 封装、SSE 流式解析
│   │   ├── types.ts         # 业务类型
│   │   └── types/common.ts  # ApiResponse 等通用契约（与后端 schemas 对齐）
│   ├── components/          # SCADA 通用组件、ECharts 图表
│   ├── data/demoData.ts     # 演示企业 / Mock 决策（与后端 demo_data.py 一致）
│   ├── pages/               # 4 个 Tab 页面
│   └── styles/scada.css     # 工业控制室暗色主题
├── demo_data.py             # 后端 prediction.py mock 降级仍依赖此模块
├── __init__.py
└── app_legacy_streamlit.py  # 旧 Streamlit 单文件实现（已停用，仅作参考）
```

## 本地开发

```bash
npm install
npm run dev          # http://localhost:5173 ，Vite 代理 /api 至 http://localhost:8000
```

可通过 `VITE_DEV_API_TARGET` 改写后端地址：

```bash
VITE_DEV_API_TARGET=http://192.168.1.10:8000 npm run dev
```

企业风险地图的 3D 模式使用高德 JS API 2.0。本地开发时在 `frontend/.env.local`
配置 Web 端 JS API Key 与安全密钥：

```bash
VITE_AMAP_KEY=你的Web端JS_API_Key
VITE_AMAP_SECURITY_CODE=你的securityJsCode
```

这些 Vite 变量会进入前端构建产物，仅适合本地或受控演示环境；生产环境建议改为
Nginx 代理注入 `jscode`。

## 生产构建

```bash
npm run build        # 输出到 dist/
npm run preview      # 4173 本地预览
```

## 容器一键部署

直接在 `mining_risk_agent/` 目录执行：

```bash
docker compose up --build
```

- 浏览器访问 `http://localhost:8501`
- 后端 Swagger：`http://localhost:8501/docs` 或 `http://localhost:8000/docs`

## 前端 API 分层

与主项目 `README.md` 第十二章「软件架构与项目结构」对应：

| 层级 | 文件 | 职责 |
|------|------|------|
| 页面/组件 | `src/pages/`、`src/components/` | UI 与交互 |
| 领域 API | `src/api/client.ts` | 预测、知识库、记忆、迭代等业务调用 |
| 传输层 | `src/api/http.ts` | `buildUrl`、`adminHeaders`、`parseJsonOrThrow` |
| 契约类型 | `src/api/types.ts`、`types/common.ts` | 与后端 `api/schemas/` 对齐的 TypeScript 类型 |
