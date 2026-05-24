import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchDecisionRecord } from "../api/client";
import type { DecisionRecordDetail } from "../api/types";
import { DecisionView } from "../pages/RiskPredictionPage";
import JsonView from "./JsonView";

interface Props {
  recordId: string;
  /** 列表行已知的企业编号，用于标题即时展示 */
  enterpriseId?: string;
  onClose: () => void;
}

/** 从批量文件名等 record_id 中解析企业编号（如 0007_CHEM-1-008_...） */
function enterpriseIdFromRecordId(recordId: string): string | null {
  const base = recordId.split("/").pop() || recordId;
  const match = base.match(/^\d+_([^_]+)_/);
  return match ? match[1] : null;
}

function resolveEnterpriseLabel(
  recordId: string,
  detail: DecisionRecordDetail | null,
  hint?: string,
): string {
  if (hint) return hint;
  if (detail?.response?.enterprise_id) return detail.response.enterprise_id;
  const reqId = detail?.request?.enterprise_id;
  if (reqId != null && reqId !== "") return String(reqId);
  return enterpriseIdFromRecordId(recordId) || "未知企业";
}

export default function DecisionDetailModal({ recordId, enterpriseId, onClose }: Props) {
  const [detail, setDetail] = useState<DecisionRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDecisionRecord(recordId).then((data) => {
      if (!data) {
        setError("无法加载决策详情");
        setDetail(null);
      } else {
        setDetail(data);
      }
      setLoading(false);
    });
  }, [recordId]);

  useEffect(() => {
    document.body.classList.add("modal-scroll-lock");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-scroll-lock");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const modal = (
    <div
      className="knowledge-preview-overlay"
      onClick={onClose}
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-detail-title"
    >
      <div
        className="knowledge-preview-panel in-modal"
        style={{ width: "min(1100px, 96vw)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="knowledge-preview-header">
          <h3 id="decision-detail-title" className="knowledge-preview-title">
            决策详情 · {resolveEnterpriseLabel(recordId, detail, enterpriseId)}
          </h3>
          <button className="scada-btn secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>加载中...</div>
        )}
        {error && (
          <div className="alert error" style={{ margin: "0 16px 16px" }}>
            {error}
          </div>
        )}
        {detail && (
          <div className="knowledge-preview-body" style={{ fontFamily: "inherit", whiteSpace: "normal" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              {detail.display_path} · {detail.created_at}
              {detail.source ? ` · 来源 ${detail.source}` : ""}
            </div>
            <DecisionView
              decision={detail.response}
              streamLog={detail.response.node_status || []}
              inModal
            />
            {detail.memory_results && detail.memory_results.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>
                  记忆召回结果 ({detail.memory_results.length})
                </summary>
                <JsonView data={detail.memory_results} maxHeight={240} />
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
