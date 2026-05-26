import type { EnterpriseMapMarker } from "../api/types";
import { LEVEL_HEX, UNKNOWN_RISK_COLOR } from "./riskLevels";

export interface RiskFieldBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** 苏州片区默认视野，用于 2D 地图尚未上报 bounds 时的急救设施查询。 */
export const SUZHOU_VIEW_BOUNDS: RiskFieldBounds = {
  north: 31.34,
  south: 31.25,
  east: 120.63,
  west: 120.54,
};

/**
 * 将 Leaflet / 高德 getBounds 结果规范为 API 可接受的经纬度框。
 * 动画或世界副本时 east 可能 >180，会导致后端 422 且设施点不刷新。
 */
export function normalizeMapBounds(raw: RiskFieldBounds): RiskFieldBounds | null {
  let north = clamp(raw.north, -90, 90);
  let south = clamp(raw.south, -90, 90);
  let east = clamp(raw.east, -180, 180);
  let west = clamp(raw.west, -180, 180);

  if (north < south) {
    [north, south] = [south, north];
  }
  if (east < west) {
    [east, west] = [west, east];
  }

  const latSpan = north - south;
  const lngSpan = east - west;
  if (latSpan <= 0 || lngSpan <= 0 || latSpan > 45 || lngSpan > 60) {
    return null;
  }
  return { north, south, east, west };
}

export interface RiskFieldOptions {
  radiusKm: number;
  opacity: number;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 128;
const DISTANCE_EPSILON_KM = 0.15;

const LEVEL_WEIGHTS: Record<string, number> = {
  红: 1,
  橙: 0.75,
  黄: 0.5,
  蓝: 0.35,
};

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorForMarker(marker: EnterpriseMapMarker): RgbColor {
  const level = marker.predicted_level || "";
  return hexToRgb(level && level in LEVEL_HEX ? LEVEL_HEX[level] : UNKNOWN_RISK_COLOR);
}

function weightForMarker(marker: EnterpriseMapMarker): number {
  const level = marker.predicted_level || "";
  const base = level && level in LEVEL_WEIGHTS ? LEVEL_WEIGHTS[level] : 0.08;
  const probability = marker.probability === null || marker.probability === undefined
    ? 0.7
    : clamp(marker.probability, 0, 1);
  return base * (0.5 + probability * 0.5);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function expandBounds(bounds: RiskFieldBounds, ratio = 0.1): RiskFieldBounds {
  const latPad = (bounds.north - bounds.south) * ratio;
  const lngPad = (bounds.east - bounds.west) * ratio;
  return {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    west: bounds.west - lngPad,
  };
}

function markerInBounds(marker: EnterpriseMapMarker, bounds: RiskFieldBounds): boolean {
  return marker.lat >= bounds.south && marker.lat <= bounds.north && marker.lng >= bounds.west && marker.lng <= bounds.east;
}

export function createRiskFieldDataUrl(
  markers: EnterpriseMapMarker[],
  bounds: RiskFieldBounds,
  options: RiskFieldOptions,
): string | null {
  if (!markers.length || bounds.north <= bounds.south || bounds.east <= bounds.west) return null;

  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const radiusKm = Math.max(0.5, options.radiusKm);
  const opacity = clamp(options.opacity, 0, 1);
  const expanded = expandBounds(bounds);
  const sourceMarkers = markers.filter((marker) => markerInBounds(marker, expanded));
  if (!sourceMarkers.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const image = ctx.createImageData(width, height);
  const weightedMarkers = sourceMarkers.map((marker) => ({
    marker,
    color: colorForMarker(marker),
    baseWeight: weightForMarker(marker),
  }));

  for (let y = 0; y < height; y += 1) {
    const lat = bounds.north - ((y + 0.5) / height) * (bounds.north - bounds.south);
    for (let x = 0; x < width; x += 1) {
      const lng = bounds.west + ((x + 0.5) / width) * (bounds.east - bounds.west);
      let totalWeight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;

      weightedMarkers.forEach(({ marker, color, baseWeight }) => {
        const distance = haversineKm(lat, lng, marker.lat, marker.lng);
        if (distance > radiusKm) return;
        const distanceWeight = ((radiusKm - distance) / radiusKm) ** 2 / (distance + DISTANCE_EPSILON_KM);
        const weight = baseWeight * distanceWeight;
        totalWeight += weight;
        red += color.r * weight;
        green += color.g * weight;
        blue += color.b * weight;
      });

      const offset = (y * width + x) * 4;
      if (totalWeight <= 0) {
        image.data[offset + 3] = 0;
        continue;
      }

      image.data[offset] = Math.round(red / totalWeight);
      image.data[offset + 1] = Math.round(green / totalWeight);
      image.data[offset + 2] = Math.round(blue / totalWeight);
      image.data[offset + 3] = Math.round(255 * opacity * clamp(Math.sqrt(totalWeight) / 1.8, 0, 1));
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
