import { downloadDecisionBatch } from "../api/client";
import type { BatchJobStatus } from "../api/types";

export default function BatchDecisionPanel({ status }: { status: BatchJobStatus }) {
  const done = status.completed + status.failed;
  const percent = status.total > 0 ? Math.round((done / status.total) * 100) : 0;
  const recent = status.results.slice(0, 8);

  async function handleDownload() {
    const blob = await downloadDecisionBatch(status.job_id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${status.job_id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#94a3b8",
        }}
      >
        <span>任务 {status.job_id}</span>
        <span>{percent}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: "#1e293b",
          borderRadius: 999,
          overflow: "hidden",
          margin: "6px 0",
        }}
      >
        <div
          style={{ width: `${percent}%`, height: "100%", background: "#38bdf8" }}
        />
      </div>
      <div style={{ fontSize: 11, color: status.status === "cancelling" ? "#fbbf24" : "#94a3b8" }}>
        {status.status === "cancelling"
          ? `正在终止：收尾中 ${status.running}，已完成 ${status.completed}，已取消 ${status.results.filter((r) => r.status === "cancelled").length}，总数 ${status.total}`
          : `状态 ${status.status}，完成 ${status.completed}，失败 ${status.failed}，运行中 ${status.running}，总数 ${status.total}`}
      </div>
      {status.manifest_path && (
        <div
          className="font-mono"
          style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}
        >
          manifest: {status.manifest_path}
        </div>
      )}
      {recent.length > 0 && (
        <table className="scada-table" style={{ marginTop: 8, fontSize: 11 }}>
          <thead>
            <tr>
              <th>企业</th>
              <th>状态</th>
              <th>等级</th>
              <th>输出</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((item) => (
              <tr key={`${item.row_index}-${item.enterprise_id}`}>
                <td>{item.enterprise_id}</td>
                <td>{item.status}</td>
                <td>{item.risk_level || "-"}</td>
                <td
                  className="font-mono"
                  style={{
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.output_path || item.error || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(status.status === "completed" ||
        status.status === "completed_with_errors") && (
        <button
          className="scada-btn secondary"
          type="button"
          onClick={handleDownload}
          style={{ marginTop: 8 }}
        >
          下载批量结果 ZIP
        </button>
      )}
    </div>
  );
}
