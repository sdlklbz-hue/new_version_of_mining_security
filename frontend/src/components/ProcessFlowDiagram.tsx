import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

export interface ProcessFlowNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  color?: string | null;
}

export interface ProcessFlowEdge {
  source: string;
  target: string;
}

export interface ProcessFlowDiagram {
  name?: string;
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
}

/** 解析企业库中的「工艺流程内容」字段（JSON 字符串或对象）。 */
export function parseProcessFlowContent(raw: unknown): ProcessFlowDiagram[] | null {
  if (raw == null || raw === "") return null;
  try {
    let data: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) data = [data];
    const diagrams: ProcessFlowDiagram[] = [];
    for (const item of data as Record<string, unknown>[]) {
      if (!item || !Array.isArray(item.nodes) || item.nodes.length === 0) continue;
      diagrams.push({
        name: typeof item.name === "string" ? item.name : undefined,
        nodes: (item.nodes as Record<string, unknown>[]).map((n) => ({
          id: String(n.id ?? n.label ?? ""),
          label: String(n.label ?? n.id ?? ""),
          x: typeof n.x === "number" ? n.x : undefined,
          y: typeof n.y === "number" ? n.y : undefined,
          color: typeof n.color === "string" && n.color ? n.color : null,
        })),
        edges: Array.isArray(item.edges)
          ? (item.edges as Record<string, unknown>[]).map((e) => ({
              source: String(e.source ?? ""),
              target: String(e.target ?? ""),
            }))
          : [],
      });
    }
    return diagrams.length > 0 ? diagrams : null;
  } catch {
    return null;
  }
}

function buildLinks(diagram: ProcessFlowDiagram): ProcessFlowEdge[] {
  if (diagram.edges.length > 0) {
    return diagram.edges.filter((e) => e.source && e.target);
  }
  const sorted = [...diagram.nodes].sort((a, b) => {
    const dx = (a.x ?? 0) - (b.x ?? 0);
    if (Math.abs(dx) > 1) return dx;
    return (a.y ?? 0) - (b.y ?? 0);
  });
  const links: ProcessFlowEdge[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    links.push({ source: sorted[i].id, target: sorted[i + 1].id });
  }
  return links;
}

function ProcessFlowChart({ diagram }: { diagram: ProcessFlowDiagram }) {
  const option = useMemo(() => {
    const links = buildLinks(diagram);
    const xs = diagram.nodes.map((n) => n.x ?? 0);
    const ys = diagram.nodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = maxY - minY;
    // 源数据 y 往往几乎相同（编辑器对齐误差几像素），直接缩放会拉成「高低错落」
    const flattenRow = spanY < Math.max(spanX * 0.2, 48);

    const graphData = diagram.nodes.map((n) => ({
      id: n.id,
      name: n.label,
      x: ((n.x ?? minX) - minX) / spanX * 520 + 40,
      y: flattenRow ? 100 : ((n.y ?? minY) - minY) / Math.max(spanY, 1) * 120 + 60,
      symbolSize: [88, 36],
      symbol: "roundRect",
      itemStyle: {
        color: n.color || "rgba(59,130,246,0.25)",
        borderColor: n.color || "#3b82f6",
        borderWidth: 1.5,
      },
      label: {
        show: true,
        color: "#e5e7eb",
        fontSize: 12,
        fontWeight: 500,
      },
    }));

    const graphLinks = links.map((l) => ({
      source: l.source,
      target: l.target,
      lineStyle: { color: "#64748b", width: 2, curveness: 0.08 },
    }));

    return {
      backgroundColor: "transparent",
      tooltip: { show: true, formatter: (p: { data?: { name?: string } }) => p.data?.name ?? "" },
      series: [
        {
          type: "graph",
          layout: "none",
          roam: false,
          draggable: false,
          data: graphData,
          links: graphLinks,
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [0, 10],
          emphasis: {
            focus: "adjacency",
            lineStyle: { width: 3, color: "#3b82f6" },
          },
        },
      ],
    };
  }, [diagram]);

  const height = Math.min(280, Math.max(200, diagram.nodes.length * 28 + 80));

  return (
    <ReactECharts option={option} style={{ height }} opts={{ renderer: "canvas" }} />
  );
}

interface Props {
  raw: unknown;
}

/** 将工艺流程 JSON 渲染为可读的流程图（无连线时按坐标顺序串联）。 */
export default function ProcessFlowDiagram({ raw }: Props) {
  const diagrams = useMemo(() => parseProcessFlowContent(raw), [raw]);
  if (!diagrams?.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {diagrams.map((diagram, idx) => (
        <div key={idx}>
          {diagram.name && (
            <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>{diagram.name}</div>
          )}
          <ProcessFlowChart diagram={diagram} />
          {diagram.edges.length === 0 && diagram.nodes.length > 1 && (
            <div style={{ color: "#6b7280", fontSize: 11, marginTop: 6 }}>
              源数据未包含工序连线，已按横向坐标顺序展示工序流向。
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
