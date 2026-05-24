import type { HealthResponse, IterationStatus } from "../api/types";

interface Props {
  health: HealthResponse | null;
  iteration: IterationStatus | null;
  pendingApprovals?: number | null;
  demoMode: boolean;
  onDemoToggle: (b: boolean) => void;
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  health,
  iteration,
  pendingApprovals,
  demoMode,
  onDemoToggle,
  open = false,
  onClose,
}: Props) {
  const online = health?.status === "healthy";

  return (
    <aside
      className={`sidebar ${open ? "open" : ""}`}
      aria-label="系统控制侧栏"
    >
      <div className="sidebar-title">风险预警智能体</div>
      <div className="sidebar-subtitle">SCADA DASHBOARD v1.0</div>

      <div
        className={`sidebar-status ${online ? "online" : "offline"}`}
        role="status"
      >
        <span className={`status-dot ${online ? "online" : "offline"}`} aria-hidden="true" />
        <span>{online ? "后端服务正常" : "后端离线（演示数据）"}</span>
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section-title">系统状态</div>
      {iteration ? (
        <>
          <div className="sidebar-state-text">
            {iteration.current_state_cn || iteration.current_state || "未知"}
          </div>
          {(pendingApprovals ?? 0) > 0 ? (
            <div className="sidebar-hint warn">
              待审批: {pendingApprovals} 项（含决策审批）
            </div>
          ) : iteration.pending_approvals && iteration.pending_approvals.length > 0 ? (
            <div className="sidebar-hint warn">
              模型迭代待审批: {iteration.pending_approvals.length} 项
            </div>
          ) : (
            <div className="sidebar-hint">无待审批事项</div>
          )}
        </>
      ) : (
        <div className="sidebar-hint">无法获取迭代状态</div>
      )}

      <div className="sidebar-divider" />
      <div className="sidebar-section-title">路演控制</div>
      <label className="sidebar-demo-label">
        <input
          type="checkbox"
          checked={demoMode}
          onChange={(e) => onDemoToggle(e.target.checked)}
        />
        演示模式（主 Tab 自动轮播）
      </label>
      {demoMode && (
        <div className="sidebar-hint accent">每 12 秒切换主 Tab</div>
      )}

      {open && onClose && (
        <button type="button" className="sidebar-close-btn" onClick={onClose}>
          收起侧栏
        </button>
      )}

      <div className="sidebar-footnote">
        Harness 工程化管控
        <br />
        推荐 1920×1080 投影
      </div>
    </aside>
  );
}
