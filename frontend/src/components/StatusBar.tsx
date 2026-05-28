import { useEffect, useState } from "react";
import type { HealthResponse, ScenarioId } from "../api/types";
import BatchJobBanner from "./BatchJobBanner";

const SCENARIO_LABELS: Record<ScenarioId, string> = {
  chemical: "危化品",
  metallurgy: "冶金",
  dust: "粉尘涉爆",
};

interface Props {
  health: HealthResponse | null;
  scenario: ScenarioId;
  onScenarioChange: (s: ScenarioId) => void;
  backendOnline: boolean;
  onOpenRiskTab?: () => void;
}

export default function StatusBar({
  health,
  scenario,
  onScenarioChange,
  backendOnline,
  onOpenRiskTab,
}: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const backendState = health === null ? "checking" : backendOnline ? "online" : "offline";
  const statusText =
    backendState === "checking" ? "检测中" : backendOnline ? "正常" : "离线";
  const dot = backendState === "checking" ? "warn" : backendState;
  const version = health === null ? "..." : health.version ?? "N/A";
  const backendTitle =
    backendState === "checking"
      ? "正在检查 FastAPI /health"
      : backendOnline
        ? "FastAPI /health 已连通"
        : health?.detail ?? "FastAPI /health 未连通";
  const time = now.toLocaleTimeString("zh-CN", { hour12: false });
  const scenes = Object.entries(SCENARIO_LABELS) as Array<[ScenarioId, string]>;

  return (
    <>
      <div className="system-status-bar">
        <div className="top-brand">
          <div className="brand-mark">御界</div>
          <div>
            <div className="brand-name">Yu Jie</div>
            <div className="brand-subtitle font-mono">SECURITY CENTER</div>
          </div>
        </div>

        <nav className="top-scenario-nav" aria-label="场景模式切换">
          {scenes.map(([id, name]) => (
            <button
              key={id}
              type="button"
              className={`top-scenario-item ${scenario === id ? "active" : ""}`}
              onClick={() => onScenarioChange(id)}
            >
              {name}
            </button>
          ))}
        </nav>

        <div className="status-actions">
          <div className={`backend-pill ${backendState}`} title={backendTitle}>
            <span className={`status-dot ${dot}`} />
            <span>后端状态 {statusText}</span>
          </div>
          <div className="status-icon-btn font-mono" title="版本">
            v{version}
          </div>
          <div className="status-icon-btn font-mono" title="系统时间">
            {time}
          </div>
        </div>
      </div>

      {health !== null && !backendOnline && (
        <div className="mock-banner" role="status">
          后端未连接，部分页面将使用本地演示数据。请启动 FastAPI 服务（默认端口
          8000）。
        </div>
      )}
      <BatchJobBanner onOpenRiskTab={onOpenRiskTab} />
    </>
  );
}
