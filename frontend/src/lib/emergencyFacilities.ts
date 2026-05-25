import type { EmergencyFacilityType } from "../api/types";

export const EMERGENCY_FACILITY_OPTIONS: Array<{ type: EmergencyFacilityType; label: string; defaultEnabled: boolean }> = [
  { type: "hospital", label: "医院", defaultEnabled: true },
  { type: "fire_station", label: "消防", defaultEnabled: true },
  { type: "emergency_center", label: "急救中心", defaultEnabled: true },
  { type: "police", label: "派出所", defaultEnabled: false },
];

export const EMERGENCY_FACILITY_COLORS: Record<EmergencyFacilityType, string> = {
  hospital: "#22c55e",
  fire_station: "#0ea5e9",
  emergency_center: "#a855f7",
  police: "#14b8a6",
};

export const EMERGENCY_FACILITY_SHORT_LABELS: Record<EmergencyFacilityType, string> = {
  hospital: "医",
  fire_station: "消",
  emergency_center: "急",
  police: "警",
};
