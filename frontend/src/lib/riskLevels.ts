export type RiskLevel = "红" | "橙" | "黄" | "蓝";

export const UNKNOWN_RISK_COLOR = "#64748b";

export const LEVEL_HEX: Record<string, string> = {
  红: "#ef4444",
  橙: "#f97316",
  黄: "#eab308",
  蓝: "#3b82f6",
};

export const LEVEL_GLOW: Record<string, string> = {
  红: "glow-red",
  橙: "glow-orange",
  黄: "glow-yellow",
  蓝: "glow-blue",
};

export const RISK_LEVELS_CONFIG = [
  { key: "红", label: "红色预警", color: LEVEL_HEX.红, bg: "rgba(239,68,68,0.12)", range: "≥ 0.80", desc: "极高风险，需立即处置" },
  { key: "橙", label: "橙色预警", color: LEVEL_HEX.橙, bg: "rgba(249,115,22,0.12)", range: "0.60-0.79", desc: "高风险，需限期整改" },
  { key: "黄", label: "黄色预警", color: LEVEL_HEX.黄, bg: "rgba(234,179,8,0.12)", range: "0.40-0.59", desc: "中等风险，需加强监控" },
  { key: "蓝", label: "蓝色预警", color: LEVEL_HEX.蓝, bg: "rgba(59,130,246,0.12)", range: "0.20-0.39", desc: "低风险，常规巡检" },
] as const;

export function riskLevelColor(level?: string | null): string {
  return level && level in LEVEL_HEX ? LEVEL_HEX[level as RiskLevel] : UNKNOWN_RISK_COLOR;
}
