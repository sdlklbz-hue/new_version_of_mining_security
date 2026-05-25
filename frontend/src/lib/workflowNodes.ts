import type { NodeStatus } from "../api/types";

/** LangGraph 五节点 DAG 顺序（与 workflow.py 一致） */
export const WORKFLOW_NODE_ORDER = [
  "data_ingestion",
  "risk_assessment",
  "memory_recall",
  "decision_generation",
  "result_push",
] as const;

export type WorkflowNodeId = (typeof WORKFLOW_NODE_ORDER)[number];

export const WORKFLOW_NODE_LABELS: Record<WorkflowNodeId, string> = {
  data_ingestion: "数据接入",
  risk_assessment: "风险评估",
  memory_recall: "记忆召回",
  decision_generation: "决策生成",
  result_push: "结果推送",
};

export function getWorkflowNodeLabel(nodeId: string): string {
  return WORKFLOW_NODE_LABELS[nodeId as WorkflowNodeId] ?? nodeId;
}

export function createPendingWorkflowNodes(): NodeStatus[] {
  return WORKFLOW_NODE_ORDER.map((node) => ({
    node,
    status: "pending",
  }));
}

export function applyNodeStatusUpdate(
  nodes: NodeStatus[],
  update: NodeStatus,
): NodeStatus[] {
  if (update.node === "workflow") return nodes;
  const idx = nodes.findIndex((n) => n.node === update.node);
  if (idx >= 0) {
    const next = [...nodes];
    next[idx] = { ...next[idx], ...update };
    return next;
  }
  return [...nodes, update];
}

/** 以完整五节点骨架为底，合并 SSE 流或决策响应中的节点状态 */
export function buildWorkflowTimeline(
  streamUpdates: NodeStatus[],
  fallbackNodes?: NodeStatus[],
): NodeStatus[] {
  let nodes = createPendingWorkflowNodes();
  const updates =
    streamUpdates.length > 0
      ? streamUpdates.filter((u) => u.node !== "workflow")
      : (fallbackNodes ?? []).filter((u) => u.node !== "workflow");

  for (const update of updates) {
    nodes = applyNodeStatusUpdate(nodes, update);
  }
  return nodes;
}

export type TimelineVisualStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export function resolveTimelineVisualStatus(status: string): TimelineVisualStatus {
  if (status === "started") return "running";
  if (
    status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return status;
  }
  return "pending";
}
