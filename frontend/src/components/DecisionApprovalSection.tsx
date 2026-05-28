import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decideApproval,
  fetchApprovals,
  syncDecisionApprovalsFromDisk,
} from "../api/client";
import { formatFinalStatus } from "../utils/decisionStatus";
import DecisionDetailModal from "./DecisionDetailModal";
import IndustrialIcon from "./IndustrialIcon";

export default function DecisionApprovalSection() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [syncMsg, setSyncMsg] = useState("");
  const [detailTarget, setDetailTarget] = useState<{ recordId: string; enterpriseId?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const resp = await fetchApprovals({ status: filterStatus || undefined, limit: 50 });
    if (resp) {
      setApprovals(resp.items || []);
      setTotal(resp.total);
    }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecide = useCallback(
    async (id: string, decision: string) => {
      const comment = decision === "approved" ? "审批通过" : "需要进一步修改";
      await decideApproval(id, decision, "admin", comment);
      loadData();
    },
    [loadData],
  );

  const handleSyncFromDisk = useCallback(async () => {
    setSyncing(true);
    setSyncMsg("");
    const resp = await syncDecisionApprovalsFromDisk();
    if (resp) {
      const removed = resp.removed ?? 0;
      setSyncMsg(
        `已扫描 ${resp.scanned} 条待审决策，新建 ${resp.created} 条，跳过 ${resp.skipped} 条${
          removed > 0 ? `，清理无效待审批 ${removed} 条` : ""
        }。`,
      );
      loadData();
    } else {
      setSyncMsg("同步失败，请确认管理员令牌与后端服务。");
    }
    setSyncing(false);
  }, [loadData]);

  const recordIdFromApproval = (a: any): string | null => {
    const display = a.decision_display_path || a.decision_path || "";
    if (!display) return null;
    const marker = "decisions/";
    const idx = display.indexOf(marker);
    if (idx >= 0) return display.slice(idx + marker.length);
    const idx2 = (a.decision_path || "").indexOf(marker);
    if (idx2 >= 0) return a.decision_path.slice(idx2 + marker.length);
    const parts = display.split(/[/\\]/);
    return parts[parts.length - 1] || null;
  };

  const sortedApprovals = useMemo(() => {
    return [...approvals].sort((a, b) => {
      const aDecision = a.type === "decision_review" ? 0 : 1;
      const bDecision = b.type === "decision_review" ? 0 : 1;
      if (aDecision !== bDecision) return aDecision - bDecision;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }, [approvals]);

  return (
    <div>
      <div className="scada-card" style={{ marginBottom: 14 }}>
        <div className="risk-report-header">
          <div className="risk-report-title title-with-icon">
            <IndustrialIcon name="list" />
            管理员审批工作流
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="tag tag-orange">
              待审批: {approvals.filter((a) => a.status === "pending").length}
            </span>
            <span className="tag tag-blue">
              决策审批: {approvals.filter((a) => a.type === "decision_review" && a.status === "pending").length}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <select
            className="scada-input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: 120 }}
          >
            <option value="">全部状态</option>
            <option value="pending">待审批</option>
            <option value="approved">已批准</option>
            <option value="rejected">已驳回</option>
          </select>
          <button className="scada-btn secondary" type="button" onClick={loadData} disabled={loading}>
            <IndustrialIcon name="refresh" />
            刷新
          </button>
          <button className="scada-btn" type="button" onClick={handleSyncFromDisk} disabled={syncing}>
            {syncing ? "同步中..." : "同步并清理无效审批"}
          </button>
        </div>
        {syncMsg && <div className="alert info" style={{ marginTop: 10 }}>{syncMsg}</div>}
      </div>

      <div className="scada-card">
        {sortedApprovals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <div>暂无审批记录</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              若已有 HUMAN_REVIEW 历史 JSON，可点击「同步并清理无效审批」补录；删除本地决策 JSON 后刷新或同步即可清除无效待审批。
            </div>
          </div>
        ) : (
          <table className="scada-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>企业 / 目标</th>
                <th>场景 / 等级</th>
                <th>工作流状态</th>
                <th>文件</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedApprovals.map((a) => {
                const isDecision = a.type === "decision_review";
                const recordId = recordIdFromApproval(a);
                return (
                  <tr
                    key={a.id}
                    style={
                      isDecision && a.status === "pending"
                        ? { background: "rgba(245,158,11,0.06)" }
                        : undefined
                    }
                  >
                    <td style={{ fontSize: 11 }}>{isDecision ? "决策审批" : a.action || "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {isDecision ? (
                        <>
                          <div>{a.enterprise_name || a.enterprise_id}</div>
                          <div className="font-mono" style={{ fontSize: 10, color: "#64748b" }}>
                            {a.enterprise_id}
                          </div>
                        </>
                      ) : (
                        a.target_id
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {isDecision ? `${a.scenario_id || "—"} / ${a.predicted_level || "—"}` : a.actor}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {isDecision ? formatFinalStatus(a.final_status || "") : "—"}
                    </td>
                    <td
                      className="font-mono"
                      style={{ fontSize: 10, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
                      title={a.decision_display_path || a.decision_path}
                    >
                      {a.decision_display_path || "—"}
                    </td>
                    <td>
                      <span
                        className="tag"
                        style={{
                          background:
                            a.status === "pending"
                              ? "rgba(245,158,11,0.15)"
                              : a.status === "approved"
                                ? "rgba(16,185,129,0.15)"
                                : "rgba(239,68,68,0.15)",
                          color:
                            a.status === "pending"
                              ? "#f59e0b"
                              : a.status === "approved"
                                ? "#10b981"
                                : "#ef4444",
                          fontWeight: 700,
                        }}
                      >
                        {a.status === "pending" ? "待审批" : a.status === "approved" ? "已批准" : "已驳回"}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "#94a3b8" }}>{a.created_at}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {isDecision && recordId && (
                          <button
                            className="scada-btn secondary"
                            type="button"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                            onClick={() =>
                              setDetailTarget({ recordId, enterpriseId: a.enterprise_id })
                            }
                          >
                            查看决策
                          </button>
                        )}
                        {a.status === "pending" && (
                          <>
                            <button
                              className="scada-btn"
                              style={{ fontSize: 10, padding: "2px 8px", background: "#10b981" }}
                              type="button"
                              onClick={() => handleDecide(a.id, "approved")}
                            >
                              <IndustrialIcon name="approve" />
                              批准
                            </button>
                            <button
                              className="scada-btn"
                              style={{ fontSize: 10, padding: "2px 8px", background: "#ef4444" }}
                              type="button"
                              onClick={() => handleDecide(a.id, "rejected")}
                            >
                              <IndustrialIcon name="reject" />
                              驳回
                            </button>
                          </>
                        )}
                      </div>
                      {a.decided_by && (
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>审批人: {a.decided_by}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>共 {total} 条</div>
      </div>
      {detailTarget && (
        <DecisionDetailModal
          recordId={detailTarget.recordId}
          enterpriseId={detailTarget.enterpriseId}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
