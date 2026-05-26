import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cancelDecisionBatch,
  createDecisionBatch,
  createEnterpriseMapBatchPredict,
  fetchDecisionBatchStatus,
} from "../api/client";
import type { EnterpriseMapBatchPredictRequest } from "../api/types";
import type { BatchJobStatus, ScenarioId } from "../api/types";

function isBatchTerminal(status: string | undefined): boolean {
  return (
    status === "completed" ||
    status === "completed_with_errors" ||
    status === "cancelled"
  );
}

function isBatchCancelling(status: string | undefined): boolean {
  return status === "cancelling";
}

/** 终止请求已发出时，将 running 状态规范为 cancelling，避免界面仍显示 running。 */
function normalizeBatchStatus(
  status: BatchJobStatus,
  cancelRequested: boolean,
): BatchJobStatus {
  if (!cancelRequested) return status;
  if (status.status === "cancelled" || status.status === "completed" || status.status === "completed_with_errors") {
    return status;
  }
  const results = status.results.map((item) => {
    if (item.status === "queued") return { ...item, status: "cancelled" };
    if (item.status === "running") return { ...item, status: "cancelling" };
    return item;
  });
  const nextStatus =
    status.status === "running" || status.status === "queued"
      ? status.running > 0
        ? "cancelling"
        : "cancelled"
      : status.status;
  return { ...status, status: nextStatus, results };
}

interface DecisionBatchContextValue {
  batchLoading: boolean;
  batchInfo: string;
  batchStatus: BatchJobStatus | null;
  startBatch: (file: File, scenario: ScenarioId) => Promise<void>;
  startMapBatch: (params: Omit<EnterpriseMapBatchPredictRequest, "scenario_id"> & { scenario: ScenarioId }) => Promise<void>;
  cancelBatch: () => Promise<void>;
  clearBatch: () => void;
}

const DecisionBatchContext = createContext<DecisionBatchContextValue | null>(null);

export function DecisionBatchProvider({ children }: { children: ReactNode }) {
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchInfo, setBatchInfo] = useState("");
  const [batchStatus, setBatchStatus] = useState<BatchJobStatus | null>(null);
  const cancelRequestedRef = useRef(false);

  const applyStatus = useCallback((raw: BatchJobStatus | null) => {
    if (!raw) {
      setBatchStatus(null);
      return;
    }
    setBatchStatus(normalizeBatchStatus(raw, cancelRequestedRef.current));
  }, []);

  const startBatch = useCallback(async (file: File, scenario: ScenarioId) => {
    setBatchLoading(true);
    setBatchInfo(`正在创建批量完整决策任务：${file.name}`);
    cancelRequestedRef.current = false;
    setBatchStatus(null);
    const resp = await createDecisionBatch(file, scenario);
    if (!resp?.success) {
      setBatchInfo("批量任务创建失败，请确认后端服务与管理员令牌配置。");
      setBatchLoading(false);
      return;
    }
    setBatchInfo(resp.message);
    const firstStatus = await fetchDecisionBatchStatus(resp.job_id);
    applyStatus(firstStatus);
  }, [applyStatus]);

  const startMapBatch = useCallback(
    async (params: Omit<EnterpriseMapBatchPredictRequest, "scenario_id"> & { scenario: ScenarioId }) => {
      setBatchLoading(true);
      const countHint =
        params.folders && params.folders.length > 0
          ? `${params.folders.length} 家已选企业`
          : "当前筛选结果";
      setBatchInfo(`正在创建企业地图批量模型预测任务（${countHint}，不调用 GLM）…`);
      cancelRequestedRef.current = false;
      setBatchStatus(null);
      const { scenario, ...rest } = params;
      const result = await createEnterpriseMapBatchPredict({
        ...rest,
        scenario_id: scenario,
      });
      if (!result.ok) {
        const tokenHint =
          result.status === 401 || result.status === 503
            ? "请在后端 .env 设置 MRA_ADMIN_TOKEN（或 MRA_ALLOW_UNAUTHENTICATED_ADMIN=true），并在 frontend/.env.local 设置相同值的 VITE_ADMIN_API_TOKEN，然后重启 API 与 npm run dev。"
            : "请确认后端服务已启动（http://localhost:8000/health）。";
        setBatchInfo(`批量模型预测任务创建失败：${result.detail}。${tokenHint}`);
        setBatchLoading(false);
        return;
      }
      const resp = result.data;
      if (!resp.success) {
        setBatchInfo(resp.message || "批量模型预测任务创建失败。");
        setBatchLoading(false);
        return;
      }
      setBatchInfo(resp.message);
      const firstStatus = await fetchDecisionBatchStatus(resp.job_id);
      applyStatus(firstStatus);
    },
    [applyStatus],
  );

  const cancelBatch = useCallback(async () => {
    if (!batchStatus?.job_id) return;
    cancelRequestedRef.current = true;
    setBatchLoading(false);
    applyStatus(batchStatus);
    setBatchInfo("正在终止批量任务，排队条目已取消，运行中的条目完成后将丢弃输出…");
    const next = await cancelDecisionBatch(batchStatus.job_id);
    if (next) {
      applyStatus(next);
      const normalized = normalizeBatchStatus(next, true);
      if (normalized.status === "cancelled") {
        cancelRequestedRef.current = false;
        const done = normalized.completed + normalized.failed;
        const cancelled = normalized.results.filter((r) => r.status === "cancelled").length;
        setBatchInfo(
          `批量任务已终止：已完成 ${done} 条，已取消 ${cancelled} 条，未生成无效 JSON。`,
        );
      } else {
        setBatchInfo("正在终止批量任务，请稍候…");
      }
    } else {
      cancelRequestedRef.current = false;
      setBatchInfo("终止请求失败，请检查后端服务与管理员令牌。");
    }
  }, [batchStatus, applyStatus]);

  const clearBatch = useCallback(() => {
    cancelRequestedRef.current = false;
    setBatchLoading(false);
    setBatchInfo("");
    setBatchStatus(null);
  }, []);

  useEffect(() => {
    if (!batchStatus?.job_id) return;
    if (isBatchTerminal(batchStatus.status)) {
      cancelRequestedRef.current = false;
      setBatchLoading(false);
      if (batchStatus.status === "cancelled" && !batchInfo.startsWith("批量任务已终止")) {
        const done = batchStatus.completed + batchStatus.failed;
        const cancelled = batchStatus.results.filter((r) => r.status === "cancelled").length;
        setBatchInfo(
          `批量任务已终止：已完成 ${done} 条，已取消 ${cancelled} 条，未生成无效 JSON。`,
        );
      }
      return;
    }
    const timer = window.setInterval(async () => {
      const next = await fetchDecisionBatchStatus(batchStatus.job_id);
      if (next) applyStatus(next);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [batchStatus?.job_id, batchStatus?.status, batchInfo, applyStatus]);

  const value = useMemo(
    () => ({
      batchLoading,
      batchInfo,
      batchStatus,
      startBatch,
      startMapBatch,
      cancelBatch,
      clearBatch,
    }),
    [batchLoading, batchInfo, batchStatus, startBatch, startMapBatch, cancelBatch, clearBatch],
  );

  return (
    <DecisionBatchContext.Provider value={value}>
      {children}
    </DecisionBatchContext.Provider>
  );
}

export function useDecisionBatch(): DecisionBatchContextValue {
  const ctx = useContext(DecisionBatchContext);
  if (!ctx) {
    throw new Error("useDecisionBatch 必须在 DecisionBatchProvider 内使用");
  }
  return ctx;
}

export function useDecisionBatchProgress() {
  const { batchStatus, batchLoading } = useDecisionBatch();
  if (!batchStatus) return null;
  const done = batchStatus.completed + batchStatus.failed;
  const percent =
    batchStatus.total > 0 ? Math.round((done / batchStatus.total) * 100) : 0;
  const finished = isBatchTerminal(batchStatus.status);
  const cancelling = isBatchCancelling(batchStatus.status);
  return {
    jobId: batchStatus.job_id,
    status: batchStatus.status,
    percent,
    done,
    total: batchStatus.total,
    running: batchStatus.running,
    failed: batchStatus.failed,
    active: batchLoading || cancelling || !finished,
    finished,
    cancelling,
  };
}
