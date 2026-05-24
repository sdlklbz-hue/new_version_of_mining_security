import { useDecisionBatch, useDecisionBatchProgress } from "../context/DecisionBatchContext";

interface Props {
  onOpenRiskTab?: () => void;
}

export default function BatchJobBanner({ onOpenRiskTab }: Props) {
  const progress = useDecisionBatchProgress();
  const { batchInfo, cancelBatch, clearBatch } = useDecisionBatch();

  if (!progress && !batchInfo) return null;

  if (!progress) {
    return (
      <div className="batch-job-banner" role="status">
        <span>{batchInfo}</span>
      </div>
    );
  }

  return (
    <div className="batch-job-banner" role="status">
      <div className="batch-job-banner-main">
        <span className="batch-job-banner-title">
          {progress.status === "cancelled"
            ? "批量完整决策已终止"
            : progress.cancelling
              ? "正在终止批量任务"
              : progress.finished
                ? "批量完整决策已完成"
                : "批量完整决策进行中"}
        </span>
        <span className="font-mono">
          {progress.percent}%（{progress.done}/{progress.total}）
          {progress.running > 0 ? ` · 运行中 ${progress.running}` : ""}
          {progress.failed > 0 ? ` · 失败 ${progress.failed}` : ""}
        </span>
      </div>
      <div className="batch-job-banner-bar">
        <div
          className="batch-job-banner-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="batch-job-banner-actions">
        {progress.active && !progress.finished && !progress.cancelling && (
          <button
            type="button"
            className="batch-job-banner-link batch-job-banner-link-danger"
            onClick={() => void cancelBatch()}
          >
            终止任务
          </button>
        )}
        {onOpenRiskTab && (
          <button
            type="button"
            className="batch-job-banner-link"
            onClick={onOpenRiskTab}
          >
            查看详情
          </button>
        )}
        {progress.finished && (
          <button
            type="button"
            className="batch-job-banner-link"
            onClick={clearBatch}
          >
            关闭
          </button>
        )}
      </div>
    </div>
  );
}
