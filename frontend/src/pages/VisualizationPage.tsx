import { useEffect, useState } from "react";
import {
  fetchEarlyWarningTrend,
  fetchCorrelationScatter,
  fetchCorrelationHeatmap,
  fetchEnterpriseStats,
  fetchModuleTrend,
  fetchStorageTrend,
  fetchCategoryPriorityHeatmap,
  fetchEnterpriseCategoryHeatmap,
  fetchIndustryWarning,
  type TrendDataPoint,
  type ScatterDataPoint,
  type HeatmapResponse,
  type ModuleTrendPoint,
  type StorageTrendPoint,
  type CategoryPriorityResponse,
  type EnterpriseCategoryResponse,
  type IndustryWarningItem,
} from "../api/client";
import {
  EarlyWarningTrendChart,
  CorrelationScatterChart,
  CorrelationHeatmap,
  ModuleTrendComparisonChart,
  StorageTrendChart,
  CategoryPriorityHeatmapChart,
  EnterpriseCategoryHeatmapChart,
  IndustryWarningComparisonChart,
  IndustryWarning3DBarChart,
  IndustryRiskRadarChart,
  IndustryInspectionViolationChart,
  IndustryWarning3DSurface,
} from "../components/charts";
import ReactECharts from "echarts-for-react";
import "echarts-gl";
import * as echarts from "echarts";

export default function VisualizationDashboard() {
  const [trendData, setTrendData] = useState<TrendDataPoint[] | null>(null);
  const [scatterData, setScatterData] = useState<{
    data: ScatterDataPoint[];
    x_label: string;
    y_label: string;
    correlation: number;
  } | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);
  const [moduleTrendData, setModuleTrendData] = useState<ModuleTrendPoint[] | null>(null);
  const [storageTrendData, setStorageTrendData] = useState<StorageTrendPoint[] | null>(null);
  const [categoryPriorityData, setCategoryPriorityData] = useState<CategoryPriorityResponse | null>(null);
  const [enterpriseCategoryData, setEnterpriseCategoryData] = useState<EnterpriseCategoryResponse | null>(null);
  const [industryWarningData, setIndustryWarningData] = useState<IndustryWarningItem[] | null>(null);
  const [enterpriseStats, setEnterpriseStats] = useState<{
    success: boolean;
    industry_distribution: Array<{ name: string; value: number; color: string }>;
    risk_level_distribution: { categories: string[]; series: Array<{ name: string; data: number[] }> };
    scale_distribution: Array<{ range: string; count: number; percentage: number; color: string }>;
    safety_score_distribution: Array<{ range: string; count: number; color: string }>;
    regional_distribution: Array<{ name: string; value: number; coord: number[] }>;
    monthly_trend: { months: string[]; enterprise_count: number[]; risk_incidents: number[]; inspections: number[]; violations: number[] };
    top_risk_enterprises: Array<{ rank: number; name: string; risk_score: number; level: string; industry: string; incidents: number }>;
    summary: { total_enterprises: number; high_risk_count: number; avg_safety_score: number; total_inspections_ytd: number; total_violations_ytd: number; compliance_rate: number; cumulative_samples?: number; f1_score?: number; model_accuracy?: number; recall_rate?: number; precision_rate?: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAllData() {
      setLoading(true);
      setError(null);

      try {
        const [
          trendResp, scatterResp, heatmapResp, statsResp,
          moduleResp, storageResp, catPriResp, entCatResp,
          industryWarningResp
        ] = await Promise.all([
          fetchEarlyWarningTrend(),
          fetchCorrelationScatter(),
          fetchCorrelationHeatmap(),
          fetchEnterpriseStats(),
          fetchModuleTrend(),
          fetchStorageTrend(),
          fetchCategoryPriorityHeatmap(),
          fetchEnterpriseCategoryHeatmap(),
          fetchIndustryWarning(),
        ]);

        if (trendResp?.success) setTrendData(trendResp.data);
        if (scatterResp?.success) {
          setScatterData({
            data: scatterResp.data,
            x_label: scatterResp.x_label,
            y_label: scatterResp.y_label,
            correlation: scatterResp.correlation,
          });
        }
        if (heatmapResp?.success) setHeatmapData(heatmapResp);
        if (moduleResp?.success) setModuleTrendData(moduleResp.data);
        if (storageResp?.success) setStorageTrendData(storageResp.data);
        if (catPriResp?.success) setCategoryPriorityData(catPriResp);
        if (entCatResp?.success) setEnterpriseCategoryData(entCatResp);
        if (statsResp?.success) setEnterpriseStats(statsResp);
        if (industryWarningResp?.success) setIndustryWarningData(industryWarningResp.data);

        if (!trendResp?.success && !scatterResp?.success && !heatmapResp?.success && !statsResp?.success) {
          setError("无法加载可视化数据，请检查后端服务");
        }
      } catch (e) {
        console.error("加载可视化数据失败:", e);
        setError("加载数据时发生错误");
      } finally {
        setLoading(false);
      }
    }

    loadAllData();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "400px",
        color: "#9ca3af",
        fontSize: "16px"
      }}>
        <div>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}>📊</div>
          正在加载数据可视化图表...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "20px",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        border: "1px solid #ef4444",
        borderRadius: "8px",
        color: "#ef4444",
        margin: "20px"
      }}>
        <strong>错误:</strong> {error}
      </div>
    );
  }

  return (
    <div className="visualization-dashboard">
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{
          color: "#e5e7eb",
          fontSize: "24px",
          fontWeight: "bold",
          marginBottom: "8px"
        }}>
          📈 数据可视化仪表盘
        </h2>
        <p style={{
          color: "#9ca3af",
          fontSize: "14px",
          margin: 0
        }}>
          基于真实企业数据的统计分析图表 | Data Visualization Dashboard
        </p>
      </div>

      {/* 三模块时间趋势对比（支持拖拽缩放） */}
      {moduleTrendData && moduleTrendData.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <ModuleTrendComparisonChart
            data={moduleTrendData}
            title="三模块时间趋势对比（预警生成 / 入库 / 分类关联）"
          />
        </div>
      )}

      {/* 预警生成趋势图 */}
      {trendData && trendData.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <EarlyWarningTrendChart
            data={trendData}
            title="2024-2025年矿山安全预警生成趋势"
          />
        </div>
      )}

      {/* 入库时间趋势图 */}
      {storageTrendData && storageTrendData.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <StorageTrendChart
            data={storageTrendData}
            title="文件入库时间趋势"
            unit="份"
          />
        </div>
      )}

      {/* 散点图和热力图并排显示 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
        gap: "24px",
        marginBottom: "32px"
      }}>
        {scatterData && scatterData.data.length > 0 && (
          <CorrelationScatterChart
            data={scatterData.data}
            xLabel={scatterData.x_label}
            yLabel={scatterData.y_label}
            correlation={scatterData.correlation}
          />
        )}

        {heatmapData && heatmapData.correlation.variables.length > 0 && (
          <CorrelationHeatmap
            variables={heatmapData.correlation.variables}
            matrix={heatmapData.correlation.matrix}
            strongCorrelations={heatmapData.strong_correlations}
          />
        )}
      </div>

      {/* 分类×优先级热力图 和 企业×分类热力图 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
        gap: "24px",
        marginBottom: "32px"
      }}>
        {categoryPriorityData && categoryPriorityData.categories.length > 0 && (
          <CategoryPriorityHeatmapChart
            categories={categoryPriorityData.categories}
            priorities={categoryPriorityData.priorities}
            matrix={categoryPriorityData.matrix}
          />
        )}

        {enterpriseCategoryData && enterpriseCategoryData.enterprises.length > 0 && (
          <EnterpriseCategoryHeatmapChart
            enterprises={enterpriseCategoryData.enterprises}
            categories={enterpriseCategoryData.categories}
            matrix={enterpriseCategoryData.matrix}
          />
        )}
      </div>

      {/* 数据统计摘要 */}
      {(trendData || scatterData || heatmapData) && (
        <div style={{
          padding: "16px",
          backgroundColor: "rgba(31, 41, 55, 0.5)",
          borderRadius: "8px",
          border: "1px solid #374151",
          marginBottom: "32px"
        }}>
          <h3 style={{
            color: "#e5e7eb",
            fontSize: "16px",
            fontWeight: "bold",
            marginTop: 0,
            marginBottom: "12px"
          }}>
            📋 数据概览
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px"
          }}>
            {trendData && trendData.length > 0 && (
              <div style={{
                padding: "12px",
                backgroundColor: "rgba(52, 152, 219, 0.1)",
                borderRadius: "6px",
                borderLeft: "3px solid #3498db"
              }}>
                <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "4px" }}>
                  预警趋势数据
                </div>
                <div style={{ color: "#3498db", fontSize: "18px", fontWeight: "bold" }}>
                  {trendData.length} 天
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                  总计 {trendData.reduce((sum, d) => sum + d.total, 0).toLocaleString()} 次预警
                </div>
              </div>
            )}

            {scatterData && scatterData.data.length > 0 && (
              <div style={{
                padding: "12px",
                backgroundColor: "rgba(46, 204, 113, 0.1)",
                borderRadius: "6px",
                borderLeft: "3px solid #2ecc71"
              }}>
                <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "4px" }}>
                  相关性分析样本
                </div>
                <div style={{ color: "#2ecc71", fontSize: "18px", fontWeight: "bold" }}>
                  {scatterData.data.length} 家企业
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                  相关系数 r = {scatterData.correlation.toFixed(3)}
                </div>
              </div>
            )}

            {heatmapData && heatmapData.correlation.variables.length > 0 && (
              <div style={{
                padding: "12px",
                backgroundColor: "rgba(155, 89, 182, 0.1)",
                borderRadius: "6px",
                borderLeft: "3px solid #9b59b6"
              }}>
                <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "4px" }}>
                  安全指标维度
                </div>
                <div style={{ color: "#9b59b6", fontSize: "18px", fontWeight: "bold" }}>
                  {heatmapData.correlation.variables.length} 个指标
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                  发现 {heatmapData.strong_correlations.length} 组强相关
                </div>
              </div>
            )}

            {moduleTrendData && moduleTrendData.length > 0 && (
              <div style={{
                padding: "12px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                borderRadius: "6px",
                borderLeft: "3px solid #ef4444"
              }}>
                <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "4px" }}>
                  三模块趋势数据
                </div>
                <div style={{ color: "#ef4444", fontSize: "18px", fontWeight: "bold" }}>
                  {moduleTrendData.length} 天
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                  支持拖拽缩放交互
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 企业综合统计数据分析 */}
      {enterpriseStats && (
        <div style={{ marginTop: "40px" }}>
          <h3 style={{
            color: "#e5e7eb",
            fontSize: "20px",
            fontWeight: "bold",
            marginBottom: "8px",
            paddingBottom: "12px",
            borderBottom: "2px solid #4f46e5"
          }}>
            🏭 企业深度数据挖掘分析
          </h3>
          <p style={{
            color: "#9ca3af",
            fontSize: "13px",
            marginBottom: "24px"
          }}>
            基于 new_data 数据库的综合统计分析（按企业名称长度降序排列） | Comprehensive Enterprise Data Analytics
          </p>

          {/* 核心指标卡片 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "32px"
          }}>
            {[
              { label: "企业总数", value: enterpriseStats.summary.total_enterprises.toLocaleString(), icon: "🏢", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
              { label: "高危企业", value: enterpriseStats.summary.high_risk_count, icon: "⚠️", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
              { label: "平均安全评分", value: `${enterpriseStats.summary.avg_safety_score}分`, icon: "✅", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
              { label: "年度检查次数", value: enterpriseStats.summary.total_inspections_ytd.toLocaleString(), icon: "🔍", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
              { label: "违规次数", value: enterpriseStats.summary.total_violations_ytd.toLocaleString(), icon: "📋", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
              { label: "合规率", value: `${enterpriseStats.summary.compliance_rate}%`, icon: "🎯", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.1)" },
            ].map((item, idx) => (
              <div key={idx} style={{
                padding: "20px",
                backgroundColor: item.bg,
                borderRadius: "12px",
                border: `1px solid ${item.color}30`,
                textAlign: "center",
                transition: "transform 0.2s",
              }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>{item.icon}</div>
                <div style={{
                  color: item.color,
                  fontSize: "28px",
                  fontWeight: "bold",
                  marginBottom: "4px"
                }}>
                  {item.value}
                </div>
                <div style={{ color: "#9ca3af", fontSize: "13px" }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* 新增统计指标卡片（累计样本、F1分数等） */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "32px"
          }}>
            {[
              { label: "累计样本数", value: enterpriseStats.summary.cumulative_samples?.toLocaleString() || "N/A", icon: "📊", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
              { label: "F1分数", value: enterpriseStats.summary.f1_score?.toFixed(3) || "N/A", icon: "🎯", color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },
              { label: "模型准确率", value: enterpriseStats.summary.model_accuracy ? `${(enterpriseStats.summary.model_accuracy * 100).toFixed(1)}%` : "N/A", icon: "🧠", color: "#14b8a6", bg: "rgba(20, 184, 166, 0.1)" },
              { label: "召回率", value: enterpriseStats.summary.recall_rate ? `${(enterpriseStats.summary.recall_rate * 100).toFixed(1)}%` : "N/A", icon: "📡", color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" },
              { label: "精确率", value: enterpriseStats.summary.precision_rate ? `${(enterpriseStats.summary.precision_rate * 100).toFixed(1)}%` : "N/A", icon: "💎", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.1)" },
            ].map((item, idx) => (
              <div key={idx} style={{
                padding: "20px",
                backgroundColor: item.bg,
                borderRadius: "12px",
                border: `1px solid ${item.color}30`,
                textAlign: "center",
                transition: "transform 0.2s",
              }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>{item.icon}</div>
                <div style={{
                  color: item.color,
                  fontSize: "28px",
                  fontWeight: "bold",
                  marginBottom: "4px"
                }}>
                  {item.value}
                </div>
                <div style={{ color: "#9ca3af", fontSize: "13px" }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* 行业分布饼图和风险等级柱状图 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            {/* 行业分布饼图 */}
            <div style={{
              backgroundColor: "rgba(31, 41, 55, 0.5)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid #374151"
            }}>
              <h4 style={{
                color: "#e5e7eb",
                fontSize: "16px",
                fontWeight: "bold",
                marginTop: 0,
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>📊</span> 企业行业分布
              </h4>
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: "item",
                    formatter: "{b}: {c} ({d}%)"
                  },
                  legend: {
                    orient: "vertical",
                    left: "left",
                    textStyle: { color: "#9ca3af", fontSize: 12 }
                  },
                  series: [{
                    type: "pie",
                    radius: ["40%", "70%"],
                    center: ["60%", "50%"],
                    avoidLabelOverlap: false,
                    itemStyle: {
                      borderRadius: 10,
                      borderColor: "#1f2937",
                      borderWidth: 2
                    },
                    label: {
                      show: true,
                      formatter: "{b}\n{d}%",
                      color: "#e5e7eb",
                      fontSize: 11
                    },
                    emphasis: {
                      label: { show: true, fontSize: "14", fontWeight: "bold" }
                    },
                    data: enterpriseStats.industry_distribution.map(item => ({
                      name: item.name,
                      value: item.value,
                      itemStyle: { color: item.color }
                    }))
                  }],
                  color: enterpriseStats.industry_distribution.map(item => item.color)
                }}
                style={{ height: "400px" }}
              />
            </div>

            {/* 风险等级分布堆叠柱状图 */}
            <div style={{
              backgroundColor: "rgba(31, 41, 55, 0.5)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid #374151"
            }}>
              <h4 style={{
                color: "#e5e7eb",
                fontSize: "16px",
                fontWeight: "bold",
                marginTop: 0,
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>📈</span> 季度风险等级分布趋势
              </h4>
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: "axis",
                    axisPointer: { type: "shadow" }
                  },
                  legend: {
                    data: enterpriseStats.risk_level_distribution.series.map(s => s.name),
                    top: 0,
                    textStyle: { color: "#9ca3af", fontSize: 11 }
                  },
                  grid: {
                    left: "3%",
                    right: "4%",
                    bottom: "3%",
                    containLabel: true
                  },
                  xAxis: {
                    type: "category",
                    data: enterpriseStats.risk_level_distribution.categories,
                    axisLabel: { color: "#9ca3af", fontSize: 11 }
                  },
                  yAxis: {
                    type: "value",
                    name: "企业数量",
                    axisLabel: { color: "#9ca3af" },
                    nameTextStyle: { color: "#9ca3af" },
                    splitLine: { lineStyle: { color: "#374151" } }
                  },
                  series: enterpriseStats.risk_level_distribution.series.map((s, idx) => ({
                    name: s.name,
                    type: "bar",
                    stack: "total",
                    emphasis: { focus: "series" },
                    data: s.data,
                    itemStyle: {
                      color: ["#ef4444", "#f97316", "#eab308", "#3b82f6"][idx],
                      borderRadius: idx === 3 ? [4, 4, 0, 0] : 0
                    }
                  }))
                }}
                style={{ height: "400px" }}
              />
            </div>
          </div>

          {/* 企业规模分布和安全评分分布 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            {/* 企业规模分布 */}
            <div style={{
              backgroundColor: "rgba(31, 41, 55, 0.5)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid #374151"
            }}>
              <h4 style={{
                color: "#e5e7eb",
                fontSize: "16px",
                fontWeight: "bold",
                marginTop: 0,
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>🏗️</span> 企业规模分布
              </h4>
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: "axis",
                    axisPointer: { type: "shadow" },
                    formatter: function(params: any) {
                      const data = params[0];
                      return `${data.name}<br/>数量: ${data.value}家<br/>占比: ${enterpriseStats.scale_distribution.find(s => s.range === data.name)?.percentage}%`;
                    }
                  },
                  grid: {
                    left: "3%",
                    right: "4%",
                    bottom: "3%",
                    containLabel: true
                  },
                  xAxis: {
                    type: "value",
                    axisLabel: { color: "#9ca3af" },
                    splitLine: { lineStyle: { color: "#374151" } }
                  },
                  yAxis: {
                    type: "category",
                    data: enterpriseStats.scale_distribution.map(s => s.range),
                    axisLabel: { color: "#e5e7eb", fontSize: 11 }
                  },
                  series: [{
                    type: "bar",
                    data: enterpriseStats.scale_distribution.map(s => ({
                      value: s.count,
                      itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                          { offset: 0, color: s.color },
                          { offset: 1, color: `${s.color}80` }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                      }
                    })),
                    barWidth: "50%",
                    label: {
                      show: true,
                      position: "right",
                      color: "#e5e7eb",
                      formatter: "{c}家"
                    }
                  }]
                }}
                style={{ height: "300px" }}
              />
            </div>

            {/* 安全评分分布直方图 */}
            <div style={{
              backgroundColor: "rgba(31, 41, 55, 0.5)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid #374151"
            }}>
              <h4 style={{
                color: "#e5e7eb",
                fontSize: "16px",
                fontWeight: "bold",
                marginTop: 0,
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>📊</span> 安全评分分布
              </h4>
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: "axis",
                    formatter: function(params: any) {
                      const data = params[0];
                      return `${data.name}<br/>企业数: ${data.value}家`;
                    }
                  },
                  grid: {
                    left: "3%",
                    right: "4%",
                    bottom: "3%",
                    containLabel: true
                  },
                  xAxis: {
                    type: "category",
                    data: enterpriseStats.safety_score_distribution.map(s => s.range),
                    axisLabel: {
                      color: "#9ca3af",
                      fontSize: 10,
                      rotate: 15
                    }
                  },
                  yAxis: {
                    type: "value",
                    name: "企业数量",
                    axisLabel: { color: "#9ca3af" },
                    nameTextStyle: { color: "#9ca3af" },
                    splitLine: { lineStyle: { color: "#374151" } }
                  },
                  series: [{
                    type: "bar",
                    data: enterpriseStats.safety_score_distribution.map(s => ({
                      value: s.count,
                      itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                          { offset: 0, color: s.color },
                          { offset: 1, color: `${s.color}60` }
                        ]),
                        borderRadius: [4, 4, 0, 0]
                      }
                    })),
                    barWidth: "60%"
                  }]
                }}
                style={{ height: "300px" }}
              />
            </div>
          </div>

          {/* 月度趋势多维度折线图 */}
          <div style={{
            backgroundColor: "rgba(31, 41, 55, 0.5)",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid #374151",
            marginBottom: "32px"
          }}>
            <h4 style={{
              color: "#e5e7eb",
              fontSize: "16px",
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>📅</span> 月度综合趋势分析
            </h4>
            <ReactECharts
              option={{
                tooltip: {
                  trigger: "axis"
                },
                                legend: {
                  data: ["企业数量", "风险事件", "安全检查", "违规次数"],
                  top: 0,
                  textStyle: { color: "#9ca3af", fontSize: 11 }
                },
                grid: {
                  left: "3%",
                  right: "5%",
                  bottom: "3%",
                  containLabel: true
                },
                xAxis: {
                  type: "category",
                  boundaryGap: false,
                  data: enterpriseStats.monthly_trend.months,
                  axisLabel: { color: "#9ca3af", rotate: 45, fontSize: 10 },
                  axisLine: { lineStyle: { color: "#374151" } }
                },
                yAxis: [
                  {
                    type: "value",
                    name: "企业 / 检查（家/次）",
                    position: "left",
                    axisLabel: { color: "#60a5fa" },
                    splitLine: { lineStyle: { color: "#374151" } },
                    nameTextStyle: { color: "#60a5fa", fontSize: 11 }
                  },
                  {
                    type: "value",
                    name: "风险 / 违规（次）",
                    position: "right",
                    axisLabel: { color: "#f87171" },
                    splitLine: { show: false },
                    nameTextStyle: { color: "#f87171", fontSize: 11 }
                  }
                ],
                series: [
                  {
                    name: "企业数量",
                    type: "line",
                    smooth: true,
                    yAxisIndex: 0,
                    data: enterpriseStats.monthly_trend.enterprise_count,
                    lineStyle: { width: 3, color: "#3b82f6" },
                    areaStyle: {
                      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(59, 130, 246, 0.3)" },
                        { offset: 1, color: "rgba(59, 130, 246, 0.05)" }
                      ])
                    },
                    itemStyle: { color: "#3b82f6" }
                  },
                                    {
                    name: "风险事件",
                    type: "line",
                    smooth: true,
                    yAxisIndex: 1,
                    data: enterpriseStats.monthly_trend.risk_incidents,
                    lineStyle: { width: 3, color: "#ef4444" },
                    itemStyle: { color: "#ef4444" }
                  },
                                    {
                    name: "安全检查",
                    type: "line",
                    smooth: true,
                    yAxisIndex: 0,
                    data: enterpriseStats.monthly_trend.inspections,
                    lineStyle: { width: 3, color: "#10b981" },
                    itemStyle: { color: "#10b981" }
                  },
                                    {
                    name: "违规次数",
                    type: "line",
                    smooth: true,
                    yAxisIndex: 1,
                    data: enterpriseStats.monthly_trend.violations,
                    lineStyle: { width: 3, color: "#f59e0b" },
                    itemStyle: { color: "#f59e0b" }
                  }
                ]
              }}
              style={{ height: "400px" }}
            />
          </div>

          {/* 高风险企业排行榜（TOP 8，使用真实企业名称） */}
          <div style={{
            backgroundColor: "rgba(31, 41, 55, 0.5)",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid #374151",
            marginBottom: "32px"
          }}>
            <h4 style={{
              color: "#e5e7eb",
              fontSize: "16px",
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>⚠️</span> TOP 8 高风险企业预警（按企业名称长度降序排列）
            </h4>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px"
            }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #4f46e5" }}>
                  <th style={{ padding: "12px", textAlign: "left", color: "#9ca3af", fontWeight: 600 }}>排名</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#9ca3af", fontWeight: 600 }}>企业名称</th>
                  <th style={{ padding: "12px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>行业类型</th>
                  <th style={{ padding: "12px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>风险评分</th>
                  <th style={{ padding: "12px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>风险等级</th>
                  <th style={{ padding: "12px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>事故次数</th>
                </tr>
              </thead>
              <tbody>
                {enterpriseStats.top_risk_enterprises.map((enterprise) => (
                  <tr
                    key={enterprise.rank}
                    style={{
                      borderBottom: "1px solid #374151",
                      backgroundColor: enterprise.rank <= 3 ? "rgba(239, 68, 68, 0.05)" : "transparent"
                    }}
                  >
                    <td style={{ padding: "12px", color: "#e5e7eb", fontWeight: "bold" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: enterprise.rank <= 3 ? "#ef4444" : "#374151",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: "bold"
                      }}>
                        {enterprise.rank}
                      </span>
                    </td>
                    <td style={{ padding: "12px", color: "#e5e7eb", fontWeight: 500 }}>{enterprise.name}</td>
                    <td style={{ padding: "12px", textAlign: "center", color: "#9ca3af" }}>{enterprise.industry}</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span style={{
                        color: enterprise.risk_score >= 0.85 ? "#ef4444" : enterprise.risk_score >= 0.75 ? "#f97316" : "#eab308",
                        fontWeight: "bold",
                        fontSize: "14px"
                      }}>
                        {(enterprise.risk_score * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        backgroundColor:
                          enterprise.level === "红" ? "rgba(239, 68, 68, 0.2)" :
                          enterprise.level === "橙" ? "rgba(249, 115, 22, 0.2)" :
                          "rgba(234, 179, 8, 0.2)",
                        color:
                          enterprise.level === "红" ? "#ef4444" :
                          enterprise.level === "橙" ? "#f97316" :
                          "#eab308"
                      }}>
                        {enterprise.level}级
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center", color: "#e5e7eb", fontWeight: "600" }}>
                      {enterprise.incidents}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 工业大类预警情况可视化对比 */}
      {industryWarningData && industryWarningData.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <h3 style={{
            color: "#e5e7eb",
            fontSize: "20px",
            fontWeight: "bold",
            marginBottom: "8px",
            paddingBottom: "12px",
            borderBottom: "2px solid #f97316"
          }}>
            🔬 工业大类预警情况深度对比分析
          </h3>
          <p style={{
            color: "#9ca3af",
            fontSize: "13px",
            marginBottom: "24px"
          }}>
            基于企业数据库的各行业预警等级分布、风险评分、检查违规数据对比 | Industry Warning Deep Comparison
          </p>

          <div style={{ marginBottom: "32px" }}>
            <IndustryWarningComparisonChart data={industryWarningData} />
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            <IndustryRiskRadarChart data={industryWarningData} />
            <IndustryInspectionViolationChart data={industryWarningData} />
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
            gap: "24px",
            marginBottom: "32px"
          }}>
            <IndustryWarning3DBarChart data={industryWarningData} />
            <IndustryWarning3DSurface data={industryWarningData} />
          </div>

          <div style={{
            backgroundColor: "rgba(31, 41, 55, 0.5)",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid #374151",
            marginBottom: "32px"
          }}>
            <h4 style={{
              color: "#e5e7eb",
              fontSize: "16px",
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>📋</span> 工业大类预警数据明细表
            </h4>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px"
              }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f97316" }}>
                    <th style={{ padding: "10px", textAlign: "left", color: "#9ca3af", fontWeight: 600 }}>行业类别</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>企业数</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#ef4444", fontWeight: 600 }}>红色</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#f97316", fontWeight: 600 }}>橙色</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#eab308", fontWeight: 600 }}>黄色</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#3b82f6", fontWeight: 600 }}>蓝色</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>平均风险分</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>平均安全分</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>检查次数</th>
                    <th style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontWeight: 600 }}>违规次数</th>
                  </tr>
                </thead>
                <tbody>
                  {industryWarningData.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                      <td style={{ padding: "10px", color: "#e5e7eb", fontWeight: 500 }}>{item.industry}</td>
                      <td style={{ padding: "10px", textAlign: "center", color: "#e5e7eb" }}>{item.total_enterprises}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ color: "#ef4444", fontWeight: "bold" }}>{item.red_count}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ color: "#f97316", fontWeight: "bold" }}>{item.orange_count}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ color: "#eab308", fontWeight: "bold" }}>{item.yellow_count}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ color: "#3b82f6", fontWeight: "bold" }}>{item.blue_count}</span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{
                          color: item.avg_risk_score >= 60 ? "#ef4444" : item.avg_risk_score >= 40 ? "#f97316" : "#10b981",
                          fontWeight: "bold"
                        }}>
                          {item.avg_risk_score}
                        </span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{
                          color: item.avg_safety_score >= 80 ? "#10b981" : item.avg_safety_score >= 60 ? "#eab308" : "#ef4444",
                          fontWeight: "bold"
                        }}>
                          {item.avg_safety_score}
                        </span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", color: "#9ca3af" }}>{item.inspection_count}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span style={{ color: item.violation_count > 0 ? "#ef4444" : "#10b981" }}>{item.violation_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}