import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import "echarts-gl";
import * as echarts from "echarts";
import type { EnterpriseDetailResponse } from "../api/client";
import ProcessFlowDiagram, { parseProcessFlowContent } from "../components/ProcessFlowDiagram";

interface Props {
  data: EnterpriseDetailResponse;
  onBack: () => void;
}

function getRiskLevel(ratingData: any[]): { level: string; label: string; color: string; score: number } {
  if (!ratingData || ratingData.length === 0) return { level: "A", label: "低风险", color: "#10b981", score: 20 };
  const latest = ratingData[ratingData.length - 1];
  const lv = latest?.NEW_LEVEL || "A";
  const map: Record<string, { label: string; color: string; score: number }> = {
    D: { label: "重大风险", color: "#ef4444", score: 90 },
    C: { label: "较大风险", color: "#f97316", score: 70 },
    B: { label: "一般风险", color: "#eab308", score: 45 },
    A: { label: "低风险", color: "#10b981", score: 20 },
  };
  return { level: lv, ...map[lv] || map["A"] };
}

function getBasicInfo(detailData: Record<string, any>) {
  const basicList = detailData?.详细数据?.企业基本信息 || [];
  if (basicList.length === 0) return {};
  return basicList[basicList.length - 1] || {};
}

function getSafetyInfo(detailData: Record<string, any>) {
  const safetyList = detailData?.详细数据?.企业安全信息 || [];
  if (safetyList.length === 0) return {};
  return safetyList[safetyList.length - 1] || {};
}

function getCheckRecords(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业日常检查记录 || [];
}

function getRiskReports(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业风险报告历史 || [];
}

function getCategoryInfo(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业行业分类 || [];
}

function getAddressInfo(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业生产经营地址 || [];
}

function getTagReports(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业标签报告历史 || [];
}

function getRatingData(detailData: Record<string, any>) {
  return detailData?.详细数据?.企业评级信息填报 || [];
}

export default function EnterpriseDetailPanel({ data, onBack }: Props) {
  const detailData = data.data as Record<string, any>;
  const basicInfo = useMemo(() => getBasicInfo(detailData), [detailData]);
  const safetyInfo = useMemo(() => getSafetyInfo(detailData), [detailData]);
  const checkRecords = useMemo(() => getCheckRecords(detailData), [detailData]);
  const riskReports = useMemo(() => getRiskReports(detailData), [detailData]);
  const categoryInfo = useMemo(() => getCategoryInfo(detailData), [detailData]);
  const addressInfo = useMemo(() => getAddressInfo(detailData), [detailData]);
  const tagReports = useMemo(() => getTagReports(detailData), [detailData]);
  const ratingData = useMemo(() => getRatingData(detailData), [detailData]);
  const riskInfo = useMemo(() => getRiskLevel(ratingData), [ratingData]);

  const processFlowRaw = basicInfo["工艺流程内容"];
  const processFlowDiagrams = useMemo(
    () => parseProcessFlowContent(processFlowRaw),
    [processFlowRaw],
  );

  const checkStats = useMemo(() => {
    const total = checkRecords.length;
    const issues = checkRecords.filter((c: any) => c.TROUBLE_FLAG === 1).length;
    const normal = total - issues;
    return { total, issues, normal };
  }, [checkRecords]);

  const riskTrendData = useMemo(() => {
    return ratingData.map((r: any, i: number) => ({
      index: i + 1,
      level: r.NEW_LEVEL || "A",
      date: r.RATING_DATE || r.CREATE_TIME || `第${i + 1}次`,
      score: r.RISK_SCORE || ({ D: 90, C: 70, B: 45, A: 20 } as Record<string, number>)[r.NEW_LEVEL as string] || 20,
    }));
  }, [ratingData]);

  const categoryOverview = useMemo(() => {
    const overview = detailData?.数据类别概览 || {};
    return Object.entries(overview).map(([name, count]) => ({ name, count: count as number }));
  }, [detailData]);

  return (
    <div style={{ padding: "0 0 32px 0" }}>
      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 15px ${riskInfo.color}40; } 50% { box-shadow: 0 0 30px ${riskInfo.color}60; } }
        @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes floatUp { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .detail-card { animation: fadeInScale 0.5s ease both; }
        .detail-section { animation: slideInRight 0.4s ease both; }
      `}</style>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 24,
        animation: "slideInRight 0.3s ease"
      }}>
        <button
          onClick={onBack}
          style={{
            padding: "8px 16px",
            background: "rgba(59,130,246,0.15)",
            border: "1px solid #3b82f640",
            borderRadius: 8,
            color: "#3b82f6",
            cursor: "pointer",
            fontSize: 13,
            transition: "all 0.2s"
          }}
        >
          ← 返回列表
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{
            color: "#f1f5f9",
            fontSize: 22,
            fontWeight: "bold",
            margin: 0,
            background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "gradientShift 3s ease infinite"
          }}>
            {data.name}
          </h2>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 16,
        marginBottom: 28
      }}>
        {[
          { label: "风险等级", value: riskInfo.label, icon: "⚠️", color: riskInfo.color, bg: `${riskInfo.color}15` },
          { label: "风险评分", value: riskInfo.score, icon: "📊", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
          { label: "数据类别", value: detailData?.数据类别数 || 0, icon: "📁", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
          { label: "数据记录", value: detailData?.数据总记录数 || 0, icon: "📋", color: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
          { label: "检查次数", value: checkStats.total, icon: "🔍", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
          { label: "问题记录", value: checkStats.issues, icon: "🚨", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
        ].map((item, idx) => (
          <div
            key={idx}
            className="detail-card"
            style={{
              padding: "18px 16px",
              backgroundColor: item.bg,
              borderRadius: 14,
              border: `1px solid ${item.color}25`,
              textAlign: "center",
              animationDelay: `${idx * 0.08}s`,
              transition: "transform 0.2s"
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6, animation: "floatUp 3s ease-in-out infinite", animationDelay: `${idx * 0.3}s` }}>{item.icon}</div>
            <div style={{ color: item.color, fontSize: 24, fontWeight: "bold", marginBottom: 2 }}>{item.value}</div>
            <div style={{ color: "#9ca3af", fontSize: 12 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
        gap: 24,
        marginBottom: 28
      }}>
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          animationDelay: "0.1s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#3b82f6" }}>📊</span> 风险评分仪表盘
          </h3>
          <ReactECharts
            option={{
              series: [{
                type: "gauge",
                startAngle: 200,
                endAngle: -20,
                min: 0,
                max: 100,
                splitNumber: 10,
                itemStyle: { color: riskInfo.color },
                progress: { show: true, width: 20, roundCap: true },
                pointer: { show: true, length: "60%", width: 5, itemStyle: { color: riskInfo.color } },
                axisLine: { lineStyle: { width: 20, color: [[1, "#1e293b"]] } },
                axisTick: { lineStyle: { color: "#374151" } },
                splitLine: { lineStyle: { color: "#374151" } },
                axisLabel: { color: "#9ca3af", fontSize: 10, distance: 25 },
                title: { offsetCenter: [0, "70%"], color: "#9ca3af", fontSize: 14 },
                detail: {
                  valueAnimation: true,
                  offsetCenter: [0, "45%"],
                  fontSize: 36,
                  fontWeight: "bold",
                  color: riskInfo.color,
                  formatter: "{value}"
                },
                data: [{ value: riskInfo.score, name: riskInfo.label }]
              }]
            }}
            style={{ height: 280 }}
          />
        </div>

        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          animationDelay: "0.2s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8b5cf6" }}>📁</span> 数据类别分布
          </h3>
          <ReactECharts
            option={{
              tooltip: { trigger: "item", formatter: "{b}: {c}条 ({d}%)" },
              series: [{
                type: "pie",
                radius: ["35%", "65%"],
                center: ["50%", "50%"],
                roseType: "area",
                itemStyle: { borderRadius: 8, borderColor: "#1f2937", borderWidth: 2 },
                label: { color: "#e5e7eb", fontSize: 11, formatter: "{b}\n{c}条" },
                data: categoryOverview.map((c, i) => ({
                  name: c.name.replace("企业", ""),
                  value: c.count,
                  itemStyle: {
                    color: ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#10b981", "#06b6d4", "#ef4444", "#14b8a6", "#f43f5e"][i % 10]
                  }
                }))
              }]
            }}
            style={{ height: 280 }}
          />
        </div>
      </div>

      {riskTrendData.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "0.3s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#f97316" }}>📈</span> 风险评级变化趋势
          </h3>
          <ReactECharts
            option={{
              tooltip: { trigger: "axis", backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#3b82f6", textStyle: { color: "#e5e7eb" } },
              grid: { left: "4%", right: "4%", bottom: "8%", top: "12%", containLabel: true },
              xAxis: {
                type: "category",
                data: riskTrendData.map((r: any) => r.date || `第${r.index}次`),
                axisLabel: { color: "#9ca3af", fontSize: 10, rotate: 20 },
                axisLine: { lineStyle: { color: "#374151" } }
              },
              yAxis: {
                type: "value",
                name: "风险评分",
                nameTextStyle: { color: "#9ca3af" },
                axisLabel: { color: "#9ca3af" },
                splitLine: { lineStyle: { color: "#1f2937" } }
              },
              series: [{
                type: "line",
                data: riskTrendData.map((r: any) => r.score),
                smooth: true,
                symbol: "circle",
                symbolSize: 10,
                lineStyle: { width: 3, color: "#f97316" },
                itemStyle: { color: "#f97316", borderWidth: 2, borderColor: "#fff" },
                areaStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "rgba(249,115,22,0.3)" },
                    { offset: 1, color: "rgba(249,115,22,0.02)" }
                  ])
                },
                markLine: {
                  silent: true,
                  data: [
                    { yAxis: 80, lineStyle: { color: "#ef4444", type: "dashed" }, label: { formatter: "重大", color: "#ef4444" } },
                    { yAxis: 60, lineStyle: { color: "#f97316", type: "dashed" }, label: { formatter: "较大", color: "#f97316" } },
                    { yAxis: 35, lineStyle: { color: "#eab308", type: "dashed" }, label: { formatter: "一般", color: "#eab308" } },
                  ]
                }
              }]
            }}
            style={{ height: 300 }}
          />
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
        gap: 24,
        marginBottom: 28
      }}>
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          animationDelay: "0.4s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#10b981" }}>🔍</span> 检查记录统计
          </h3>
          <ReactECharts
            option={{
              tooltip: { trigger: "item" },
              series: [{
                type: "pie",
                radius: ["40%", "70%"],
                center: ["50%", "50%"],
                avoidLabelOverlap: false,
                itemStyle: { borderRadius: 10, borderColor: "#1f2937", borderWidth: 3 },
                label: { show: true, color: "#e5e7eb", fontSize: 13, formatter: "{b}\n{c}次" },
                emphasis: { label: { show: true, fontSize: 16, fontWeight: "bold" } },
                data: [
                  { value: checkStats.normal, name: "正常", itemStyle: { color: "#10b981" } },
                  { value: checkStats.issues, name: "存在问题", itemStyle: { color: "#ef4444" } },
                ]
              }]
            }}
            style={{ height: 260 }}
          />
        </div>

        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          animationDelay: "0.5s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#ec4899" }}>🌐</span> 企业数据三维全景
          </h3>
          <ReactECharts
            option={{
              backgroundColor: "transparent",
              tooltip: {},
              visualMap: {
                show: false,
                min: 0,
                max: Math.max(...categoryOverview.map(c => c.count), 1),
                inRange: { color: ["#3b82f6", "#8b5cf6", "#ec4899"] }
              },
              xAxis3D: { type: "category", data: categoryOverview.map(c => c.name.replace("企业", "")), axisLabel: { color: "#9ca3af", fontSize: 9, rotate: 30 } },
              yAxis3D: { type: "value", name: "记录数", axisLabel: { color: "#9ca3af" } },
              zAxis3D: { type: "value", axisLabel: { color: "#9ca3af" } },
              grid3D: {
                boxWidth: 160,
                boxDepth: 60,
                viewControl: { autoRotate: true, autoRotateSpeed: 8, distance: 200 },
                light: { main: { intensity: 1.2, shadow: true }, ambient: { intensity: 0.3 } },
                environment: "transparent" as any
              },
              series: [{
                type: "bar3D",
                data: categoryOverview.map((c, i) => ({
                  value: [i, c.count, c.count],
                  itemStyle: {
                    color: ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#10b981", "#06b6d4", "#ef4444", "#14b8a6", "#f43f5e"][i % 10],
                    opacity: 0.85
                  }
                })),
                shading: "lambert",
                label: { show: false },
                barSize: 12,
                emphasis: { label: { show: true, color: "#fff" } }
              }]
            }}
            style={{ height: 260 }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      </div>

      <div className="detail-section" style={{
        backgroundColor: "rgba(31, 41, 55, 0.6)",
        borderRadius: 16,
        padding: 24,
        border: "1px solid #374151",
        marginBottom: 28,
        animationDelay: "0.6s"
      }}>
        <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#3b82f6" }}>🏢</span> 企业基本信息
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12
        }}>
          {Object.entries(basicInfo).map(([key, value], idx) => {
            if (key === "工艺流程内容" || value === null || value === undefined || value === "") return null;
            const labelMap: Record<string, string> = {
              "ENTNAME": "企业名称", "UNISCID": "统一社会信用代码", "REGNO": "注册号",
              "ENTTYPE": "企业类型", "INDUS_TYPE_LAGRE_NAME": "行业监管大类",
              "INDUS_TYPE_MEDIUM_NAME": "行业中类", "INDUS_TYPE_SMALL_NAME": "行业小类",
              "LEGAL_PERSON": "法定代表人", "REGCAP": "注册资本", "REGCAPCUR": "资本币种",
              "ESDATE": "成立日期", "OPFROM": "经营期限起", "OPTO": "经营期限止",
              "DOM": "住址", "REGORG": "登记机关", "APPRDATE": "核准日期",
              "ENTSTATUS": "经营状态", "EMPNUM": "从业人数", "企业规模": "企业规模",
              "行业监管大类": "行业监管大类", "法定代表人": "法定代表人",
              "注册地址": "注册地址", "企业名称": "企业名称",
            };
            const displayLabel = labelMap[key] || key;
            const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4"];
            const c = colors[idx % colors.length];
            return (
              <div key={key} style={{
                padding: "12px 16px",
                backgroundColor: "rgba(15, 23, 42, 0.5)",
                borderRadius: 10,
                borderLeft: `3px solid ${c}`,
                transition: "transform 0.2s"
              }}>
                <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>{displayLabel}</div>
                <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{String(value)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {processFlowDiagrams && processFlowDiagrams.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "0.65s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#06b6d4" }}>⚙️</span> 工艺流程图
          </h3>
          <ProcessFlowDiagram raw={processFlowRaw} />
        </div>
      )}

      {Object.keys(safetyInfo).length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "0.7s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#ef4444" }}>🛡️</span> 安全与防护设施信息
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12
          }}>
            {Object.entries(safetyInfo).map(([key, value], idx) => {
              if (key === "工艺流程内容" || value === null || value === undefined || value === "") return null;
              const colors = ["#ef4444", "#f97316", "#eab308", "#10b981", "#3b82f6", "#8b5cf6"];
              const c = colors[idx % colors.length];
              return (
                <div key={key} style={{
                  padding: "12px 16px",
                  backgroundColor: "rgba(15, 23, 42, 0.5)",
                  borderRadius: 10,
                  borderLeft: `3px solid ${c}`,
                }}>
                  <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>{key}</div>
                  <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{String(value)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checkRecords.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "0.8s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#f59e0b" }}>📋</span> 日常检查记录
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f59e0b" }}>
                  {Object.keys(checkRecords[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkRecords.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([key, val], i) => (
                      <td key={i} style={{
                        padding: "8px 10px",
                        color: key === "TROUBLE_FLAG" && val === 1 ? "#ef4444" : "#d1d5db",
                        fontWeight: key === "TROUBLE_FLAG" && val === 1 ? "bold" : "normal",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {val === null || val === undefined ? "-" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {riskReports.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "0.9s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#ef4444" }}>⚠️</span> 风险报告历史
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ef4444" }}>
                  {Object.keys(riskReports[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riskReports.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([key, val], i) => (
                      <td key={i} style={{
                        padding: "8px 10px",
                        color: key.includes("LEVEL") && val === "D" ? "#ef4444" : "#d1d5db",
                        fontWeight: key.includes("LEVEL") && val === "D" ? "bold" : "normal",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {val === null || val === undefined ? "-" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ratingData.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "1s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8b5cf6" }}>🏅</span> 评级信息填报记录
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #8b5cf6" }}>
                  {Object.keys(ratingData[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ratingData.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([key, val], i) => {
                      const levelColors: Record<string, string> = { D: "#ef4444", C: "#f97316", B: "#eab308", A: "#10b981" };
                      const isLevel = key === "NEW_LEVEL" || key === "OLD_LEVEL";
                      return (
                        <td key={i} style={{
                          padding: "8px 10px",
                          color: isLevel && levelColors[val as string] ? levelColors[val as string] : "#d1d5db",
                          fontWeight: isLevel ? "bold" : "normal",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {val === null || val === undefined ? "-" : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {categoryInfo.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "1.1s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#06b6d4" }}>🏷️</span> 行业分类信息
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #06b6d4" }}>
                  {Object.keys(categoryInfo[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categoryInfo.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([_, val], i) => (
                      <td key={i} style={{
                        padding: "8px 10px",
                        color: "#d1d5db",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {val === null || val === undefined ? "-" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addressInfo.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "1.2s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#14b8a6" }}>📍</span> 生产经营地址
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #14b8a6" }}>
                  {Object.keys(addressInfo[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addressInfo.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([_, val], i) => (
                      <td key={i} style={{
                        padding: "8px 10px",
                        color: "#d1d5db",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {val === null || val === undefined ? "-" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tagReports.length > 0 && (
        <div className="detail-section" style={{
          backgroundColor: "rgba(31, 41, 55, 0.6)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid #374151",
          marginBottom: 28,
          animationDelay: "1.3s"
        }}>
          <h3 style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "bold", marginTop: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#f43f5e" }}>🔖</span> 标签报告历史
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f43f5e" }}>
                  {Object.keys(tagReports[0]).slice(0, 8).map((key) => (
                    <th key={key} style={{ padding: "8px 10px", textAlign: "left", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tagReports.map((rec: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #374151" }}>
                    {Object.entries(rec).slice(0, 8).map(([_, val], i) => (
                      <td key={i} style={{
                        padding: "8px 10px",
                        color: "#d1d5db",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {val === null || val === undefined ? "-" : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
