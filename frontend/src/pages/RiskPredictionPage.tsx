import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decideApproval,
  fetchApprovals,
  fetchDecisionRecords,
  postDecision,
  streamDecision,
  syncDecisionApprovalsFromDisk,
  uploadDataFile,
} from "../api/client";
import type {
  DecisionRecordSummary,
  DecisionResponse,
  NodeStatus,
  ScenarioId,
} from "../api/types";
import { formatFinalStatus } from "../utils/decisionStatus";
import {
  SCENARIO_NAMES,
  generateMockDecision,
  getDemoDataJson,
} from "../data/demoData";
import ScadaCard from "../components/ScadaCard";
import BatchDecisionPanel from "../components/BatchDecisionPanel";
import { useDecisionBatch } from "../context/DecisionBatchContext";
import { ProbabilityChart, ShapChart } from "../components/charts";
import { formatFeatureLabel } from "../lib/featureLabels";
import JsonView from "../components/JsonView";
import ReactECharts from "echarts-for-react";

interface Props {
  scenario: ScenarioId;
}

const LEVEL_HEX: Record<string, string> = {
  红: "#ef4444",
  橙: "#f97316",
  黄: "#eab308",
  蓝: "#3b82f6",
};

const LEVEL_GLOW: Record<string, string> = {
  红: "glow-red",
  橙: "glow-orange",
  黄: "glow-yellow",
  蓝: "glow-blue",
};

/** 三维风险加权总分上限（与后端 RiskAssessor 一致） */
const THREE_D_SCORE_MAX = 4;

/** Stacking 等级 → 风险权重，用于无三维评分时的加权期望 */
const LEVEL_RISK_WEIGHT: Record<string, number> = {
  红: 1.0,
  橙: 0.75,
  黄: 0.5,
  蓝: 0.25,
};

function getStackingTopProbability(
  dist?: Record<string, number>,
): { level: string; probability: number } | null {
  const entries = Object.entries(dist || {}).sort(([, a], [, b]) => b - a);
  if (!entries.length) return null;
  return { level: entries[0][0], probability: entries[0][1] };
}

function getStackingExpectedRisk(dist?: Record<string, number>): number {
  return Object.entries(dist || {}).reduce((sum, [level, prob]) => {
    const weight = LEVEL_RISK_WEIGHT[level] ?? 0.5;
    return sum + prob * weight;
  }, 0);
}

interface CompositeRiskDisplay {
  gaugeValue: number;
  primaryText: string;
  sourceLabel: string;
  usesThreeD: boolean;
}

function resolveCompositeRisk(decision: DecisionResponse): CompositeRiskDisplay {
  const tdr = decision.three_d_risk;
  if (tdr?.total_score !== undefined) {
    const score = tdr.total_score;
    return {
      gaugeValue: Math.min(score / THREE_D_SCORE_MAX, 1),
      primaryText: score.toFixed(1),
      sourceLabel: `三维加权（满分 ${THREE_D_SCORE_MAX}）`,
      usesThreeD: true,
    };
  }
  const expected = getStackingExpectedRisk(decision.probability_distribution);
  return {
    gaugeValue: expected,
    primaryText: `${(expected * 100).toFixed(0)}%`,
    sourceLabel: "Stacking 等级加权期望",
    usesThreeD: false,
  };
}

type MockSource = "backend" | "frontend" | null;

const DecisionDetailModal = lazy(() => import("../components/DecisionDetailModal"));

export default function RiskPredictionPage({ scenario }: Props) {
  const [enterpriseId, setEnterpriseId] = useState("ENT-DEMO-001");
  const [dataText, setDataText] = useState(() => getDemoDataJson(scenario));
  const [uploadInfo, setUploadInfo] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedRow, setUploadedRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [streamLog, setStreamLog] = useState<NodeStatus[]>([]);
  const [useStream, setUseStream] = useState(true);
  const [mockSource, setMockSource] = useState<MockSource>(null);
  const { batchLoading, batchInfo, batchStatus, startBatch, cancelBatch, clearBatch } =
    useDecisionBatch();
  const batchFinished =
    batchStatus?.status === "completed" ||
    batchStatus?.status === "completed_with_errors" ||
    batchStatus?.status === "cancelled";
  const batchCancelling = batchStatus?.status === "cancelling";
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDataText(getDemoDataJson(scenario));
  }, [scenario]);

  async function handleUpload(file: File) {
    setUploadInfo(`正在上传 ${file.name} ...`);
    const resp = await uploadDataFile(file, enterpriseId);
    if (!resp || !resp.success) {
      setUploadInfo(`上传失败: ${resp?.message ?? "后端无响应"}`);
      setUploadedFile(null);
      setUploadedRow(null);
      return;
    }
    setUploadedFile(file);
    const batchHint =
      resp.rows > 1
        ? `；共 ${resp.rows} 行，可在下方启动批量完整决策`
        : "";
    setUploadInfo(
      `已加载 ${resp.rows} 行 × ${resp.columns} 列（执行预测将仅使用文件首行，不再合并下方 JSON${batchHint}）`,
    );
    if (resp.preview && resp.preview.length > 0) {
      const row = resp.preview[0];
      setUploadedRow(row);
      const ent =
        (row["企业ID"] as string) ||
        (row["enterprise_id"] as string) ||
        (row["enterpriseId"] as string);
      if (ent) setEnterpriseId(String(ent));
    } else {
      setUploadedRow(null);
    }
  }

  function handleTerminatePredict() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError(null);
  }

  async function handlePredict() {
    setError(null);
    let payload: Record<string, unknown>;
    if (uploadedRow) {
      payload = { ...uploadedRow };
    } else {
      try {
        payload = JSON.parse(dataText);
      } catch {
        setError("JSON 格式错误，请检查输入");
        return;
      }
    }
    payload.scenario_id = scenario;

    setLoading(true);
    setStreamLog([]);
    setDecision(null);
    setMockSource(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let result: DecisionResponse | null = null;
    if (useStream) {
      try {
        result = await streamDecision(
          enterpriseId,
          payload,
          (msg) => setStreamLog((prev) => [...prev, msg]),
          ctrl.signal,
          scenario,
        );
      } catch (e) {
        if (ctrl.signal.aborted) {
          setLoading(false);
          return;
        }
        console.warn("SSE 失败，回退至普通请求", e);
      }
    }

    if (!result) {
      if (ctrl.signal.aborted) {
        setLoading(false);
        return;
      }
      result = await postDecision(enterpriseId, payload, scenario, ctrl.signal);
    }
    if (ctrl.signal.aborted) {
      setLoading(false);
      return;
    }
    if (result) {
      setDecision(result);
      setMockSource(result.mock ? "backend" : null);
    } else {
      setError("后端无响应，启用本地 Mock 数据");
      setDecision(generateMockDecision(scenario, enterpriseId));
      setMockSource("frontend");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="section-title">
        🎯 企业风险预测 — 上传数据 → 模型预测 → 决策建议 → 三重风控拦截
      </div>

      <div className="row predict">
        {/* 左侧输入面板 */}
        <div>
          <div className="subtitle">输入面板</div>
          <label className="scada-label">企业 ID</label>
          <input
            className="scada-input"
            value={enterpriseId}
            onChange={(e) => setEnterpriseId(e.target.value)}
          />

          <div style={{ fontSize: 12, color: "#6b7280", margin: "10px 0" }}>
            当前场景:{" "}
            <b style={{ color: "#e5e7eb" }}>{SCENARIO_NAMES[scenario]}</b>
          </div>

          <button
            className="scada-btn secondary"
            type="button"
            onClick={() => {
              setDataText(getDemoDataJson(scenario));
              setUploadedFile(null);
              setUploadedRow(null);
              setUploadInfo("");
            }}
            style={{ marginBottom: 10 }}
          >
            🎲 模拟数据填充
          </button>

          <label className="scada-label">企业数据（JSON）</label>
          <textarea
            className="scada-textarea"
            rows={12}
            value={dataText}
            onChange={(e) => {
              setDataText(e.target.value);
              if (uploadedRow) setUploadedRow(null);
            }}
            disabled={!!uploadedRow}
            style={uploadedRow ? { opacity: 0.5 } : undefined}
          />
          {uploadedRow && (
            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
              已加载上传文件，预测仅使用文件首行。
              <button
                type="button"
                className="scada-btn secondary"
                style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px" }}
                onClick={() => {
                  setUploadedFile(null);
                  setUploadedRow(null);
                  setUploadInfo("");
                }}
              >
                改用手动 JSON
              </button>
            </div>
          )}

          <label className="scada-label" style={{ marginTop: 8 }}>
            上传 CSV/Excel
          </label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.currentTarget.value = "";
            }}
            style={{ color: "#9ca3af", fontSize: 12 }}
          />
          {uploadInfo && (
            <div
              style={{
                fontSize: 11,
                color: "#10b981",
                marginTop: 4,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {uploadInfo}
            </div>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#9ca3af",
              margin: "12px 0 10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={useStream}
              onChange={(e) => setUseStream(e.target.checked)}
            />
            使用 SSE 实时节点流
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="scada-btn"
              type="button"
              onClick={handlePredict}
              disabled={loading}
              style={{ flex: 1, minWidth: 140 }}
            >
              {loading ? "执行中..." : "🚀 执行预测"}
            </button>
            {loading && (
              <button
                className="scada-btn danger"
                type="button"
                onClick={handleTerminatePredict}
              >
                终止任务
              </button>
            )}
          </div>

          {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}

          <div className="scada-card" style={{ marginTop: 14, padding: 12 }}>
            <div className="scada-card-title">批量完整决策</div>
            <div style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 8px" }}>
              使用上方已上传的多行 CSV/Excel，逐家企业运行完整 Agent 工作流，并将 JSON 输出到系统配置页指定的服务端目录。
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="scada-btn secondary"
                type="button"
                disabled={(batchLoading || batchCancelling) || !uploadedFile}
                onClick={() => uploadedFile && startBatch(uploadedFile, scenario)}
                style={{ flex: 1, minWidth: 160 }}
              >
                {batchLoading
                  ? "批量任务运行中..."
                  : batchCancelling
                    ? "正在终止任务…"
                    : "启动批量完整决策"}
              </button>
              {batchLoading && !batchCancelling && (
                <button
                  className="scada-btn danger"
                  type="button"
                  onClick={() => void cancelBatch()}
                >
                  终止任务
                </button>
              )}
              {(batchFinished || batchCancelling) && batchStatus && (
                <button
                  className="scada-btn secondary"
                  type="button"
                  onClick={clearBatch}
                >
                  关闭
                </button>
              )}
            </div>
            {!uploadedFile && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                请先在上方选择 CSV/Excel 文件
              </div>
            )}
            {batchInfo && (
              <div
                className={
                  batchStatus?.status === "cancelled" || batchCancelling
                    ? "alert warning"
                    : undefined
                }
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  color:
                    batchStatus?.status === "cancelled" || batchCancelling
                      ? undefined
                      : "#38bdf8",
                }}
              >
                {batchInfo}
              </div>
            )}
            {batchStatus && !batchFinished && (
              <BatchDecisionPanel status={batchStatus} />
            )}
            {batchStatus && batchFinished && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                任务 {batchStatus.job_id} 已结束（{batchStatus.status}）。
                完成 {batchStatus.completed}，失败 {batchStatus.failed}，取消{" "}
                {batchStatus.results.filter((r) => r.status === "cancelled").length}。
              </div>
            )}
          </div>
        </div>

        {/* 右侧结果区 */}
        <div>
          {loading && streamLog.length === 0 && <SpinnerBox />}
          {!loading && !decision && streamLog.length === 0 && (
            <div className="empty-state">
              👈 在左侧输入企业数据并点击「执行预测」查看结果
            </div>
          )}
          {streamLog.length > 0 && !decision && (
            <div className="scada-card" style={{ marginBottom: 12 }}>
              <div className="scada-card-title">📡 SSE 实时节点</div>
              <TimelineLogs nodes={streamLog} />
            </div>
          )}
          {decision && (
            <DecisionView
              decision={decision}
              streamLog={streamLog}
              mockSource={mockSource}
            />
          )}
        </div>
      </div>

      <HistoryDecisionSection />
    </div>
  );
}

function HistoryDecisionSection() {
  const [items, setItems] = useState<DecisionRecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const [detailTarget, setDetailTarget] = useState<{ recordId: string; enterpriseId?: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const resp = await fetchDecisionRecords({
      final_status: filterStatus || undefined,
      enterprise_id: enterpriseFilter.trim() || undefined,
      limit: 50,
      offset: 0,
    });
    if (resp) {
      setItems(resp.items || []);
      setTotal(resp.total);
    }
    setLoading(false);
  }, [filterStatus, enterpriseFilter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleQuickDecide = useCallback(
    async (record: DecisionRecordSummary, decision: "approved" | "rejected") => {
      let approvals = await fetchApprovals({ status: "pending", limit: 200 });
      let match = approvals?.items?.find(
        (a) =>
          a.type === "decision_review" &&
          (a.decision_path?.includes(record.record_id) ||
            a.decision_display_path?.includes(record.record_id)),
      );
      if (!match) {
        await syncDecisionApprovalsFromDisk();
        approvals = await fetchApprovals({ status: "pending", limit: 200 });
        match = approvals?.items?.find(
          (a) =>
            a.type === "decision_review" &&
            (a.decision_path?.includes(record.record_id) ||
              a.decision_display_path?.includes(record.record_id)),
        );
      }
      if (!match) {
        setSyncMsg("未找到对应审批项，请先在「审批管理」中从磁盘同步。");
        return;
      }
      await decideApproval(match.id, decision, "admin", decision === "approved" ? "历史决策批准" : "历史决策驳回");
      setSyncMsg("");
      loadRecords();
    },
    [loadRecords],
  );

  return (
    <div className="scada-card" style={{ marginTop: 20 }}>
      <div className="risk-report-header">
        <div className="risk-report-title">📁 历史决策记录</div>
        <button className="scada-btn secondary" type="button" onClick={loadRecords} disabled={loading}>
          🔄 刷新
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input
          className="scada-input"
          placeholder="企业 ID 筛选"
          value={enterpriseFilter}
          onChange={(e) => setEnterpriseFilter(e.target.value)}
          style={{ width: 160 }}
        />
        <select
          className="scada-input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="">全部状态</option>
          <option value="HUMAN_REVIEW">待人工审批</option>
          <option value="APPROVE">已通过</option>
          <option value="REJECT">已驳回</option>
        </select>
        <button className="scada-btn secondary" type="button" onClick={loadRecords}>
          筛选
        </button>
      </div>
      {syncMsg && (
        <div className="alert info" style={{ marginTop: 10 }}>
          {syncMsg}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#94a3b8", margin: "10px 0" }}>
        共 {total} 条（含批量任务子目录）
      </div>
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">暂无历史决策 JSON</div>
      ) : (
        <table className="scada-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>时间</th>
              <th>企业</th>
              <th>场景</th>
              <th>等级</th>
              <th>状态</th>
              <th>来源</th>
              <th>Mock</th>
              <th>审批</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.record_id}>
                <td style={{ fontSize: 11, color: "#94a3b8" }}>{row.created_at}</td>
                <td>
                  <div>{row.enterprise_name || row.enterprise_id}</div>
                  <div className="font-mono" style={{ fontSize: 10, color: "#64748b" }}>
                    {row.enterprise_id}
                  </div>
                </td>
                <td>{row.scenario_id}</td>
                <td>{row.predicted_level}</td>
                <td>
                  <span
                    className="tag"
                    style={{
                      background:
                        row.final_status === "HUMAN_REVIEW"
                          ? "rgba(245,158,11,0.15)"
                          : row.final_status === "REJECT"
                            ? "rgba(239,68,68,0.15)"
                            : "rgba(16,185,129,0.15)",
                      color:
                        row.final_status === "HUMAN_REVIEW"
                          ? "#f59e0b"
                          : row.final_status === "REJECT"
                            ? "#ef4444"
                            : "#10b981",
                    }}
                  >
                    {formatFinalStatus(row.final_status)}
                  </span>
                </td>
                <td>{row.source || "—"}</td>
                <td>{row.mock ? "是" : "否"}</td>
                <td>
                  {row.approval_status === "approved"
                    ? "已批准"
                    : row.approval_status === "rejected"
                      ? "已驳回"
                      : row.final_status === "HUMAN_REVIEW"
                        ? "待审批"
                        : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      className="scada-btn secondary"
                      type="button"
                      style={{ fontSize: 10, padding: "2px 8px" }}
                      onClick={() =>
                        setDetailTarget({ recordId: row.record_id, enterpriseId: row.enterprise_id })
                      }
                    >
                      详情
                    </button>
                    {row.final_status === "HUMAN_REVIEW" && !row.approval_status && (
                      <>
                        <button
                          className="scada-btn"
                          type="button"
                          style={{ fontSize: 10, padding: "2px 8px", background: "#10b981" }}
                          onClick={() => handleQuickDecide(row, "approved")}
                        >
                          批准
                        </button>
                        <button
                          className="scada-btn"
                          type="button"
                          style={{ fontSize: 10, padding: "2px 8px", background: "#ef4444" }}
                          onClick={() => handleQuickDecide(row, "rejected")}
                        >
                          驳回
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detailTarget && (
        <Suspense fallback={null}>
          <DecisionDetailModal
            recordId={detailTarget.recordId}
            enterpriseId={detailTarget.enterpriseId}
            onClose={() => setDetailTarget(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

function SpinnerBox() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      <div className="tech-spinner" />
      <div
        style={{
          marginTop: 16,
          fontSize: 13,
          color: "#9ca3af",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        SYSTEM INITIALIZING WORKFLOW...
      </div>
    </div>
  );
}

interface DecisionProps {
  decision: DecisionResponse;
  streamLog: NodeStatus[];
  mockSource?: MockSource;
  inModal?: boolean;
}

export function DecisionView({ decision, streamLog, mockSource }: DecisionProps) {
  const level = decision.predicted_level || "未知";
  const hex = LEVEL_HEX[level] ?? "#6b7280";
  const glow = LEVEL_GLOW[level] ?? "glow-white";
  const isRed = level === "红";
  const isMock = !!decision.mock;
  const failedNode = streamLog.find((n) => n.status === "failed");
  const mockReason = failedNode
    ? `${failedNode.node} 节点失败：${failedNode.error ?? failedNode.detail ?? "未知错误"}`
    : null;

  const finalNodes = useMemo(() => {
    if (streamLog.length > 0) return streamLog;
    return decision.node_status ?? [];
  }, [streamLog, decision.node_status]);

  return (
    <div>
      <div
        className={`scada-card ${isRed ? "risk-red-pulse" : ""}`}
        style={{
          textAlign: "center",
          padding: 20,
          background: "#111827",
          border: `1px solid ${hex}`,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#9ca3af",
            marginBottom: 8,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {decision.enterprise_id} | {SCENARIO_NAMES[decision.scenario_id as ScenarioId] ?? decision.scenario_id}
          {isMock && <span className="mock-tag">MOCK</span>}
        </div>
        <div
          className={glow}
          style={{
            fontSize: 40,
            fontWeight: 800,
            fontFamily: "JetBrains Mono, monospace",
            lineHeight: 1,
          }}
        >
          {level}级风险
        </div>
        <div style={{ marginTop: 12 }}>
          <span
            style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: hex,
            }}
          >
            {formatFinalStatus(decision.final_status || "")}
          </span>
        </div>
      </div>

      {decision.final_status === "HUMAN_REVIEW" && (
        <div className="alert info" style={{ marginBottom: 12 }}>
          工作流判定为待人工审批。若已启用决策落盘，该记录将自动加入审批队列，可在「预警经验与记忆 → 审批管理」处理。
        </div>
      )}

      {isMock && (
        <div className="alert info">
          {mockSource === "frontend" ? (
            <>
              当前为前端本地 Mock 数据：后端 API 完全无响应，已使用 <code>demoData.ts</code> 兜底渲染。
              请检查后端是否已启动、是否监听 8000 端口、CORS 是否放行当前来源。
            </>
          ) : (
            <>
              当前为后端 Mock 降级数据：决策工作流执行未通过校验，已按
              <code>MRA_ENABLE_MOCK_FALLBACK=true</code> 策略返回 Mock。
              {mockReason ? <>实际失败原因：<strong>{mockReason}</strong>。</> : null}
              生产环境可设置 <code>MRA_ENABLE_MOCK_FALLBACK=false</code> 让失败以 503 显式暴露，
              并检查模型 pkl 是否 fitted、<code>GLM5_API_KEY</code> 是否配置。
            </>
          )}
        </div>
      )}

      <KpiCards decision={decision} />

      <RiskScorePanel decision={decision} />

      <div className="row cols-2" style={{ marginTop: 16 }}>
        {decision.probability_distribution && (
          <ProbabilityChart
            probs={decision.probability_distribution}
            centerLevel={level}
          />
        )}
        {decision.shap_contributions && decision.shap_contributions.length > 0 && (
          <ShapChart contributions={decision.shap_contributions} topN={5} />
        )}
      </div>

      <DecisionAdvice decision={decision} />

      <div className="subtitle" style={{ marginTop: 16 }}>
        🔒 风控拦截状态
      </div>
      <ValidationCards decision={decision} />

      <details open style={{ marginTop: 16 }}>
        <summary
          style={{
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          📡 SSE 实时日志（工作流节点执行状态）
        </summary>
        <TimelineLogs nodes={finalNodes} />
      </details>

      <details style={{ marginTop: 12 }}>
        <summary
          style={{
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          🔍 原始决策 JSON
        </summary>
        <JsonView data={decision} />
      </details>
    </div>
  );
}

function KpiCards({ decision }: { decision: DecisionResponse }) {
  const stackingTop = getStackingTopProbability(decision.probability_distribution);
  const modelProbText = stackingTop
    ? `${(stackingTop.probability * 100).toFixed(0)}%`
    : "—";
  const tdr = decision.three_d_risk;
  const mc = decision.monte_carlo_result;
  const mcPassRate =
    mc?.confidence !== undefined ? `${(mc.confidence * 100).toFixed(0)}%` : "—";

  return (
    <div className="row cols-4">
      <ScadaCard
        title="判定状态"
        value={formatFinalStatus(decision.final_status || "") || "—"}
        glowClass="glow-blue"
      />
      <ScadaCard
        title="模型主类概率"
        value={modelProbText}
        sub={
          stackingTop
            ? `Stacking · 预测 ${stackingTop.level}`
            : undefined
        }
        glowClass="glow-green"
      />
      <ScadaCard
        title="三维风险"
        value={tdr?.risk_level ?? "—"}
        sub={tdr?.total_score !== undefined ? `score=${tdr.total_score}` : undefined}
        glowClass={tdr?.blocked ? "glow-red" : "glow-yellow"}
      />
      <ScadaCard
        title="蒙特卡洛通过率"
        value={mcPassRate}
        sub={
          mc
            ? `采样 ${mc.valid_count ?? "—"}/${mc.total_samples ?? mc.n_samples ?? "—"}${
                mc.threshold !== undefined
                  ? ` · 阈值 ${(mc.threshold * 100).toFixed(0)}%`
                  : ""
              }`
            : undefined
        }
        glowClass={mc?.passed ? "glow-green" : "glow-orange"}
      />
    </div>
  );
}

function DecisionAdvice({ decision }: { decision: DecisionResponse }) {
  const gov = decision.government_intervention;
  const ent = decision.enterprise_control;
  if (!gov && !ent) return null;
  return (
    <div className="row cols-2" style={{ marginTop: 12 }}>
      {gov && (
        <div className="advice-card" style={{ borderLeftColor: "#ef4444" }}>
          <div className="advice-card-title">🏛️ 政府干预建议</div>
          {gov.department_primary?.name && (
            <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 4 }}>
              <b>{gov.department_primary.name}</b>
              {gov.department_primary.contact_role && (
                <span style={{ color: "#9ca3af", marginLeft: 6 }}>
                  ({gov.department_primary.contact_role})
                </span>
              )}
            </div>
          )}
          {gov.department_primary?.action && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
              {gov.department_primary.action}
            </div>
          )}
          {gov.actions && gov.actions.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#d1d5db" }}>
              {gov.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {gov.deadline_hours !== undefined && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#f97316",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              ⏱ 处置期限: {gov.deadline_hours} 小时
            </div>
          )}
        </div>
      )}
      {ent && (
        <div className="advice-card" style={{ borderLeftColor: "#3b82f6" }}>
          <div className="advice-card-title">🏭 企业管控建议</div>
          {ent.equipment_id && (
            <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 4 }}>
              <b>设备:</b> {ent.equipment_id}
            </div>
          )}
          {ent.operation && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
              {ent.operation}
            </div>
          )}
          {ent.parameters && (
            <pre
              style={{
                fontSize: 11,
                background: "#0f172a",
                padding: 8,
                borderRadius: 4,
                color: "#9ca3af",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(ent.parameters, null, 2)}
            </pre>
          )}
          {ent.personnel_actions && ent.personnel_actions.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#d1d5db" }}>
              {ent.personnel_actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ValidationCards({ decision }: { decision: DecisionResponse }) {
  const items = [
    {
      title: "MARCH 三重隔离校验",
      passed: decision.march_result?.passed,
      detail: decision.march_result?.reason,
      extra:
        decision.march_result?.retry_count !== undefined
          ? `retry: ${decision.march_result.retry_count}`
          : undefined,
    },
    {
      title: "蒙特卡洛采样通过率",
      passed: decision.monte_carlo_result?.passed,
      detail: decision.monte_carlo_result?.status,
      extra:
        decision.monte_carlo_result?.confidence !== undefined
          ? `通过率 ${(decision.monte_carlo_result.confidence * 100).toFixed(0)}% / 阈值 ${
              decision.monte_carlo_result.threshold !== undefined
                ? `${(decision.monte_carlo_result.threshold * 100).toFixed(0)}%`
                : "—"
            }`
          : undefined,
    },
    {
      title: "三维风险评估",
      passed: decision.three_d_risk?.blocked === false,
      detail: decision.three_d_risk?.risk_level,
      extra: decision.three_d_risk?.reason,
    },
  ];
  return (
    <div className="row cols-3">
      {items.map((it, idx) => {
        const cls =
          it.passed === undefined ? "" : it.passed ? "passed" : "failed";
        const status =
          it.passed === undefined
            ? "未执行"
            : it.passed
            ? "✅ 通过"
            : "❌ 拦截";
        const color =
          it.passed === undefined
            ? "#9ca3af"
            : it.passed
            ? "#10b981"
            : "#ef4444";
        return (
          <div className={`validation-card ${cls}`} key={idx}>
            <div className="v-title">{it.title}</div>
            <div className="v-status" style={{ color }}>
              {status}
            </div>
            {it.detail && <div className="v-detail">{it.detail}</div>}
            {it.extra && <div className="v-detail">{it.extra}</div>}
          </div>
        );
      })}
    </div>
  );
}

function TimelineLogs({ nodes }: { nodes: NodeStatus[] }) {
  if (!nodes || nodes.length === 0) {
    return <div style={{ color: "#6b7280", fontSize: 12 }}>暂无节点数据</div>;
  }
  return (
    <div className="timeline-container">
      {nodes.map((ns, idx) => {
        const cls = ns.status === "completed"
          ? "completed"
          : ns.status === "failed"
          ? "failed"
          : ns.status === "running"
          ? "running"
          : "";
        const icon = ns.status === "completed"
          ? "✓"
          : ns.status === "failed"
          ? "✗"
          : "⟳";
        return (
          <div className={`timeline-node ${cls}`} key={idx}>
            <div>
              <div className="node-name">
                {icon} {ns.node}
              </div>
              {ns.detail && <div className="node-detail">{ns.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RISK_LEVELS_CONFIG = [
  { key: "红", label: "红色预警", color: "#ef4444", bg: "rgba(239,68,68,0.12)", range: "≥ 0.80", desc: "极高风险，需立即处置" },
  { key: "橙", label: "橙色预警", color: "#f97316", bg: "rgba(249,115,22,0.12)", range: "0.60-0.79", desc: "高风险，需限期整改" },
  { key: "黄", label: "黄色预警", color: "#eab308", bg: "rgba(234,179,8,0.12)", range: "0.40-0.59", desc: "中等风险，需加强监控" },
  { key: "蓝", label: "蓝色预警", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", range: "0.20-0.39", desc: "低风险，常规巡检" },
];

function RiskScorePanel({ decision }: { decision: DecisionResponse }) {
  const tdr = decision.three_d_risk;
  const mc = decision.monte_carlo_result;
  const level = decision.predicted_level || "未知";
  const stackingTop = getStackingTopProbability(decision.probability_distribution);
  const composite = resolveCompositeRisk(decision);

  const levelColor = LEVEL_HEX[level] ?? "#64748b";
  const levelInfo = RISK_LEVELS_CONFIG.find((l) => l.key === level);

  const severity = tdr?.severity === "极高" ? 0.9 : tdr?.severity === "高" ? 0.7 : tdr?.severity === "中" ? 0.5 : tdr?.severity === "低" ? 0.3 : 0;
  const relevance = tdr?.relevance === "极高" ? 0.9 : tdr?.relevance === "高" ? 0.7 : tdr?.relevance === "中" ? 0.5 : tdr?.relevance === "低" ? 0.3 : 0;
  const irreversibility = tdr?.irreversibility === "极高" ? 0.9 : tdr?.irreversibility === "高" ? 0.7 : tdr?.irreversibility === "中" ? 0.5 : tdr?.irreversibility === "低" ? 0.3 : 0;

  const gaugeOption = useMemo(() => ({
    backgroundColor: "transparent",
    series: [{
      type: "gauge" as const,
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 1,
      radius: "90%",
      progress: {
        show: true,
        width: 14,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: "#10b981" },
              { offset: 0.4, color: "#eab308" },
              { offset: 0.7, color: "#f97316" },
              { offset: 1, color: "#ef4444" },
            ],
          },
        },
      },
      axisLine: { lineStyle: { width: 14, color: [[1, "#1e293b"]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: true,
        fontSize: 32,
        fontWeight: 800,
        fontFamily: "JetBrains Mono, monospace",
        color: levelColor,
        offsetCenter: [0, "10%"],
        formatter: () =>
          composite.gaugeValue > 0 ? composite.primaryText : "—",
      },
      data: [{ value: composite.gaugeValue }],
    }],
  }), [composite, levelColor]);

  const radarOption = useMemo(() => ({
    backgroundColor: "transparent",
    radar: {
      indicator: [
        { name: "严重性", max: 1 },
        { name: "相关性", max: 1 },
        { name: "不可逆性", max: 1 },
      ],
      shape: "polygon" as const,
      splitNumber: 4,
      axisName: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1e293b" } },
      splitArea: { areaStyle: { color: ["transparent"] } },
      axisLine: { lineStyle: { color: "#1e293b" } },
    },
    series: [{
      type: "radar" as const,
      data: [{
        value: [severity, relevance, irreversibility],
        name: "三维风险",
        areaStyle: {
          color: {
            type: "radial" as const,
            x: 0.5, y: 0.5, r: 0.5,
            colorStops: [
              { offset: 0, color: "rgba(239,68,68,0.3)" },
              { offset: 1, color: "rgba(59,130,246,0.1)" },
            ],
          },
        },
        lineStyle: { color: "#f97316", width: 2 },
        itemStyle: { color: "#f97316" },
      }],
    }],
  }), [severity, relevance, irreversibility]);

  const shapFactors = (decision.shap_contributions || []).map((s) => ({
    name: formatFeatureLabel(s.feature),
    value: Math.abs(s.contribution),
    color: s.contribution >= 0 ? "#ef4444" : "#10b981",
  }));
  const topShapFactors = shapFactors.slice(0, 5);
  const maxShapValue = Math.max(...topShapFactors.map((f) => f.value), 1e-9);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="subtitle">🎯 风险评分与等级分析</div>
      <div className="row cols-3">
        <div className="scada-card">
          <div className="risk-report-title" style={{ marginBottom: 4 }}>
            综合风险评分
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            {composite.sourceLabel}
          </div>
          <div className="risk-gauge-container" style={{ padding: "10px 0" }}>
            <div style={{ width: 200, height: 160 }}>
              <ReactECharts option={gaugeOption} style={{ height: "100%" }} />
            </div>
            {levelInfo && (
              <div
                className="risk-level-badge"
                style={{
                  background: levelInfo.bg,
                  color: levelInfo.color,
                  border: `1px solid ${levelInfo.color}44`,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: levelInfo.color, display: "inline-block" }} />
                {levelInfo.label}
              </div>
            )}
          </div>
        </div>

        <div className="scada-card">
          <div className="risk-report-title" style={{ marginBottom: 12 }}>
            三维风险雷达
          </div>
          <ReactECharts option={radarOption} style={{ height: 200 }} />
          {tdr?.total_score !== undefined && (
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <span className="tag tag-amber">
                三维评分: {tdr.total_score.toFixed(1)}
              </span>
              {tdr.blocked && (
                <span className="tag tag-red" style={{ marginLeft: 6 }}>
                  已拦截
                </span>
              )}
            </div>
          )}
        </div>

        <div className="scada-card">
          <div className="risk-report-title" style={{ marginBottom: 12 }}>
            风险因子贡献度
          </div>
          {topShapFactors.map((factor, idx) => (
            <div key={idx} className="risk-factor-item">
              <div className="risk-factor-name">{factor.name}</div>
              <div className="risk-factor-bar">
                <div
                  className="risk-factor-fill"
                  style={{
                    width: `${(factor.value / maxShapValue) * 100}%`,
                    background: factor.color,
                  }}
                />
              </div>
              <div className="risk-factor-value" style={{ color: factor.color }}>
                {factor.value.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="risk-report-section" style={{ marginTop: 14 }}>
        <div className="risk-report-header">
          <div className="risk-report-title">📋 风险分析报告</div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className={`tag tag-${level === "红" ? "red" : level === "橙" ? "orange" : level === "黄" ? "amber" : "blue"}`}>
              等级: {levelInfo?.label ?? level}
            </span>
            {mc && (
              <span className={`tag ${mc.passed ? "tag-emerald" : "tag-red"}`}>
                蒙特卡洛: {mc.passed ? "通过" : "未通过"} (
                {mc.confidence !== undefined
                  ? `${(mc.confidence * 100).toFixed(0)}%`
                  : "—"}
                )
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: "#d1d5db" }}>
          <p style={{ margin: "0 0 6px" }}>
            企业 <b style={{ color: "#f1f5f9" }}>{decision.enterprise_id}</b> 风险评估完成，
            Stacking 预测等级为 <b style={{ color: levelColor }}>{level}级</b>
            {stackingTop && (
              <>
                ，主类概率{" "}
                <b style={{ color: levelColor }}>
                  {(stackingTop.probability * 100).toFixed(0)}%
                </b>
              </>
            )}
            ；综合风险评分{" "}
            <b style={{ color: levelColor }}>{composite.primaryText}</b>
            {composite.usesThreeD ? ` / ${THREE_D_SCORE_MAX}` : ""}（
            {composite.sourceLabel}）。
          </p>
          {decision.risk_level_and_attribution?.root_cause && (
            <p style={{ margin: "0 0 6px" }}>
              根因分析：<b style={{ color: "#fca5a5" }}>{decision.risk_level_and_attribution.root_cause}</b>
            </p>
          )}
          {tdr && (
            <p style={{ margin: "0 0 6px" }}>
              三维风险评估：严重性 <b>{tdr.severity}</b>、相关性 <b>{tdr.relevance}</b>、
              不可逆性 <b>{tdr.irreversibility}</b>，分级 <b>{tdr.risk_level}</b>
              {tdr.blocked ? " — 触发拦截" : " — 未触发拦截"}。
            </p>
          )}
          {level === "红" && (
            <p style={{ margin: 0, color: "#fca5a5" }}>
              ⚠️ 建议立即启动应急响应，执行人员撤离与设备断电操作，同步通知属地应急管理部门。
            </p>
          )}
          {level === "橙" && (
            <p style={{ margin: 0, color: "#fdba74" }}>
              ⚡ 建议限期整改，72小时内组织专项检查，加强重点设备监控频次。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
