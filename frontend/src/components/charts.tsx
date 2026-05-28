import ReactECharts from "echarts-for-react";
import type { ReactNode } from "react";
import type { MemoryChartItem, MemoryHeatmap, MemoryTrendPoint, ShapContribution } from "../api/types";
import { formatFeatureLabel } from "../lib/featureLabels";

const LEVEL_COLORS: Record<string, string> = {
  红: "#ef4444",
  橙: "#f97316",
  黄: "#eab308",
  蓝: "#3b82f6",
};

interface ProbProps {
  probs: Record<string, number>;
  centerLevel?: string;
  /** 弹窗内建议关闭，避免滚动时 ResizeObserver 触发反复重绘 */
  autoResize?: boolean;
}

export function ProbabilityChart({ probs, centerLevel, autoResize = true }: ProbProps) {
  const data = Object.entries(probs).map(([name, value]) => ({
    name,
    value: Number(value),
    itemStyle: { color: LEVEL_COLORS[name] ?? "#6b7280" },
  }));

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item" as const,
      formatter: "{b}: {d}%",
    },
    title: centerLevel
      ? {
          text: `${centerLevel}`,
          subtext: "判定等级",
          left: "center",
          top: "42%",
          textStyle: { color: LEVEL_COLORS[centerLevel] ?? "#fff", fontSize: 28, fontWeight: 700 },
          subtextStyle: { color: "#9ca3af", fontSize: 11 },
        }
      : undefined,
    series: [
      {
        type: "pie" as const,
        radius: ["55%", "80%"],
        avoidLabelOverlap: true,
        label: { color: "#e5e7eb", fontSize: 12, formatter: "{b}: {d}%" },
        labelLine: { lineStyle: { color: "#374151" } },
        data,
      },
    ],
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <div className="scada-card-title" style={{ padding: "8px 8px 0" }}>
        概率分布
      </div>
      <ReactECharts option={option} style={{ height: 280 }} autoResize={autoResize} />
    </div>
  );
}

interface ShapProps {
  contributions: ShapContribution[];
  topN?: number;
  autoResize?: boolean;
}

export function ShapChart({ contributions, topN = 5, autoResize = true }: ShapProps) {
  const sorted = [...contributions]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, topN)
    .reverse();

  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" as const },
    grid: { left: 132, right: 30, top: 30, bottom: 30 },
    xAxis: {
      type: "value" as const,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1f2937" } },
    },
    yAxis: {
      type: "category" as const,
      data: sorted.map((s) => formatFeatureLabel(s.feature)),
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 11, width: 120, overflow: "truncate" },
    },
    series: [
      {
        type: "bar" as const,
        data: sorted.map((s) => ({
          value: s.contribution,
          itemStyle: {
            color: s.contribution >= 0 ? "#ef4444" : "#10b981",
          },
        })),
        label: {
          show: true,
          position: "right" as const,
          color: "#e5e7eb",
          formatter: (p: { value: number }) => p.value.toFixed(2),
        },
      },
    ],
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <div className="scada-card-title" style={{ padding: "8px 8px 0" }}>
        SHAP TOP{topN} 归因
      </div>
      <ReactECharts option={option} style={{ height: 280 }} autoResize={autoResize} />
    </div>
  );
}

const MEMORY_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#10b981", "#06b6d4", "#a855f7"];

interface ChartShellProps {
  title: string;
  children: ReactNode;
}

function ChartShell({ title, children }: ChartShellProps) {
  return (
    <div className="scada-card chart-card">
      <div className="scada-card-title">{title}</div>
      {children}
    </div>
  );
}

export function MemoryTrendChart({
  data,
  onSeriesClick,
}: {
  data: MemoryTrendPoint[];
  onSeriesClick?: (seriesName: string) => void;
}) {
  const option = {
    backgroundColor: "transparent",
    color: ["#3b82f6", "#10b981", "#f97316", "#eab308"],
    tooltip: { trigger: "axis" as const },
    legend: { top: 0, textStyle: { color: "#cbd5e1", fontSize: 11 } },
    grid: { left: 42, right: 18, top: 48, bottom: 44 },
    dataZoom: [{ type: "inside" as const }, { type: "slider" as const, height: 18, bottom: 8 }],
    xAxis: {
      type: "category" as const,
      data: data.map((item) => item.date),
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
    },
    yAxis: {
      type: "value" as const,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1f2937" } },
    },
    series: [
      { name: "short_term", type: "line" as const, smooth: true, data: data.map((item) => item.short_term) },
      { name: "long_term", type: "line" as const, smooth: true, data: data.map((item) => item.long_term) },
      { name: "warning_experience", type: "line" as const, smooth: true, data: data.map((item) => item.warning_experience) },
      { name: "agentfs_write", type: "line" as const, smooth: true, data: data.map((item) => item.agentfs_write) },
    ],
  };
  return (
    <ChartShell title="记忆写入 / 归档趋势">
      <ReactECharts
        option={option}
        style={{ height: 310 }}
        onEvents={{ click: (params: { seriesName?: string }) => params.seriesName && onSeriesClick?.(params.seriesName) }}
      />
    </ChartShell>
  );
}

export function MemoryBarChart({
  title,
  data,
  onClick,
}: {
  title: string;
  data: MemoryChartItem[];
  onClick?: (name: string) => void;
}) {
  const option = {
    backgroundColor: "transparent",
    color: MEMORY_COLORS,
    tooltip: { trigger: "axis" as const },
    grid: { left: 42, right: 18, top: 24, bottom: 58 },
    dataZoom: data.length > 8 ? [{ type: "inside" as const }, { type: "slider" as const, height: 18, bottom: 8 }] : undefined,
    xAxis: {
      type: "category" as const,
      data: data.map((item) => item.name),
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af", fontSize: 11, interval: 0, rotate: data.length > 5 ? 28 : 0 },
    },
    yAxis: {
      type: "value" as const,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1f2937" } },
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 34,
        data: data.map((item) => ({
          value: item.value,
          itemStyle: { color: LEVEL_COLORS[item.name] ?? (item.name === "P0" ? "#ef4444" : item.name === "P1" ? "#f97316" : undefined) },
        })),
      },
    ],
  };
  return (
    <ChartShell title={title}>
      <ReactECharts
        option={option}
        style={{ height: 300 }}
        onEvents={{ click: (params: { name?: string }) => params.name && onClick?.(params.name) }}
      />
    </ChartShell>
  );
}

export function MemoryDonutChart({
  title,
  data,
  onClick,
}: {
  title: string;
  data: MemoryChartItem[];
  onClick?: (name: string) => void;
}) {
  const option = {
    backgroundColor: "transparent",
    color: MEMORY_COLORS,
    tooltip: { trigger: "item" as const, formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#cbd5e1", fontSize: 11 } },
    series: [
      {
        type: "pie" as const,
        radius: ["46%", "72%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { color: "#e5e7eb", fontSize: 11, formatter: "{b}\n{d}%" },
        labelLine: { lineStyle: { color: "#374151" } },
        data,
      },
    ],
  };
  return (
    <ChartShell title={title}>
      <ReactECharts
        option={option}
        style={{ height: 300 }}
        onEvents={{ click: (params: { name?: string }) => params.name && onClick?.(params.name) }}
      />
    </ChartShell>
  );
}

export function MemoryHeatmapChart({
  data,
  onClick,
}: {
  data: MemoryHeatmap;
  onClick?: (riskType: string, priority: string) => void;
}) {
  const values = data.data.map((item) => item.value);
  const option = {
    backgroundColor: "transparent",
    tooltip: { position: "top" as const },
    grid: { left: 78, right: 20, top: 28, bottom: 46 },
    xAxis: {
      type: "category" as const,
      data: data.xAxis,
      splitArea: { show: true },
      axisLabel: { color: "#9ca3af", fontSize: 11, interval: 0, rotate: data.xAxis.length > 4 ? 25 : 0 },
      axisLine: { lineStyle: { color: "#374151" } },
    },
    yAxis: {
      type: "category" as const,
      data: data.yAxis,
      splitArea: { show: true },
      axisLabel: { color: "#e5e7eb", fontSize: 11 },
      axisLine: { lineStyle: { color: "#374151" } },
    },
    visualMap: {
      min: 0,
      max: Math.max(1, ...values),
      calculable: true,
      orient: "horizontal" as const,
      left: "center",
      bottom: 0,
      textStyle: { color: "#9ca3af" },
      inRange: { color: ["#0f172a", "#3b82f6", "#eab308", "#f97316", "#ef4444"] },
    },
    series: [
      {
        name: "关联强度",
        type: "heatmap" as const,
        data: data.data.map((item) => [data.xAxis.indexOf(item.x), data.yAxis.indexOf(item.y), item.value]),
        label: { show: true, color: "#e5e7eb", fontSize: 11 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" } },
      },
    ],
  };
  return (
    <ChartShell title="风险类型 × 优先级关联热力图">
      <ReactECharts
        option={option}
        style={{ height: 310 }}
        onEvents={{
          click: (params: { data?: [number, number, number] }) => {
            const point = params.data;
            if (!point) return;
            onClick?.(data.xAxis[point[0]], data.yAxis[point[1]]);
          },
        }}
      />
    </ChartShell>
  );
}
// ==================== 新增可视化图表组件 ====================

interface TrendDataPoint {
  date: string;
  total: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
}

interface TrendProps {
  data: TrendDataPoint[];
  title?: string;
}

export function EarlyWarningTrendChart({ data, title = "早期预警生成趋势图" }: TrendProps) {
  const dates = data.map(d => d.date);
  const totals = data.map(d => d.total);
  const highRisk = data.map(d => d.high_risk);
  const mediumRisk = data.map(d => d.medium_risk);
  const lowRisk = data.map(d => d.low_risk);

  // 计算平均值
  const avgValue = totals.reduce((a, b) => a + b, 0) / totals.length;

  // 找到峰值
  let peakIdx = 0;
  let peakVal = 0;
  totals.forEach((val, idx) => {
    if (val > peakVal) {
      peakVal = val;
      peakIdx = idx;
    }
  });

  const option = {
    backgroundColor: "transparent",
    title: {
      text: title,
      subtext: "Early Warning Generation Trend Chart",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any[]) => {
        const p = params[0];
        const idx = p.dataIndex;
        return `<div style="font-weight:bold;margin-bottom:5px">${dates[idx]}</div>` +
               `预警总数: <strong>${totals[idx]}</strong> 次<br/>` +
               `高风险: ${highRisk[idx]} 次 | 中风险: ${mediumRisk[idx]} 次 | 低风险: ${lowRisk[idx]} 次`;
      }
    },
    legend: {
      data: ["预警总数", "高风险预警", "中风险预警", "低风险预警"],
      top: 40,
      textStyle: { color: "#9ca3af" }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "10%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates.filter((_, i) => i % 30 === 0), // 每30天显示一个刻度
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#9ca3af",
        fontSize: 10,
        rotate: 45,
        formatter: (value: string) => value.substring(5) // 只显示月-日
      }
    },
    yAxis: {
      type: "value",
      name: "预警数量 (次)",
      nameTextStyle: { color: "#9ca3af" },
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af" },
      min: 0,
      max: 300,
      splitLine: { lineStyle: { color: "#1f2937" } }
    },
    series: [
      {
        name: "预警总数",
        type: "line",
        data: totals,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#3498db" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(52, 152, 219, 0.3)" },
              { offset: 1, color: "rgba(52, 152, 219, 0.05)" }
            ]
          }
        }
      },
      {
        name: "高风险预警",
        type: "line",
        data: highRisk,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#e74c3c", type: "dashed" }
      },
      {
        name: "中风险预警",
        type: "line",
        data: mediumRisk,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#f39c12", type: "dotted" }
      },
      {
        name: "低风险预警",
        type: "line",
        data: lowRisk,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#27ae60", type: "dotted" }
      }
    ],
    markLine: {
      silent: true,
      data: [{ yAxis: avgValue, label: { formatter: `平均值: ${avgValue.toFixed(1)}`, color: "#9b59b6" } }],
      lineStyle: { color: "#9b59b6", type: "dashed", width: 1.5 }
    },
    markPoint: {
      data: [
        {
          coord: [dates[peakIdx], peakVal],
          value: `峰值: ${peakVal}\n${dates[peakIdx]}`,
          itemStyle: { color: "#e74c3c" }
        }
      ],
      label: { color: "#e74c3c", fontSize: 10 }
    }
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 400 }} />
    </div>
  );
}

interface ScatterDataPoint {
  x: number;
  y: number;
  name?: string;
}

interface ScatterChartProps {
  data: ScatterDataPoint[];
  xLabel: string;
  yLabel: string;
  correlation: number;
}

export function CorrelationScatterChart({ data, xLabel, yLabel, correlation }: ScatterChartProps) {
  const xValues = data.map(d => d.x);
  const yValues = data.map(d => d.y);

  // 计算均值点
  const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;

  // 趋势线数据 (简单线性回归)
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  data.forEach(d => {
    sumX += d.x;
    sumY += d.y;
    sumXY += d.x * d.y;
    sumX2 += d.x * d.x;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (yMean - slope * xMean);

  const trendLineData = [
    [Math.min(...xValues), slope * Math.min(...xValues) + intercept],
    [Math.max(...xValues), slope * Math.max(...xValues) + intercept]
  ];

  const option = {
    backgroundColor: "transparent",
    title: {
      text: `${xLabel} 与 ${yLabel.replace('数量', '')}相关性分析`,
      subtext: "Correlation Scatter Plot",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any) => {
        const d = data[params.dataIndex];
        return `<div><strong>${d.name || '企业'}</strong></div>` +
               `${xLabel}: <strong>${d.x}%</strong><br/>` +
               `${yLabel}: <strong>${d.y}</strong>`;
      }
    },
    visualMap: {
      show: true,
      dimension: 1,
      min: Math.min(...yValues),
      max: Math.max(...yValues),
      inRange: {
        color: ['#27ae60', '#f1c40f', '#e74c3c']
      },
      text: ['高', '低'],
      textStyle: { color: "#9ca3af" },
      right: 20,
      top: 'center'
    },
    grid: {
      left: "10%",
      right: "15%",
      bottom: "15%",
      containLabel: true
    },
    xAxis: {
      type: "value",
      name: xLabel,
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: "#e5e7eb", fontWeight: "bold" },
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af" },
      splitLine: { lineStyle: { color: "#1f2937" } }
    },
    yAxis: {
      type: "value",
      name: yLabel,
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: { color: "#e5e7eb", fontWeight: "bold" },
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af" },
      splitLine: { lineStyle: { color: "#1f2937" } }
    },
    series: [
      {
        type: "scatter",
        symbolSize: 10,
        data: data.map((d, i) => [d.x, d.y]),
        itemStyle: {
          borderColor: "#000",
          borderWidth: 0.5,
          opacity: 0.7
        },
        emphasis: {
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.3)"
          }
        }
      },
      {
        type: "line",
        data: trendLineData,
        symbol: "none",
        lineStyle: { width: 2, color: "#3498db", type: "dashed" },
        name: "趋势线"
      },
      {
        type: "scatter",
        data: [[xMean, yMean]],
        symbolSize: 15,
        symbol: "star",
        itemStyle: { color: "#e74c3c" },
        label: {
          show: true,
          formatter: `均值 (${xMean.toFixed(1)}, ${yMean.toFixed(1)})`,
          color: "#e74c3c",
          position: "top"
        }
      }
    ],
    graphic: [
      {
        type: "text",
        left: "8%",
        top: "8%",
        style: {
          text: `相关系数 (r): ${correlation.toFixed(3)}`,
          fill: "#e5e7eb",
          fontSize: 14,
          fontWeight: "bold"
        },
        z: 100
      }
    ]
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 450 }} />
    </div>
  );
}

interface HeatmapProps {
  variables: string[];
  matrix: number[][];
  strongCorrelations: Array<{ var1: string; var2: string; correlation: number }>;
}

export function CorrelationHeatmap({ variables, matrix, strongCorrelations }: HeatmapProps) {
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "矿山安全指标相关性热力图",
      subtext: "Correlation Heatmap: Mining Safety Indicators",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any) => {
        const i = params.data[0];
        const j = params.data[1];
        return `${variables[i]} ↔ ${variables[j]}<br/><strong>r = ${matrix[i][j]}</strong>`;
      }
    },
    grid: {
      left: "15%",
      right: "15%",
      bottom: "20%",
      top: "15%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: variables,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#e5e7eb",
        fontSize: 10,
        rotate: 45,
        interval: 0
      },
      splitArea: { show: true }
    },
    yAxis: {
      type: "category",
      data: variables,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#e5e7eb",
        fontSize: 10
      },
      splitArea: { show: true }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "2%",
      inRange: {
        color: ['#e74c3c', '#f39c12', '#f1c40f', '#ffffff', '#3498db']
      },
      text: ["正相关 (+1)", "负相关 (-1)"],
      textStyle: { color: "#9ca3af" },
      dimension: 0
    },
    series: [{
      type: "heatmap",
      data: matrix.flatMap((row, i) =>
        row.map((val, j) => [i, j, val])
      ),
      label: {
        show: true,
        formatter: (p: any) => p.data[2].toFixed(2),
        fontSize: 9,
        color: "#1f2937"
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 0, 0, 0.5)"
        }
      },
      itemStyle: {
        borderColor: "#374151",
        borderWidth: 1
      }
    }]
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 500 }} />
      {strongCorrelations.length > 0 && (
        <div style={{
          marginTop: 10,
          padding: 10,
          backgroundColor: "rgba(31, 41, 55, 0.5)",
          borderRadius: 6,
          border: "1px solid #374151"
        }}>
          <div style={{ color: "#e5e7eb", fontWeight: "bold", marginBottom: 8 }}>
            强相关变量对 (|r| &gt; 0.5):
          </div>
          {strongCorrelations.slice(0, 5).map((corr, idx) => (
            <div key={idx} style={{
              color: corr.correlation > 0 ? "#3498db" : "#e74c3c",
              fontSize: 12,
              marginBottom: 4
            }}>
              • {corr.var1} ↔ {corr.var2}: r = {corr.correlation.toFixed(3)}
              {corr.correlation > 0 ? " (正相关)" : " (负相关)"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== 新增图表组件 ====================

interface ModuleTrendPoint {
  date: string;
  early_warning: number;
  storage_count: number;
  classification_count: number;
}

interface ModuleTrendProps {
  data: ModuleTrendPoint[];
  title?: string;
}

export function ModuleTrendComparisonChart({ data, title = "三模块时间趋势对比" }: ModuleTrendProps) {
  const dates = data.map(d => d.date);
  const earlyWarning = data.map(d => d.early_warning);
  const storageCount = data.map(d => d.storage_count);
  const classificationCount = data.map(d => d.classification_count);

  const option = {
    backgroundColor: "transparent",
    title: {
      text: title,
      subtext: "Module Trend Comparison with Drag-Zoom",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any[]) => {
        const p = params[0];
        const idx = p.dataIndex;
        return `<div style="font-weight:bold;margin-bottom:5px">${dates[idx]}</div>` +
               `预警生成: <strong>${earlyWarning[idx]}</strong><br/>` +
               `入库数量: <strong>${storageCount[idx]}</strong><br/>` +
               `分类关联: <strong>${classificationCount[idx]}</strong>`;
      }
    },
    legend: {
      data: ["预警生成", "入库数量", "分类关联"],
      top: 40,
      textStyle: { color: "#9ca3af" }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#9ca3af",
        fontSize: 10,
        rotate: 45
      }
    },
    yAxis: {
      type: "value",
      name: "数量",
      nameTextStyle: { color: "#9ca3af" },
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af" },
      splitLine: { lineStyle: { color: "#1f2937" } }
    },
    dataZoom: [
      {
        type: "inside",
        start: 0,
        end: 50,
        minValueSpan: 8,
        maxValueSpan: 274
      },
      {
        type: "slider",
        start: 0,
        end: 50,
        height: 30,
        bottom: 10,
        borderColor: "#374151",
        fillerColor: "rgba(59, 130, 246, 0.2)",
        handleStyle: { color: "#3b82f6" },
        textStyle: { color: "#9ca3af" },
        labelFormatter: (value: number) => {
          const idx = Math.floor(value);
          return dates[idx] ? dates[idx].substring(5) : "";
        }
      }
    ],
    series: [
      {
        name: "预警生成",
        type: "line",
        data: earlyWarning,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#ef4444" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(239, 68, 68, 0.3)" },
              { offset: 1, color: "rgba(239, 68, 68, 0.05)" }
            ]
          }
        }
      },
      {
        name: "入库数量",
        type: "line",
        data: storageCount,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#3b82f6" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59, 130, 246, 0.3)" },
              { offset: 1, color: "rgba(59, 130, 246, 0.05)" }
            ]
          }
        }
      },
      {
        name: "分类关联",
        type: "line",
        data: classificationCount,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#10b981" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16, 185, 129, 0.3)" },
              { offset: 1, color: "rgba(16, 185, 129, 0.05)" }
            ]
          }
        }
      }
    ]
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 450 }} />
    </div>
  );
}

interface StorageTrendPoint {
  date: string;
  storage_count: number;
  processed_count: number;
  pending_count: number;
}

interface StorageTrendProps {
  data: StorageTrendPoint[];
  title?: string;
  unit?: string;
}

export function StorageTrendChart({ data, title = "入库时间趋势", unit = "份" }: StorageTrendProps) {
  const dates = data.map(d => d.date);
  const storageCount = data.map(d => d.storage_count);
  const processedCount = data.map(d => d.processed_count);
  const pendingCount = data.map(d => d.pending_count);

  const avgStorage = storageCount.reduce((a, b) => a + b, 0) / storageCount.length;

  const option = {
    backgroundColor: "transparent",
    title: {
      text: title,
      subtext: "Storage Time Trend Chart",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any[]) => {
        const p = params[0];
        const idx = p.dataIndex;
        return `<div style="font-weight:bold;margin-bottom:5px">${dates[idx]}</div>` +
               `入库总数: <strong>${storageCount[idx]}</strong> ${unit}<br/>` +
               `已处理: ${processedCount[idx]} ${unit} | 待处理: ${pendingCount[idx]} ${unit}`;
      }
    },
    legend: {
      data: ["入库总数", "已处理", "待处理"],
      top: 40,
      textStyle: { color: "#9ca3af" }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#9ca3af",
        fontSize: 10,
        rotate: 45
      }
    },
    yAxis: {
      type: "value",
      name: `数量 (${unit})`,
      nameTextStyle: { color: "#9ca3af" },
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#9ca3af" },
      splitLine: { lineStyle: { color: "#1f2937" } }
    },
    dataZoom: [
      {
        type: "inside",
        start: 0,
        end: 10,
        minValueSpan: 8
      },
      {
        type: "slider",
        start: 0,
        end: 10,
        height: 30,
        bottom: 10,
        borderColor: "#374151",
        fillerColor: "rgba(16, 185, 129, 0.2)",
        handleStyle: { color: "#10b981" },
        textStyle: { color: "#9ca3af" },
        labelFormatter: (value: number) => {
          const idx = Math.floor(value);
          return dates[idx] ? dates[idx].substring(5) : "";
        }
      }
    ],
    series: [
      {
        name: "入库总数",
        type: "line",
        data: storageCount,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#3b82f6" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59, 130, 246, 0.3)" },
              { offset: 1, color: "rgba(59, 130, 246, 0.05)" }
            ]
          }
        }
      },
      {
        name: "已处理",
        type: "line",
        data: processedCount,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#10b981", type: "dashed" }
      },
      {
        name: "待处理",
        type: "line",
        data: pendingCount,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#f59e0b", type: "dotted" }
      }
    ],
    markLine: {
      silent: true,
      data: [{ yAxis: avgStorage, label: { formatter: `平均入库: ${avgStorage.toFixed(1)}`, color: "#9b59b6" } }],
      lineStyle: { color: "#9b59b6", type: "dashed", width: 1.5 }
    }
  };

  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 450 }} />
    </div>
  );
}

interface CategoryPriorityHeatmapProps {
  categories: string[];
  priorities: string[];
  matrix: number[][];
}

export function CategoryPriorityHeatmapChart({ categories, priorities, matrix }: CategoryPriorityHeatmapProps) {
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "分类×优先级关联热力图",
      subtext: "Category × Priority Correlation Heatmap",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any) => {
        const i = params.data[0];
        const j = params.data[1];
        return `${categories[i]} × ${priorities[j]}<br/><strong>关联强度: ${matrix[i][j]}</strong>`;
      }
    },
    grid: {
      left: "15%",
      right: "5%",
      bottom: "15%",
      top: "15%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: priorities,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 11 },
      splitArea: { show: true }
    },
    yAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 11 },
      splitArea: { show: true }
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "2%",
      inRange: {
        color: ['#1a237e', '#283593', '#1565c0', '#42a5f5', '#90caf9', '#e3f2fd']
      },
      text: ["强关联", "弱关联"],
      textStyle: { color: "#9ca3af" }
    },
    series: [{
      type: "heatmap",
      data: matrix.flatMap((row, i) =>
        row.map((val, j) => [j, i, val])
      ),
      label: {
        show: true,
        formatter: (p: any) => p.data[2].toFixed(2),
        fontSize: 12,
        color: "#fff",
        fontWeight: "bold"
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 0, 0, 0.5)"
        }
      },
      itemStyle: {
        borderColor: "#374151",
        borderWidth: 1
      }
    }]
  };

  return (
        <div className="scada-card" style={{ padding: 8, marginLeft: "-10%" }}>
          <ReactECharts option={option} style={{ height: 400, width: "100%" }} />
        </div>
  );
}

interface EnterpriseCategoryHeatmapProps {
  enterprises: string[];
  categories: string[];
  matrix: number[][];
}

export function EnterpriseCategoryHeatmapChart({ enterprises, categories, matrix }: EnterpriseCategoryHeatmapProps) {
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "企业×分类关联热力图",
      subtext: "Enterprise × Category Correlation Heatmap",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(50, 50, 50, 0.9)",
      borderColor: "#374151",
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any) => {
        const i = params.data[0];
        const j = params.data[1];
        return `${enterprises[i]}<br/>${categories[j]}<br/><strong>关联强度: ${matrix[i][j]}</strong>`;
      }
    },
    grid: {
      left: "12%",
      right: "8%",
      bottom: "10%",
      top: "8%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 10, rotate: 30 },
      splitArea: { show: true }
    },
    yAxis: {
      type: "category",
      data: enterprises,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 10 },
      splitArea: { show: true }
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "1%",
      inRange: {
        color: ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#fc8d59', '#d73027']
      },
      text: ["强关联", "弱关联"],
      textStyle: { color: "#9ca3af" }
    },
    series: [{
      type: "heatmap",
      data: matrix.flatMap((row, i) =>
        row.map((val, j) => [j, i, val])
      ),
      label: {
        show: true,
        formatter: (p: any) => p.data[2].toFixed(2),
        fontSize: 10,
        color: "#1f2937"
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 0, 0, 0.5)"
        }
      },
      itemStyle: {
        borderColor: "#374151",
        borderWidth: 1
      }
    }]
  };

  return (
        <div className="scada-card" style={{ padding: 8, marginLeft: "-10%" }}>
          <ReactECharts option={option} style={{ height: Math.max(500, enterprises.length * 24), width: "100%" }} />
        </div>
  );
}

interface IndustryWarningData {
  industry: string;
  total_enterprises: number;
  red_count: number;
  orange_count: number;
  yellow_count: number;
  blue_count: number;
  avg_risk_score: number;
  avg_safety_score: number;
  inspection_count: number;
  violation_count: number;
}

export function IndustryWarningComparisonChart({ data }: { data: IndustryWarningData[] }) {
  const industries = data.map(d => d.industry);
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "各工业大类预警情况可视化对比",
      subtext: "Industry Warning Comparison Dashboard",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 18, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#3b82f6",
      borderWidth: 1,
      textStyle: { color: "#e5e7eb" },
      formatter: (params: any[]) => {
        let html = `<div style="font-weight:bold;margin-bottom:6px;color:#f1f5f9">${params[0].axisValue}</div>`;
        params.forEach((p: any) => {
          html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            ${p.seriesName}: <strong>${p.value}</strong></div>`;
        });
        return html;
      }
    },
    legend: {
      data: ["红色预警", "橙色预警", "黄色预警", "蓝色预警", "平均风险分", "平均安全分"],
      top: 50,
      textStyle: { color: "#9ca3af", fontSize: 11 }
    },
    grid: {
      left: "4%",
      right: "4%",
      bottom: "12%",
      top: "22%",
      containLabel: true
    },
    xAxis: {
      type: "category" as const,
      data: industries,
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: {
        color: "#e5e7eb",
        fontSize: 10,
        rotate: industries.length > 6 ? 30 : 0,
        interval: 0
      }
    },
    yAxis: [
      {
        type: "value" as const,
        name: "企业数量",
        nameTextStyle: { color: "#9ca3af" },
        axisLine: { lineStyle: { color: "#374151" } },
        axisLabel: { color: "#9ca3af" },
        splitLine: { lineStyle: { color: "#1f2937" } }
      },
      {
        type: "value" as const,
        name: "分数",
        nameTextStyle: { color: "#9ca3af" },
        axisLine: { lineStyle: { color: "#374151" } },
        axisLabel: { color: "#9ca3af" },
        splitLine: { show: false }
      }
    ],
    dataZoom: [{ type: "inside" as const }, { type: "slider" as const, height: 18, bottom: 4 }],
    series: [
      {
        name: "红色预警",
        type: "bar",
        stack: "warning",
        data: data.map(d => d.red_count),
        itemStyle: { color: "#ef4444", borderRadius: [0, 0, 0, 0] },
        barMaxWidth: 40
      },
      {
        name: "橙色预警",
        type: "bar",
        stack: "warning",
        data: data.map(d => d.orange_count),
        itemStyle: { color: "#f97316" },
        barMaxWidth: 40
      },
      {
        name: "黄色预警",
        type: "bar",
        stack: "warning",
        data: data.map(d => d.yellow_count),
        itemStyle: { color: "#eab308" },
        barMaxWidth: 40
      },
      {
        name: "蓝色预警",
        type: "bar",
        stack: "warning",
        data: data.map(d => d.blue_count),
        itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 40
      },
      {
        name: "平均风险分",
        type: "line",
        yAxisIndex: 1,
        data: data.map(d => d.avg_risk_score),
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color: "#f43f5e" },
        itemStyle: { color: "#f43f5e", borderWidth: 2, borderColor: "#fff" },
        areaStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(244, 63, 94, 0.25)" },
              { offset: 1, color: "rgba(244, 63, 94, 0.02)" }
            ]
          }
        }
      },
      {
        name: "平均安全分",
        type: "line",
        yAxisIndex: 1,
        data: data.map(d => d.avg_safety_score),
        smooth: true,
        symbol: "diamond",
        symbolSize: 8,
        lineStyle: { width: 3, color: "#10b981" },
        itemStyle: { color: "#10b981", borderWidth: 2, borderColor: "#fff" },
        areaStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16, 185, 129, 0.25)" },
              { offset: 1, color: "rgba(16, 185, 129, 0.02)" }
            ]
          }
        }
      }
    ]
  };
  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 480 }} />
    </div>
  );
}

export function IndustryWarning3DBarChart({ data }: { data: IndustryWarningData[] }) {
  const industries = data.map(d => d.industry);
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "工业大类预警三维对比图",
      subtext: "3D Industry Warning Comparison",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 18, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {},
    visualMap: {
      max: Math.max(...data.map(d => d.red_count + d.orange_count + d.yellow_count + d.blue_count)),
      color: ["#ef4444", "#f97316", "#eab308", "#3b82f6"],
      textStyle: { color: "#9ca3af" }
    },
    xAxis3D: {
      type: "category" as const,
      data: industries,
      axisLabel: { color: "#e5e7eb", fontSize: 9, rotate: 30 },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    yAxis3D: {
      type: "category" as const,
      data: ["红色", "橙色", "黄色", "蓝色"],
      axisLabel: { color: "#e5e7eb", fontSize: 11 },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    zAxis3D: {
      type: "value" as const,
      name: "数量",
      axisLabel: { color: "#9ca3af" },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    grid3D: {
      boxWidth: 180,
      boxDepth: 80,
      viewControl: { autoRotate: true, autoRotateSpeed: 6 },
      light: {
        main: { intensity: 1.2, shadow: true },
        ambient: { intensity: 0.4 }
      },
      environment: "transparent" as any
    },
    series: [
      {
        type: "bar3D",
        data: data.flatMap((d, i) => [
          [i, 0, d.red_count, "#ef4444"],
          [i, 1, d.orange_count, "#f97316"],
          [i, 2, d.yellow_count, "#eab308"],
          [i, 3, d.blue_count, "#3b82f6"],
        ]).map(item => ({
          value: [item[0], item[1], item[2]],
          itemStyle: { color: item[3] as string }
        })),
        shading: "lambert",
        label: { show: false },
        itemStyle: { opacity: 0.85 },
        emphasis: {
          label: { show: true, formatter: (p: any) => p.value[2], color: "#fff" }
        }
      }
    ]
  };
  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 500 }}
        opts={{ renderer: "canvas" }}
        onEvents={{
          rendered: () => {}
        }}
      />
    </div>
  );
}

export function IndustryRiskRadarChart({ data }: { data: IndustryWarningData[] }) {
  const top6 = data.slice(0, 6);
  const indicators = [
    { name: "红色预警", max: Math.max(...top6.map(d => d.red_count), 1) },
    { name: "橙色预警", max: Math.max(...top6.map(d => d.orange_count), 1) },
    { name: "黄色预警", max: Math.max(...top6.map(d => d.yellow_count), 1) },
    { name: "蓝色预警", max: Math.max(...top6.map(d => d.blue_count), 1) },
    { name: "平均风险分", max: 100 },
    { name: "违规次数", max: Math.max(...top6.map(d => d.violation_count), 1) },
  ];
  const colors = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#06b6d4"];
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "工业大类风险雷达图",
      subtext: "Industry Risk Radar",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#3b82f6",
      textStyle: { color: "#e5e7eb" }
    },
    legend: {
      data: top6.map(d => d.industry),
      bottom: 0,
      textStyle: { color: "#9ca3af", fontSize: 10 }
    },
    radar: {
      indicator: indicators,
      shape: "polygon",
      splitNumber: 5,
      axisName: { color: "#e5e7eb", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1e293b" } },
      splitArea: { areaStyle: { color: ["rgba(59,130,246,0.05)", "rgba(59,130,246,0.1)"] } },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    series: [{
      type: "radar",
      data: top6.map((d, i) => ({
        name: d.industry,
        value: [d.red_count, d.orange_count, d.yellow_count, d.blue_count, d.avg_risk_score, d.violation_count],
        lineStyle: { color: colors[i % colors.length], width: 2 },
        areaStyle: { color: colors[i % colors.length], opacity: 0.15 },
        itemStyle: { color: colors[i % colors.length] },
        symbol: "circle",
        symbolSize: 5
      }))
    }]
  };
  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 420 }} />
    </div>
  );
}

export function IndustryInspectionViolationChart({ data }: { data: IndustryWarningData[] }) {
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "各行业检查与违规对比",
      subtext: "Inspection vs Violation by Industry",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 16, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#3b82f6",
      textStyle: { color: "#e5e7eb" }
    },
    legend: {
      data: ["检查次数", "违规次数", "违规率"],
      top: 45,
      textStyle: { color: "#9ca3af" }
    },
    grid: { left: "4%", right: "4%", bottom: "12%", top: "22%", containLabel: true },
    xAxis: {
      type: "category" as const,
      data: data.map(d => d.industry),
      axisLine: { lineStyle: { color: "#374151" } },
      axisLabel: { color: "#e5e7eb", fontSize: 10, rotate: data.length > 6 ? 25 : 0, interval: 0 }
    },
    yAxis: [
      {
        type: "value" as const,
        name: "次数",
        axisLine: { lineStyle: { color: "#374151" } },
        axisLabel: { color: "#9ca3af" },
        splitLine: { lineStyle: { color: "#1f2937" } }
      },
      {
        type: "value" as const,
        name: "违规率%",
        axisLine: { lineStyle: { color: "#374151" } },
        axisLabel: { color: "#9ca3af" },
        splitLine: { show: false }
      }
    ],
    dataZoom: [{ type: "inside" as const }, { type: "slider" as const, height: 18, bottom: 4 }],
    series: [
      {
        name: "检查次数",
        type: "bar",
        data: data.map(d => d.inspection_count),
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#3b82f6" },
              { offset: 1, color: "#1d4ed8" }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        },
        barMaxWidth: 36
      },
      {
        name: "违规次数",
        type: "bar",
        data: data.map(d => d.violation_count),
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#ef4444" },
              { offset: 1, color: "#b91c1c" }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        },
        barMaxWidth: 36
      },
      {
        name: "违规率",
        type: "line",
        yAxisIndex: 1,
        data: data.map(d => d.inspection_count > 0 ? +((d.violation_count / d.inspection_count) * 100).toFixed(1) : 0),
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color: "#f59e0b" },
        itemStyle: { color: "#f59e0b", borderWidth: 2, borderColor: "#fff" }
      }
    ]
  };
  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 420 }} />
    </div>
  );
}

export function IndustryWarning3DSurface({ data }: { data: IndustryWarningData[] }) {
  const industries = data.map(d => d.industry);
  const warningTypes = ["红色预警", "橙色预警", "黄色预警", "蓝色预警"];
  const warningCounts = [data.map(d => d.red_count), data.map(d => d.orange_count), data.map(d => d.yellow_count), data.map(d => d.blue_count)];
  const surfaceData: number[][] = [];
  for (let j = 0; j < warningTypes.length; j++) {
    for (let i = 0; i < industries.length; i++) {
      surfaceData.push([i, j, warningCounts[j][i]]);
    }
  }
  const option = {
    backgroundColor: "transparent",
    title: {
      text: "行业预警三维曲面图",
      subtext: "3D Warning Surface Visualization",
      left: "center",
      textStyle: { color: "#e5e7eb", fontSize: 18, fontWeight: "bold" },
      subtextStyle: { color: "#9ca3af", fontSize: 12 }
    },
    tooltip: {},
    visualMap: {
      show: true,
      min: 0,
      max: Math.max(...data.map(d => Math.max(d.red_count, d.orange_count, d.yellow_count, d.blue_count))),
      inRange: { color: ["#1e3a5f", "#3b82f6", "#eab308", "#f97316", "#ef4444"] },
      textStyle: { color: "#9ca3af" }
    },
    xAxis3D: {
      type: "category" as const,
      data: industries,
      axisLabel: { color: "#e5e7eb", fontSize: 9, rotate: 30 },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    yAxis3D: {
      type: "category" as const,
      data: warningTypes,
      axisLabel: { color: "#e5e7eb", fontSize: 11 },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    zAxis3D: {
      type: "value" as const,
      name: "数量",
      axisLabel: { color: "#9ca3af" },
      axisLine: { lineStyle: { color: "#374151" } }
    },
    grid3D: {
      boxWidth: 180,
      boxDepth: 80,
      viewControl: { autoRotate: true, autoRotateSpeed: 4, distance: 220 },
      light: {
        main: { intensity: 1.2, shadow: true },
        ambient: { intensity: 0.3 }
      },
      environment: "transparent" as any
    },
    series: [{
      type: "surface",
      wireframe: { show: true, lineStyle: { color: "rgba(59,130,246,0.3)", width: 1 } },
      equation: {
        x: { min: 0, max: industries.length - 1, step: 1 },
        y: { min: 0, max: warningTypes.length - 1, step: 1 },
        z: (x: number, y: number) => {
          const xi = Math.round(x);
          const yi = Math.round(y);
          if (xi >= 0 && xi < industries.length && yi >= 0 && yi < warningTypes.length) {
            return warningCounts[yi][xi];
          }
          return 0;
        }
      },
      itemStyle: { opacity: 0.85 },
      shading: "color"
    }]
  };
  return (
    <div className="scada-card" style={{ padding: 8 }}>
      <ReactECharts option={option} style={{ height: 500 }} opts={{ renderer: "canvas" }} />
    </div>
  );
}
