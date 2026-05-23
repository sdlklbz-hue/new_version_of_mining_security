import { useEffect, useState } from "react";
import type { HealthResponse } from "../api/types";

interface Props {
  health: HealthResponse | null;
  scenarioName: string;
}

export default function StatusBar({ health, scenarioName }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const online = health?.status === "healthy";
  const statusText = online ? "正常" : "离线";
  const dot = online ? "online" : "offline";
  const version = health?.version ?? "—";
  const time = now.toLocaleTimeString("zh-CN", { hour12: false });
  const sceneNames = ["危险化学品", "冶金", "粉尘涉爆"];

  return (
    <div className="system-status-bar">
      <div className="top-brand">
        <div className="brand-mark">御界</div>
        <div>
          <div className="brand-name">Yu Jie</div>
          <div className="brand-subtitle font-mono">SECURITY CENTER</div>
        </div>
      </div>
      <nav className="top-scenario-nav" aria-label="场景导航">
        {sceneNames.map((name) => (
          <span
            key={name}
            className={`top-scenario-item ${scenarioName === name ? "active" : ""}`}
          >
            {name}
          </span>
        ))}
      </nav>
      <div className="top-search" aria-hidden="true">
        <span className="top-search-icon">⌕</span>
        <span>查询系统...</span>
      </div>
      <div className="status-actions">
        <div className={`backend-pill ${online ? "online" : "offline"}`}>
          <span className={`status-dot ${dot}`}></span>
          <span>后端状态: {statusText}</span>
        </div>
        <div className="status-icon-btn font-mono" title="版本">
          v{version}
        </div>
        <div className="status-icon-btn font-mono" title="系统时间">
          {time}
        </div>
        <div className="status-alert" title="预警中心">
          !
        </div>
      </div>
    </div>
  );
}
