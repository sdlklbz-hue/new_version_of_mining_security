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
            // 排除内部/管理字段：不直观且对安全监管用户无意义
            const excludeKeys = [
              "工艺流程内容",      // 已单独展示为工艺流程图
              "是否有效",           // 系统软删除标记
              "删除标识",           // 逻辑删除标识，与"是否有效"重叠
              "主键ID",             // UUID，用户不可读
              "报告历史ID",         // UUID，用户不可读
              "创建人",             // 全是"admin"
              "修改人",             // 全是"admin"
              "修改时间",           // 系统时间戳，用户不关心
              "创建时间",           // 系统时间戳，用户不关心
              "上次调用省接口保存数据截至页数", // 调试/同步状态字段
              "变更原因",           // 全部为null
              "机构编码",           // 几乎全null
              // "区县编码",           // 现已通过地区编码映射显示地名
              "更新时间",           // 系统时间戳
              "更新人",             // 系统字段
              // "是否上报风险报告",   // 保留显示
              // "是否规上企业",       // 保留显示
              "法人证件号",         // 敏感隐私信息，不宜展示
              "法人移动电话",       // 敏感隐私
              "法人固定电话",       // 敏感隐私
              "申请人联系方式",     // 敏感隐私
              "其他名称",           // 几乎全null
              "法人职务",           // 几乎全null
              "法人类型",           // 几乎全null
            ];
            if (excludeKeys.includes(key) || value === null || value === undefined || value === "") return null;
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
            // 对 0/1 标记类字段做友好显示
            // 地区编码 → 地名映射（国标 GB/T 2260）
            const regionCodeMap: Record<number, string> = {
              320000: "江苏省", 320500: "苏州市",
              // 市辖区
              320505: "虎丘区", 320506: "吴中区", 320507: "相城区",
              320508: "姑苏区", 320509: "吴江区",
              320581: "常熟市", 320582: "张家港市", 320583: "昆山市", 320585: "太仓市",
              // 虎丘区乡镇
              320505002: "虎丘区浒墅关镇", 320505004: "虎丘区通安镇",
              320505005: "虎丘区东渚镇", 320505105: "虎丘区镇湖街道",
              320505400: "虎丘区浒墅关经济开发区", 320505501: "虎丘区科技城",
              // 吴中区乡镇
              320506003: "吴中区长桥街道", 320506004: "吴中区越溪街道",
              320506005: "吴中区郭巷街道", 320506006: "吴中区横泾街道",
              320506007: "吴中区香山街道", 320506008: "吴中区城南街道",
              320506009: "吴中区太湖街道",
              320506101: "吴中区甪直镇", 320506104: "吴中区光福镇",
              320506108: "吴中区东山镇", 320506109: "吴中区木渎镇",
              320506111: "吴中区胥口镇", 320506112: "吴中区临湖镇",
              // 相城区乡镇
              320507002: "相城区元和街道", 320507004: "相城区澄阳街道",
              320507007: "相城区北桥街道", 320507009: "相城区漕湖街道",
              320507100: "相城区望亭镇", 320507103: "相城区黄埭镇",
              320507107: "相城区渭塘镇", 320507111: "相城区阳澄湖镇",
              // 吴江区乡镇
              320509003: "吴江区松陵街道", 320509004: "吴江区横扇街道",
              320509005: "吴江区八坼街道",
              320509101: "吴江区同里镇", 320509102: "吴江区黎里镇",
              320509103: "吴江区平望镇", 320509104: "吴江区盛泽镇",
              320509105: "吴江区震泽镇", 320509106: "吴江区七都镇",
              320509107: "吴江区桃源镇",
              // 常熟市乡镇
              320581006: "常熟市碧溪街道", 320581007: "常熟市东南街道",
              320581102: "常熟市梅李镇", 320581107: "常熟市古里镇",
              320581109: "常熟市支塘镇", 320581117: "常熟市尚湖镇",
              320581120: "常熟市辛庄镇",
              // 张家港市乡镇
              320582102: "张家港市塘桥镇", 320582103: "张家港市金港镇",
              320582105: "张家港市锦丰镇", 320582107: "张家港市乐余镇",
              320582110: "张家港市大新镇", 320582403: "张家港市双山香山旅游度假区",
              // 昆山市乡镇
              320583100: "昆山市玉山镇", 320583107: "昆山市周市镇",
              320583108: "昆山市陆家镇", 320583110: "昆山市千灯镇",
              320583111: "昆山市淀山湖镇",
              // 太仓市乡镇
              320585100: "太仓市城厢镇", 320585103: "太仓市浮桥镇",
              320585105: "太仓市双凤镇", 320585109: "太仓市沙溪镇",
              320585110: "太仓市浏河镇", 320585111: "太仓市璜泾镇",
              320585402: "太仓市港区", 320585498: "太仓市科教新城",
              320585500: "太仓市陆渡街道",
              // 苏州工业园区
              320591407: "工业园区胜浦街道", 320591408: "工业园区唯亭街道",
              320591409: "工业园区斜塘街道", 320591410: "工业园区娄葑街道",
            };
            // 行业监管分类映射（GB/T 4754—2017 门类 + 地方监管细分）
            const industryCodeMap: Record<string, string> = {
              "A": "农、林、牧、渔业", "B": "采矿业", "C": "制造业",
              "D": "电力、热力、燃气及水生产和供应业", "E": "建筑业",
              "F": "批发和零售业", "G": "交通运输、仓储和邮政业",
              "H": "住宿和餐饮业", "I": "信息传输、软件和信息技术服务业",
              "J": "金融业", "K": "房地产业", "L": "租赁和商务服务业",
              "M": "科学研究和技术服务业", "N": "水利、环境和公共设施管理业",
              "O": "居民服务、修理和其他服务业",
              "E_1": "房屋建筑业", "E_2": "土木工程建筑业", "E_3": "建筑安装业",
              "E_4": "建筑装饰、装修和其他建筑业", "E_5": "市政公用工程",
              "E_6": "钢结构工程", "E_8": "地基基础工程",
            };
            const boolValueMap: Record<string, string> = {
              "是否上报风险报告": value === 1 ? "已上报" : "未上报",
              "是否规上企业": value === 1 ? "是" : "否",
              "企业规模": ({ 1: "大型", 2: "中型", 3: "小型", 4: "微型" } as Record<number, string>)[value as number] || String(value),
              "经营状态": value === 1 ? "正常" : "非正常",
              "是否有效": value === 1 ? "有效" : "无效",
              "所在省": regionCodeMap[value as number] || String(value),
              "所在市": regionCodeMap[value as number] || String(value),
              "所在县（市、区）": regionCodeMap[value as number] || String(value),
              "所在乡镇（街道）": regionCodeMap[value as number] || String(value),
              "区县编码": regionCodeMap[value as number] || String(value),
              // 金额/面积字段加单位
              "占地面积": typeof value === "number" ? value.toLocaleString() + " ㎡" : String(value),
              "上一年经营收入": typeof value === "number" ? "¥" + value.toLocaleString() : String(value),
              "固定资产": typeof value === "number" ? "¥" + value.toLocaleString() : String(value),
              // 行业监管分类：编码后加详细类别名
              "行业监管大类": industryCodeMap[String(value)] ? String(value) + "（" + industryCodeMap[String(value)] + "）" : String(value),
              "行业监管小类": String(value),
            };
            const displayValue = boolValueMap[key] !== undefined ? boolValueMap[key] : String(value);
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
                <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{displayValue}</div>
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
              // 排除内部字段
              const excludeKeys = ["工艺流程内容", "主键ID", "报告历史ID", "时间戳", "删除标识", "主要负责人电话", "安全负责人电话"];
              if (excludeKeys.includes(key) || value === null || value === undefined || value === "") return null;
              // 安全信息友好映射
              const safetyLabelMap: Record<string, string> = {
                "企业主要负责人": "企业主要负责人", "企业安全负责人": "企业安全负责人",
                "安全管理部门": "安全管理部门", "安全总监": "安全总监",
                "企业职工总人数": "企业职工总人数", "企业职工外用总人数": "企业职工外用总人数",
                "专职安全生产管理人员数": "专职安全员人数", "兼职安全生产管理人员数": "兼职安全员人数",
                "专职安全生产管理人持证员数": "专职安全员持证人数", "兼职安全生产管理人持证员数": "兼职安全员持证人数",
                "特种作业人数持证人数": "特种作业持证人数", "部门安全管理人员数量": "部门安全员人数",
                "企业安全管理人员数量": "企业安全员人数",
                "从业人员本科占比": "本科及以上占比（%）",
                "上一年人员流动率": "人员流动率（%）",
                "工伤保险支出（万元）": "工伤保险支出（万元）",
                "投保人数": "投保人数",
                "是否投保": "是否投保", "是否履行三同时手续": "是否履行三同时",
                "主要负责人证书": "主要负责人持证", "安全负责人证书": "安全负责人持证",
                // "主要负责人电话": "主要负责人电话", // 数据已脱敏加密，显示为乱码，隐藏
                // "安全负责人电话": "安全负责人电话", // 数据已脱敏加密，显示为乱码，隐藏
                "安全生产标准化建设情况": "安全生产标准化等级",
              };
              const displayLabel = safetyLabelMap[key] || key;
              // 0/1 标记友好显示
              const safetyValueMap: Record<string, string> = {
                "是否投保": value === 1 ? "已投保" : "未投保",
                "是否履行三同时手续": value === 1 ? "已履行" : "未履行",
                "主要负责人证书": value === 1 ? "有" : "无",
                "安全负责人证书": value === 1 ? "有" : "无",
                "安全总监": value === 1 ? "已设置" : "未设置",
                "安全生产标准化建设情况": ({ 0: "未评定", 1: "一级", 2: "二级", 3: "三级", 4: "四级", 5: "五级" } as Record<number, string>)[value as number] || String(value),
              };
              const displayValue = safetyValueMap[key] !== undefined ? safetyValueMap[key] : String(value);
              const colors = ["#ef4444", "#f97316", "#eab308", "#10b981", "#3b82f6", "#8b5cf6"];
              const c = colors[idx % colors.length];
              return (
                <div key={key} style={{
                  padding: "12px 16px",
                  backgroundColor: "rgba(15, 23, 42, 0.5)",
                  borderRadius: 10,
                  borderLeft: `3px solid ${c}`,
                }}>
                  <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>{displayLabel}</div>
                  <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{displayValue}</div>
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
