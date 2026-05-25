import { useCallback, useEffect, useRef, useState } from "react";
import type { EmergencyFacility, EnterpriseMapMarker } from "../api/types";
import { loadAmap, type AMapNamespace } from "../lib/amapLoader";
import { EMERGENCY_FACILITY_COLORS, EMERGENCY_FACILITY_SHORT_LABELS } from "../lib/emergencyFacilities";
import { createRiskFieldDataUrl, normalizeMapBounds, type RiskFieldBounds } from "../lib/riskField";
import { riskLevelColor } from "../lib/riskLevels";

interface Props {
  markers: EnterpriseMapMarker[];
  selectedFolder: string | null;
  onSelect: (marker: EnterpriseMapMarker) => void;
  showRiskField?: boolean;
  riskFieldOpacity?: number;
  riskFieldRadiusKm?: number;
  facilities?: EmergencyFacility[];
  onBoundsChange?: (bounds: RiskFieldBounds) => void;
}

const SUZHOU_CENTER_LNG_LAT: [number, number] = [120.585316, 31.298886];
const DEFAULT_ZOOM = 12;
const SELECTED_ZOOM = 15;
const FIT_VIEW_MAX_ZOOM = 13;
const FIT_VIEW_PADDING: [number, number, number, number] = [32, 32, 32, 32];

function markerSetSignature(markers: EnterpriseMapMarker[]): string {
  return markers.map((m) => m.folder).sort().join("|");
}

function formatProbability(value?: number | null): string {
  if (value === null || value === undefined) return "暂无";
  return `${Math.round(value * 100)}%`;
}

function amapBoundsToRiskBounds(bounds: any): RiskFieldBounds | null {
  const southWest = typeof bounds?.getSouthWest === "function" ? bounds.getSouthWest() : null;
  const northEast = typeof bounds?.getNorthEast === "function" ? bounds.getNorthEast() : null;
  if (!southWest || !northEast) return null;

  const west = typeof southWest.getLng === "function" ? southWest.getLng() : southWest.lng;
  const south = typeof southWest.getLat === "function" ? southWest.getLat() : southWest.lat;
  const east = typeof northEast.getLng === "function" ? northEast.getLng() : northEast.lng;
  const north = typeof northEast.getLat === "function" ? northEast.getLat() : northEast.lat;
  if ([north, south, east, west].some((value) => typeof value !== "number")) return null;
  return { north, south, east, west };
}

function createInfoContent(marker: EnterpriseMapMarker): HTMLDivElement {
  const content = document.createElement("div");
  content.className = "enterprise-map-popup enterprise-amap-popup";

  const title = document.createElement("strong");
  title.textContent = marker.name;
  content.appendChild(title);

  const fields = [
    marker.industry || "其他行业",
    `模型等级：${marker.predicted_level || "未预测"}`,
    `置信度：${formatProbability(marker.probability)}`,
    `历史评级：${marker.reported_level || "暂无"}`,
    marker.last_predicted_at ? `最近预测：${marker.last_predicted_at}` : "",
  ].filter(Boolean);

  fields.forEach((field) => {
    const item = document.createElement("span");
    item.textContent = field;
    content.appendChild(item);
  });

  return content;
}

function createFacilityInfoContent(facility: EmergencyFacility): HTMLDivElement {
  const content = document.createElement("div");
  content.className = "enterprise-map-popup enterprise-amap-popup";

  const title = document.createElement("strong");
  title.textContent = `${EMERGENCY_FACILITY_SHORT_LABELS[facility.type] || "设"} ${facility.name}`;
  content.appendChild(title);

  [facility.type_label, facility.address].filter(Boolean).forEach((field) => {
    const item = document.createElement("span");
    item.textContent = field;
    content.appendChild(item);
  });

  return content;
}

export default function EnterpriseAmap3DMap({
  markers,
  selectedFolder,
  onSelect,
  showRiskField = false,
  riskFieldOpacity = 0.45,
  riskFieldRadiusKm = 5,
  facilities = [],
  onBoundsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const facilityOverlaysRef = useRef<any[]>([]);
  const riskFieldLayerRef = useRef<any>(null);
  const riskFieldTimerRef = useRef<number | null>(null);
  const infoWindowRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const fitSignatureRef = useRef("");
  const lastCenteredFolderRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;

    loadAmap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        const map = new AMap.Map(containerRef.current, {
          center: SUZHOU_CENTER_LNG_LAT,
          pitch: 50,
          pitchEnable: true,
          rotateEnable: true,
          rotation: -15,
          viewMode: "3D",
          zoom: DEFAULT_ZOOM,
          zooms: [2, 20],
        });

        mapRef.current = map;
        map.on("complete", () => {
          if (!cancelled) setReady(true);
        });

        map.addControl(new AMap.ControlBar({ position: { right: "10px", top: "10px" } }));
        map.addControl(new AMap.ToolBar({ position: { right: "40px", top: "110px" } }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "高德 3D 地图加载失败");
      });

    return () => {
      cancelled = true;
      overlaysRef.current = [];
      facilityOverlaysRef.current = [];
      riskFieldLayerRef.current = null;
      if (riskFieldTimerRef.current !== null) window.clearTimeout(riskFieldTimerRef.current);
      infoWindowRef.current = null;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!ready || !AMap || !map) return;

    const clearRiskField = () => {
      if (riskFieldLayerRef.current) {
        map.remove(riskFieldLayerRef.current);
        riskFieldLayerRef.current = null;
      }
    };

    const redrawRiskField = () => {
      if (!showRiskField) {
        clearRiskField();
        return;
      }

      const mapBounds = map.getBounds();
      const riskBounds = amapBoundsToRiskBounds(mapBounds);
      if (!riskBounds) {
        clearRiskField();
        return;
      }

      const dataUrl = createRiskFieldDataUrl(markers, riskBounds, {
        opacity: riskFieldOpacity,
        radiusKm: riskFieldRadiusKm,
      });

      clearRiskField();
      if (!dataUrl) return;

      const southWest = new AMap.LngLat(riskBounds.west, riskBounds.south);
      const northEast = new AMap.LngLat(riskBounds.east, riskBounds.north);
      riskFieldLayerRef.current = new AMap.ImageLayer({
        url: dataUrl,
        bounds: new AMap.Bounds(southWest, northEast),
        opacity: 1,
        zIndex: 40,
        zooms: [2, 20],
      });
      map.add(riskFieldLayerRef.current);
    };

    const scheduleRiskField = () => {
      if (riskFieldTimerRef.current !== null) window.clearTimeout(riskFieldTimerRef.current);
      riskFieldTimerRef.current = window.setTimeout(redrawRiskField, 180);
    };

    scheduleRiskField();
    map.on("moveend", scheduleRiskField);
    map.on("zoomend", scheduleRiskField);
    return () => {
      if (riskFieldTimerRef.current !== null) window.clearTimeout(riskFieldTimerRef.current);
      map.off("moveend", scheduleRiskField);
      map.off("zoomend", scheduleRiskField);
      clearRiskField();
    };
  }, [markers, ready, riskFieldOpacity, riskFieldRadiusKm, showRiskField]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !onBoundsChange) return;

    const reportBounds = () => {
      const bounds = amapBoundsToRiskBounds(map.getBounds());
      const normalized = bounds ? normalizeMapBounds(bounds) : null;
      if (normalized) onBoundsChange(normalized);
    };

    reportBounds();
    map.on("moveend", reportBounds);
    map.on("zoomend", reportBounds);
    return () => {
      map.off("moveend", reportBounds);
      map.off("zoomend", reportBounds);
    };
  }, [onBoundsChange, ready]);

  const openInfoWindow = useCallback((marker: EnterpriseMapMarker) => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -8) });
    }
    infoWindowRef.current.setContent(createInfoContent(marker));
    infoWindowRef.current.open(map, [marker.lng, marker.lat]);
  }, []);

  const openFacilityInfoWindow = useCallback((facility: EmergencyFacility) => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!AMap || !map) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -8) });
    }
    infoWindowRef.current.setContent(createFacilityInfoContent(facility));
    infoWindowRef.current.open(map, [facility.lng, facility.lat]);
  }, []);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!ready || !AMap || !map) return;

    if (overlaysRef.current.length) {
      map.remove(overlaysRef.current);
      overlaysRef.current = [];
    }

    const overlays = markers.map((marker) => {
      const color = riskLevelColor(marker.predicted_level);
      const isSelected = marker.folder === selectedFolder;
      const overlay = new AMap.CircleMarker({
        center: [marker.lng, marker.lat],
        cursor: "pointer",
        fillColor: color,
        fillOpacity: marker.tracked ? 0.82 : 0.48,
        radius: isSelected ? 10 : marker.tracked ? 8 : 6,
        strokeColor: color,
        strokeOpacity: 1,
        strokeWeight: isSelected ? 4 : 2,
        zIndex: isSelected ? 120 : marker.tracked ? 90 : 70,
      });

      overlay.on("click", () => {
        onSelectRef.current(marker);
        openInfoWindow(marker);
      });
      return overlay;
    });

    overlaysRef.current = overlays;
    if (overlays.length) {
      map.add(overlays);
    }

    const signature = markerSetSignature(markers);
    if (!overlays.length) {
      fitSignatureRef.current = "";
      map.setZoomAndCenter(DEFAULT_ZOOM, SUZHOU_CENTER_LNG_LAT);
      return;
    }

    if (signature !== fitSignatureRef.current) {
      map.setFitView(overlays, false, FIT_VIEW_PADDING, FIT_VIEW_MAX_ZOOM);
      fitSignatureRef.current = signature;
    }
  }, [markers, openInfoWindow, ready, selectedFolder]);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!ready || !AMap || !map) return;

    if (facilityOverlaysRef.current.length) {
      map.remove(facilityOverlaysRef.current);
      facilityOverlaysRef.current = [];
    }

    const overlays = facilities.map((facility) => {
      const color = EMERGENCY_FACILITY_COLORS[facility.type] || "#94a3b8";
      const overlay = new AMap.CircleMarker({
        center: [facility.lng, facility.lat],
        cursor: "pointer",
        fillColor: color,
        fillOpacity: 0.78,
        radius: 11,
        strokeColor: color,
        strokeOpacity: 1,
        strokeWeight: 2,
        zIndex: 130,
      });
      overlay.on("click", () => openFacilityInfoWindow(facility));
      return overlay;
    });

    facilityOverlaysRef.current = overlays;
    if (overlays.length) {
      map.add(overlays);
    }

    return () => {
      if (facilityOverlaysRef.current.length) {
        map.remove(facilityOverlaysRef.current);
        facilityOverlaysRef.current = [];
      }
    };
  }, [facilities, openFacilityInfoWindow, ready]);

  useEffect(() => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    if (!ready || !AMap || !map) return;

    if (!selectedFolder) {
      lastCenteredFolderRef.current = null;
      return;
    }

    if (lastCenteredFolderRef.current === selectedFolder) return;

    const selected = markers.find((marker) => marker.folder === selectedFolder);
    if (!selected) return;

    lastCenteredFolderRef.current = selectedFolder;
    map.setZoomAndCenter(
      SELECTED_ZOOM,
      new AMap.LngLat(selected.lng, selected.lat),
      false,
      600,
    );
    openInfoWindow(selected);
  }, [markers, openInfoWindow, ready, selectedFolder]);

  return (
    <div className="enterprise-amap-shell">
      <div ref={containerRef} className="enterprise-amap-map" />
      {error && (
        <div className="enterprise-amap-message">
          <strong>高德 3D 地图不可用</strong>
          <span>{error}</span>
          <span>请在 `frontend/.env.local` 配置 VITE_AMAP_KEY 与 VITE_AMAP_SECURITY_CODE。</span>
        </div>
      )}
    </div>
  );
}
