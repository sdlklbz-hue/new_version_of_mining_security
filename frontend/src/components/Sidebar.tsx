import type { HealthResponse, IterationStatus } from "../api/types";
import { SCENARIO_LABELS } from "../data/demoData";
import type { ScenarioId } from "../api/types";

interface Props {
  health: HealthResponse | null;
  scenario: ScenarioId;
  onScenarioChange: (s: ScenarioId) => void;
  iteration: IterationStatus | null;
  demoMode: boolean;
  onDemoToggle: (b: boolean) => void;
  activeTab: string;
  onTabChange: (id: string) => void;
  navItems: Array<{ id: string; label: string; icon?: string }>;
}

export default function Sidebar({
  health,
  scenario,
  onScenarioChange,
  iteration,
  demoMode,
  onDemoToggle,
  activeTab,
  onTabChange,
  navItems,
}: Props) {
  const online = health?.status === "healthy";
  const activeItem = navItems.find((item) => item.id === activeTab);

  return (
    <aside className="sidebar">
      <div className="sidebar-rail" aria-label="主导航">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-button ${item.id === activeTab ? "active" : ""}`}
            onClick={() => onTabChange(item.id)}
            title={item.label}
          >
            <span className="rail-icon font-mono">{item.icon ?? "□"}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <button className="rail-button muted" type="button" title="系统设置" onClick={() => onTabChange("config")}>
          <span className="rail-icon font-mono">⚙</span>
        </button>
      </div>

      <div className="sidebar-panel">
        <div className="sidebar-title">御界安全中心</div>
        <div className="sidebar-subtitle font-mono">SCADA DASHBOARD V2.4.0</div>

        <div className="sidebar-active-module">
          <span className="font-mono">{activeItem?.icon ?? "◎"}</span>
          <div>
            <div className="sidebar-active-label">{activeItem?.label ?? "控制台"}</div>
            <div className="sidebar-active-sub">当前工作台</div>
          </div>
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section-title">场景配置</div>
        <select
          className="scada-select"
          value={scenario}
          onChange={(e) => onScenarioChange(e.target.value as ScenarioId)}
        >
          {(Object.keys(SCENARIO_LABELS) as ScenarioId[]).map((s) => (
            <option key={s} value={s}>
              {SCENARIO_LABELS[s]}
            </option>
          ))}
        </select>

        <div className="sidebar-divider" />
        <div className="sidebar-section-title">系统状态</div>
        <div className={`sidebar-status-card ${online ? "online" : "offline"}`}>
          <span className={`status-dot ${online ? "online" : "offline"}`}></span>
          <div>
            <div className="sidebar-status-main">
              {online ? "后端服务正常" : "后端离线"}
            </div>
            <div className="sidebar-status-sub">
              {online ? "FastAPI + Uvicorn" : "已启用前端 Mock 降级"}
            </div>
          </div>
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section-title">迭代状态</div>
        {iteration ? (
          <div className="sidebar-metric-card">
            <div className="sidebar-metric-value">
              {iteration.current_state_cn || iteration.current_state || "未知"}
            </div>
            {iteration.pending_approvals && iteration.pending_approvals.length > 0 ? (
              <div className="sidebar-metric-sub warning">
                待审批 {iteration.pending_approvals.length} 项
              </div>
            ) : (
              <div className="sidebar-metric-sub">无待审批事项</div>
            )}
          </div>
        ) : (
          <div className="sidebar-metric-card muted">无法获取迭代状态</div>
        )}

        <div className="sidebar-divider" />
        <div className="sidebar-section-title">路演控制</div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={demoMode}
            onChange={(e) => onDemoToggle(e.target.checked)}
          />
          <span className={`toggle-switch ${demoMode ? "active" : ""}`} />
          <span>演示模式</span>
        </label>
        {demoMode && <div className="sidebar-note">自动轮播已启用</div>}

        <div className="sidebar-footer font-mono">
          HARNESS CONTROL PLANE
          <br />
          1920×1080 READY
        </div>
      </div>
    </aside>
  );
}
