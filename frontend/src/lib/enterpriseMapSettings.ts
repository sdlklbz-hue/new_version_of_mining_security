import type { EmergencyFacilityType } from "../api/types";
import { EMERGENCY_FACILITY_OPTIONS } from "./emergencyFacilities";

export const ENTERPRISE_MAP_SETTINGS_KEY = "mra:enterprise-map:settings";

export type MapEngine = "2d" | "3d";

export interface EnterpriseMapSettings {
  showRiskField: boolean;
  riskFieldOpacity: number;
  riskFieldRadiusKm: number;
  showEmergencyFacilities: boolean;
  emergencyFacilityTypes: EmergencyFacilityType[];
  mapEngine: MapEngine;
  keyword: string;
  level: string;
  trackedOnly: boolean;
}

const VALID_FACILITY_TYPES = new Set(EMERGENCY_FACILITY_OPTIONS.map((item) => item.type));
const VALID_RADIUS_KM = new Set([2, 5, 10]);
const VALID_LEVELS = new Set(["", "红", "橙", "黄", "蓝"]);

function defaultEmergencyTypes(): EmergencyFacilityType[] {
  return EMERGENCY_FACILITY_OPTIONS.filter((item) => item.defaultEnabled).map((item) => item.type);
}

export function defaultEnterpriseMapSettings(): EnterpriseMapSettings {
  return {
    showRiskField: false,
    riskFieldOpacity: 0.45,
    riskFieldRadiusKm: 5,
    showEmergencyFacilities: false,
    emergencyFacilityTypes: defaultEmergencyTypes(),
    mapEngine: "2d",
    keyword: "",
    level: "",
    trackedOnly: false,
  };
}

function clampOpacity(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.45;
  return Math.min(0.7, Math.max(0.2, Math.round(numeric / 0.05) * 0.05));
}

function parseSettings(raw: unknown): EnterpriseMapSettings {
  const defaults = defaultEnterpriseMapSettings();
  if (!raw || typeof raw !== "object") return defaults;

  const source = raw as Record<string, unknown>;
  const mapEngine: MapEngine = source.mapEngine === "3d" ? "3d" : "2d";

  let riskFieldRadiusKm = Number(source.riskFieldRadiusKm);
  if (!VALID_RADIUS_KM.has(riskFieldRadiusKm)) {
    riskFieldRadiusKm = defaults.riskFieldRadiusKm;
  }

  let emergencyFacilityTypes = Array.isArray(source.emergencyFacilityTypes)
    ? source.emergencyFacilityTypes.filter(
        (type): type is EmergencyFacilityType =>
          typeof type === "string" && VALID_FACILITY_TYPES.has(type as EmergencyFacilityType),
      )
    : defaults.emergencyFacilityTypes;
  if (!emergencyFacilityTypes.length) {
    emergencyFacilityTypes = defaults.emergencyFacilityTypes;
  }

  const level =
    typeof source.level === "string" && VALID_LEVELS.has(source.level)
      ? source.level
      : defaults.level;

  return {
    showRiskField: Boolean(source.showRiskField),
    riskFieldOpacity: clampOpacity(source.riskFieldOpacity),
    riskFieldRadiusKm,
    showEmergencyFacilities: Boolean(source.showEmergencyFacilities),
    emergencyFacilityTypes,
    mapEngine,
    keyword: typeof source.keyword === "string" ? source.keyword : defaults.keyword,
    level,
    trackedOnly: Boolean(source.trackedOnly),
  };
}

export function loadEnterpriseMapSettings(): EnterpriseMapSettings {
  try {
    const raw = sessionStorage.getItem(ENTERPRISE_MAP_SETTINGS_KEY);
    if (!raw) return defaultEnterpriseMapSettings();
    return parseSettings(JSON.parse(raw));
  } catch {
    return defaultEnterpriseMapSettings();
  }
}

export function saveEnterpriseMapSettings(settings: EnterpriseMapSettings): void {
  try {
    sessionStorage.setItem(ENTERPRISE_MAP_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private browsing
  }
}

export function emergencyTypesToSet(types: EmergencyFacilityType[]): Set<EmergencyFacilityType> {
  return new Set(types);
}
