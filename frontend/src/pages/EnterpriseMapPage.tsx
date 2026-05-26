import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker as LeafletCircleMarker, LatLngBoundsExpression } from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { fetchEmergencyFacilities, fetchEnterpriseDecisionPayload, fetchEnterpriseMapMarkers } from "../api/client";
import type { EmergencyFacilitiesMeta, EmergencyFacility, EmergencyFacilityType, EnterpriseMapMarker, EnterpriseMapMeta, ScenarioId } from "../api/types";
import BatchDecisionPanel from "../components/BatchDecisionPanel";
import EmergencyFacilitiesLayer from "../components/EmergencyFacilitiesLayer";
import EnterpriseAmap3DMap from "../components/EnterpriseAmap3DMap";
import RiskFieldLeafletLayer from "../components/RiskFieldLeafletLayer";
import { useDecisionBatch } from "../context/DecisionBatchContext";
import { purgeAmapDomArtifacts } from "../lib/amapLoader";
import { AMAP_TILE_ATTRIBUTION, AMAP_TILE_SUBDOMAINS, AMAP_TILE_URL } from "../lib/amapTiles";
import { EMERGENCY_FACILITY_COLORS, EMERGENCY_FACILITY_OPTIONS } from "../lib/emergencyFacilities";
import {
  emergencyTypesToSet,
  loadEnterpriseMapSettings,
  saveEnterpriseMapSettings,
  type MapEngine,
} from "../lib/enterpriseMapSettings";
import { saveEnterprisePredictionImport } from "../lib/enterprisePredictionImport";
import { normalizeMapBounds, SUZHOU_VIEW_BOUNDS, type RiskFieldBounds } from "../lib/riskField";
import { LEVEL_GLOW, RISK_LEVELS_CONFIG, riskLevelColor } from "../lib/riskLevels";
import "../styles/enterprise-map.css";

interface Props {
  scenario: ScenarioId;
}

const SUZHOU_CENTER: [number, number] = [31.298886, 120.585316];
const REFRESH_MS = 30_000;

function markerTag(level?: string | null): string {
  if (level === "红") return "tag-red";
  if (level === "橙") return "tag-orange";
  if (level === "黄") return "tag-amber";
  if (level === "蓝") return "tag-blue";
  return "tag-cyan";
}

function formatProbability(value?: number | null): string {
  if (value === null || value === undefined) return "暂无";
  return `${Math.round(value * 100)}%`;
}

function FlyToSelected({
  folder,
  markers,
}: {
  folder: string | null;
  markers: EnterpriseMapMarker[];
}) {
  const map = useMap();
  const lastFlownFolderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!folder) {
      lastFlownFolderRef.current = null;
      return;
    }
    if (lastFlownFolderRef.current === folder) return;

    const marker = markers.find((m) => m.folder === folder);
    if (!marker) return;

    lastFlownFolderRef.current = folder;
    map.flyTo([marker.lat, marker.lng], 15, { duration: 0.8 });
  }, [map, folder, markers]);

  return null;
}

function FitToMarkers({
  markers,
  fitKey,
  ready,
}: {
  markers: EnterpriseMapMarker[];
  fitKey: string;
  ready: boolean;
}) {
  const map = useMap();
  const lastFittedFitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !markers.length) return;
    if (lastFittedFitKeyRef.current === fitKey) return;
    lastFittedFitKeyRef.current = fitKey;
    const bounds: LatLngBoundsExpression = markers.map((m) => [m.lat, m.lng]);
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
  }, [map, markers, fitKey, ready]);

  return null;
}

/** 3D 卸载后 Leaflet 常在 0 尺寸容器内初始化，需主动 invalidateSize 才能加载瓦片。 */
function LeafletMapResizer() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => map.invalidateSize({ animate: false });

    invalidate();
    const raf1 = requestAnimationFrame(() => {
      invalidate();
      requestAnimationFrame(invalidate);
    });
    const timers = [80, 200, 400].map((ms) => window.setTimeout(invalidate, ms));

    const container = map.getContainer();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => invalidate())
      : null;
    observer?.observe(container);

    return () => {
      cancelAnimationFrame(raf1);
      timers.forEach((id) => window.clearTimeout(id));
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function MapBoundsReporter({ onBoundsChange }: { onBoundsChange: (bounds: RiskFieldBounds) => void }) {
  const map = useMap();

  const reportBounds = useCallback(() => {
    const bounds = map.getBounds();
    const normalized = normalizeMapBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
    if (normalized) onBoundsChange(normalized);
  }, [map, onBoundsChange]);

  useMapEvents({
    moveend: reportBounds,
    zoomend: reportBounds,
  });

  useEffect(() => {
    reportBounds();
  }, [reportBounds]);

  return null;
}

export default function EnterpriseMapPage({ scenario }: Props) {
  const storedSettings = useMemo(() => loadEnterpriseMapSettings(), []);
  const [markers, setMarkers] = useState<EnterpriseMapMarker[]>([]);
  const [meta, setMeta] = useState<EnterpriseMapMeta | null>(null);
  const [keyword, setKeyword] = useState(storedSettings.keyword);
  const [level, setLevel] = useState(storedSettings.level);
  const [trackedOnly, setTrackedOnly] = useState(storedSettings.trackedOnly);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [mapEngine, setMapEngine] = useState<MapEngine>(storedSettings.mapEngine);
  const [mapSurfaceReady, setMapSurfaceReady] = useState(true);
  const prevMapEngineRef = useRef<MapEngine>(storedSettings.mapEngine);
  const [listExpanded, setListExpanded] = useState(false);
  const [importingFolder, setImportingFolder] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [checkedFolders, setCheckedFolders] = useState<Set<string>>(new Set());
  const [showRiskField, setShowRiskField] = useState(storedSettings.showRiskField);
  const [riskFieldOpacity, setRiskFieldOpacity] = useState(storedSettings.riskFieldOpacity);
  const [riskFieldRadiusKm, setRiskFieldRadiusKm] = useState(storedSettings.riskFieldRadiusKm);
  const [showEmergencyFacilities, setShowEmergencyFacilities] = useState(storedSettings.showEmergencyFacilities);
  const [emergencyFacilityTypes, setEmergencyFacilityTypes] = useState<Set<EmergencyFacilityType>>(
    () => emergencyTypesToSet(storedSettings.emergencyFacilityTypes),
  );
  const [emergencyFacilities, setEmergencyFacilities] = useState<EmergencyFacility[]>([]);
  const [emergencyMeta, setEmergencyMeta] = useState<EmergencyFacilitiesMeta | null>(null);
  const [emergencyError, setEmergencyError] = useState("");
  const [mapBounds, setMapBounds] = useState<RiskFieldBounds | null>(null);
  const markerRefs = useRef<Record<string, LeafletCircleMarker | null>>({});
  const {
    batchLoading,
    batchInfo,
    batchStatus,
    startMapBatch,
    cancelBatch,
    clearBatch,
  } = useDecisionBatch();

  const loadMarkers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError("");
    const resp = await fetchEnterpriseMapMarkers({
      keyword: keyword || undefined,
      predicted_level: level || undefined,
      tracked_only: trackedOnly || undefined,
    });
    if (!resp?.success) {
      setError("企业地图数据加载失败，请检查后端服务。");
      setMarkers([]);
      setMeta(null);
      if (!options?.silent) setLoading(false);
      return;
    }
    setMarkers(resp.markers);
    setMeta(resp.meta);
    if (!options?.silent) setLoading(false);
  }, [keyword, level, trackedOnly]);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers]);

  useEffect(() => {
    const prev = prevMapEngineRef.current;
    if (prev === mapEngine) return;
    prevMapEngineRef.current = mapEngine;

    if (prev === "3d" && mapEngine === "2d") {
      setMapSurfaceReady(false);
      const timer = window.setTimeout(() => {
        purgeAmapDomArtifacts();
        setMapSurfaceReady(true);
      }, 120);
      return () => window.clearTimeout(timer);
    }

    setMapSurfaceReady(true);
  }, [mapEngine]);

  useEffect(() => {
    saveEnterpriseMapSettings({
      showRiskField,
      riskFieldOpacity,
      riskFieldRadiusKm,
      showEmergencyFacilities,
      emergencyFacilityTypes: [...emergencyFacilityTypes],
      mapEngine,
      keyword,
      level,
      trackedOnly,
    });
  }, [
    showRiskField,
    riskFieldOpacity,
    riskFieldRadiusKm,
    showEmergencyFacilities,
    emergencyFacilityTypes,
    mapEngine,
    keyword,
    level,
    trackedOnly,
  ]);

  useEffect(() => {
    const intervalMs = batchStatus && !["completed", "completed_with_errors", "cancelled"].includes(batchStatus.status)
      ? 10_000
      : REFRESH_MS;
    const id = window.setInterval(() => loadMarkers({ silent: true }), intervalMs);
    return () => window.clearInterval(id);
  }, [loadMarkers, batchStatus?.status]);

  useEffect(() => {
    if (!batchStatus) return;
    if (["completed", "completed_with_errors", "cancelled"].includes(batchStatus.status)) {
      loadMarkers();
    }
  }, [batchStatus?.status, loadMarkers]);

  const queryBounds = useMemo(() => {
    const normalized = mapBounds ? normalizeMapBounds(mapBounds) : null;
    return normalized ?? (mapEngine === "2d" ? SUZHOU_VIEW_BOUNDS : null);
  }, [mapBounds, mapEngine]);

  useEffect(() => {
    if (!showEmergencyFacilities || !queryBounds || emergencyFacilityTypes.size === 0) {
      setEmergencyFacilities([]);
      setEmergencyMeta(null);
      setEmergencyError("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetchEmergencyFacilities({
          min_lat: queryBounds.south,
          min_lng: queryBounds.west,
          max_lat: queryBounds.north,
          max_lng: queryBounds.east,
          types: [...emergencyFacilityTypes],
        });
        if (cancelled) return;
        if (!resp?.success) {
          setEmergencyFacilities([]);
          setEmergencyMeta(null);
          setEmergencyError("急救设施数据加载失败。");
          return;
        }
        setEmergencyFacilities(resp.facilities);
        setEmergencyMeta(resp.meta);
        setEmergencyError("");
      } catch (err) {
        if (cancelled) return;
        setEmergencyFacilities([]);
        setEmergencyMeta(null);
        setEmergencyError(err instanceof Error ? err.message : "急救设施数据加载失败。");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emergencyFacilityTypes, queryBounds, showEmergencyFacilities]);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.folder === selectedFolder),
    [markers, selectedFolder],
  );

  useEffect(() => {
    if (!selectedMarker || mapEngine !== "2d") return;
    window.setTimeout(() => {
      markerRefs.current[selectedMarker.folder]?.openPopup();
    }, 250);
  }, [mapEngine, selectedMarker]);

  const levelCounts = useMemo(() => {
    return markers.reduce<Record<string, number>>((acc, marker) => {
      const key = marker.predicted_level || "未预测";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [markers]);

  const unpredictedMarkers = useMemo(
    () => markers.filter((m) => !m.predicted_level),
    [markers],
  );

  const batchActive =
    batchLoading ||
    (batchStatus &&
      !["completed", "completed_with_errors", "cancelled"].includes(batchStatus.status));
  const batchFinished =
    batchStatus?.status === "completed" ||
    batchStatus?.status === "completed_with_errors" ||
    batchStatus?.status === "cancelled";

  function selectMarker(marker: EnterpriseMapMarker) {
    setSelectedFolder(marker.folder);
  }

  function toggleFolderCheck(folder: string, checked: boolean) {
    setCheckedFolders((prev) => {
      const next = new Set(prev);
      if (checked) next.add(folder);
      else next.delete(folder);
      return next;
    });
  }

  function toggleEmergencyFacilityType(type: EmergencyFacilityType, checked: boolean) {
    setEmergencyFacilityTypes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(type);
      else next.delete(type);
      return next;
    });
  }

  function selectAllVisible() {
    setCheckedFolders(new Set(markers.map((m) => m.folder)));
  }

  async function runMapBatch(options: {
    folders?: string[];
    skip_predicted?: boolean;
  }) {
    setError("");
    await startMapBatch({
      folders: options.folders,
      scenario,
      skip_predicted: options.skip_predicted,
      keyword: keyword || undefined,
      predicted_level: level || undefined,
      tracked_only: trackedOnly || undefined,
    });
  }

  async function importSelectedToPrediction() {
    if (!selectedMarker) return;
    setImportingFolder(selectedMarker.folder);
    const result = await fetchEnterpriseDecisionPayload(selectedMarker.folder);
    setImportingFolder(null);
    if (!result.ok) {
      if (result.status === 404) {
        setError(
          "决策载荷接口不可用（HTTP 404）。后端进程可能未加载最新代码，请重启 API：bash scripts/run_api.sh --reload",
        );
      } else if (result.status === 0) {
        setError(`无法连接后端：${result.detail}。请确认 API 已启动且 Vite 代理指向正确端口。`);
      } else {
        setError(`无法从企业库生成预测数据（HTTP ${result.status}）：${result.detail}`);
      }
      return;
    }
    const resp = result.data;
    if (!resp.success || !resp.payload || Object.keys(resp.payload).length === 0) {
      setError("企业档案已找到，但扁平化特征为空，请检查该企业 JSON 是否包含「详细数据」。");
      return;
    }
    saveEnterprisePredictionImport({
      enterpriseId: resp.enterprise_id,
      payload: resp.payload,
      name: resp.name,
      folder: resp.folder,
      hint: `已从企业库「${resp.name}」导入扁平化特征（${Object.keys(resp.payload).length} 个字段），可在预测页直接执行决策。`,
    });
    window.location.hash = "risk";
  }

  const mapSourceLabel = mapEngine === "3d" ? "高德 3D 底图" : "高德平面底图";
  const markerFitKey = useMemo(
    () => `${keyword}|${level}|${trackedOnly}`,
    [keyword, level, trackedOnly],
  );

  return (
    <div className="enterprise-map-page">
      <section className="enterprise-map-header scada-card">
        <div>
          <p className="section-kicker">实时空间态势</p>
          <h2>企业风险地图</h2>
          <p className="muted">
            {mapSourceLabel} · 当前场景 {scenario} · 批量预测仅调用 Stacking 模型
          </p>
        </div>
        <div className="enterprise-map-stats">
          <div><strong>{meta?.with_coordinates ?? 0}</strong><span>有效坐标</span></div>
          <div><strong>{meta?.tracked_count ?? 0}</strong><span>已跟踪</span></div>
          <div><strong>{meta?.returned ?? markers.length}</strong><span>当前显示</span></div>
          <div><strong>{meta?.skipped_no_coords ?? 0}</strong><span>缺坐标</span></div>
        </div>
      </section>

      <div className="enterprise-map-layout">
        <section className="enterprise-map-toolbar scada-card">
          {selectedMarker && (
            <div className="enterprise-map-selected-actions">
              <span className="enterprise-map-selected-label">
                已选：<strong>{selectedMarker.name}</strong>
                {selectedMarker.reported_level && (
                  <span className="muted"> · 历史评级 {selectedMarker.reported_level}</span>
                )}
              </span>
              <button
                type="button"
                className="scada-btn primary"
                disabled={importingFolder === selectedMarker.folder}
                onClick={importSelectedToPrediction}
              >
                {importingFolder === selectedMarker.folder ? "正在转换…" : "导入预测页并运行"}
              </button>
            </div>
          )}
          <div className="enterprise-map-batch-bar">
            <div className="enterprise-map-batch-actions">
              <button
                type="button"
                className="scada-btn primary"
                disabled={batchActive || !markers.length}
                onClick={() => runMapBatch({})}
              >
                {batchActive ? "批量模型预测进行中…" : `批量模型预测（${markers.length}）`}
              </button>
              <button
                type="button"
                className="scada-btn secondary"
                disabled={batchActive || !unpredictedMarkers.length}
                onClick={() => runMapBatch({ skip_predicted: true })}
              >
                仅未预测（{unpredictedMarkers.length}）
              </button>
              <button
                type="button"
                className="scada-btn secondary"
                disabled={batchActive || checkedFolders.size === 0}
                onClick={() => runMapBatch({ folders: [...checkedFolders] })}
              >
                预测已选（{checkedFolders.size}）
              </button>
              {batchActive && (
                <button type="button" className="scada-btn danger" onClick={() => cancelBatch()}>
                  终止批量任务
                </button>
              )}
              {batchFinished && (
                <button type="button" className="scada-btn secondary" onClick={() => clearBatch()}>
                  清除任务状态
                </button>
              )}
            </div>
            <label className="enterprise-map-checkbox">
              <input
                type="checkbox"
                checked={multiSelectMode}
                onChange={(e) => {
                  setMultiSelectMode(e.target.checked);
                  if (!e.target.checked) setCheckedFolders(new Set());
                }}
              />
              多选模式
            </label>
            {multiSelectMode && (
              <div className="enterprise-map-batch-select-tools">
                <button type="button" className="scada-btn secondary" onClick={selectAllVisible}>
                  全选当前列表
                </button>
                <button
                  type="button"
                  className="scada-btn secondary"
                  onClick={() => setCheckedFolders(new Set())}
                >
                  清空选择
                </button>
              </div>
            )}
            {batchInfo && <p className="enterprise-map-batch-info muted">{batchInfo}</p>}
            {batchStatus && <BatchDecisionPanel status={batchStatus} />}
          </div>

          <div className="enterprise-map-controls">
            <label>
              企业搜索
              <input
                className="scada-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入企业名称"
              />
            </label>
            <label>
              风险等级
              <select className="scada-select" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">全部等级</option>
                <option value="红">红</option>
                <option value="橙">橙</option>
                <option value="黄">黄</option>
                <option value="蓝">蓝</option>
              </select>
            </label>
            <label className="enterprise-map-checkbox">
              <input
                type="checkbox"
                checked={trackedOnly}
                onChange={(e) => setTrackedOnly(e.target.checked)}
              />
              仅显示已跟踪预测企业
            </label>
          </div>

          <div className="enterprise-map-layer-controls">
            <div className="enterprise-map-layer-group">
              <label className="enterprise-map-checkbox">
                <input
                  type="checkbox"
                  checked={showRiskField}
                  onChange={(e) => setShowRiskField(e.target.checked)}
                />
                显示风险场
              </label>
              <label>
                透明度 {Math.round(riskFieldOpacity * 100)}%
                <input
                  type="range"
                  min="0.2"
                  max="0.7"
                  step="0.05"
                  value={riskFieldOpacity}
                  disabled={!showRiskField}
                  onChange={(e) => setRiskFieldOpacity(Number(e.target.value))}
                />
              </label>
              <label>
                影响半径
                <select
                  className="scada-select"
                  value={riskFieldRadiusKm}
                  disabled={!showRiskField}
                  onChange={(e) => setRiskFieldRadiusKm(Number(e.target.value))}
                >
                  <option value={2}>2 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                </select>
              </label>
            </div>

            <div className="enterprise-map-layer-group">
              <label className="enterprise-map-checkbox">
                <input
                  type="checkbox"
                  checked={showEmergencyFacilities}
                  onChange={(e) => setShowEmergencyFacilities(e.target.checked)}
                />
                显示急救设施
              </label>
              {EMERGENCY_FACILITY_OPTIONS.map((item) => (
                <label key={item.type} className="enterprise-map-checkbox">
                  <input
                    type="checkbox"
                    checked={emergencyFacilityTypes.has(item.type)}
                    disabled={!showEmergencyFacilities}
                    onChange={(e) => toggleEmergencyFacilityType(item.type, e.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
              {showEmergencyFacilities && (
                <>
                  <span className="enterprise-map-layer-meta">
                    {emergencyError
                      || (emergencyFacilities.length === 0
                        ? "暂无设施数据，请运行 python scripts/fetch_emergency_facilities.py"
                        : `设施 ${emergencyFacilities.length} 个${
                            emergencyMeta?.source === "static" && emergencyMeta.cached
                              ? "（缓存）"
                              : ""
                          }`)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="enterprise-map-legend">
            {RISK_LEVELS_CONFIG.map((item) => (
              <span key={item.key} className="legend-item">
                <i style={{ background: item.color }} />
                {item.key} {levelCounts[item.key] || 0}
              </span>
            ))}
            <span className="legend-item">
              <i className="legend-unknown" />
              未预测 {levelCounts["未预测"] || 0}
            </span>
            {showEmergencyFacilities && EMERGENCY_FACILITY_OPTIONS.map((item) => (
              <span key={item.type} className="legend-item">
                <i style={{ background: EMERGENCY_FACILITY_COLORS[item.type] }} />
                {item.label}
              </span>
            ))}
          </div>
        </section>

        <section className="enterprise-map-canvas scada-card">
          <div className="enterprise-map-engine-toggle" aria-label="地图模式切换">
            <button
              type="button"
              className={mapEngine === "2d" ? "active" : ""}
              onClick={() => setMapEngine("2d")}
            >
              2D 平面
            </button>
            <button
              type="button"
              className={mapEngine === "3d" ? "active" : ""}
              onClick={() => setMapEngine("3d")}
            >
              3D 倾斜
            </button>
          </div>
          <div key={`${mapEngine}-${mapSurfaceReady ? "ready" : "pending"}`} className="enterprise-map-engine-host">
            {!mapSurfaceReady ? (
              <div className="enterprise-map-engine-placeholder" aria-hidden />
            ) : mapEngine === "2d" ? (
              <MapContainer
                key="enterprise-leaflet-2d"
                center={SUZHOU_CENTER}
                zoom={12}
                scrollWheelZoom
                className="enterprise-leaflet-map"
              >
                <LeafletMapResizer />
                <TileLayer
                  attribution={AMAP_TILE_ATTRIBUTION}
                  url={AMAP_TILE_URL}
                  subdomains={AMAP_TILE_SUBDOMAINS}
                />
                {!selectedFolder && (
                <FitToMarkers markers={markers} fitKey={markerFitKey} ready={!loading} />
              )}
              <MapBoundsReporter onBoundsChange={setMapBounds} />
              <RiskFieldLeafletLayer
                markers={markers}
                visible={showRiskField}
                opacity={riskFieldOpacity}
                radiusKm={riskFieldRadiusKm}
              />
              <FlyToSelected folder={selectedFolder} markers={markers} />
              {markers.map((marker) => {
                const color = riskLevelColor(marker.predicted_level);
                return (
                  <CircleMarker
                    key={marker.folder}
                    center={[marker.lat, marker.lng]}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: marker.tracked ? 0.82 : 0.48,
                      weight: selectedFolder === marker.folder ? 4 : 2,
                    }}
                    radius={selectedFolder === marker.folder ? 10 : marker.tracked ? 8 : 6}
                    eventHandlers={{ click: () => selectMarker(marker) }}
                    ref={(ref) => {
                      markerRefs.current[marker.folder] = ref;
                    }}
                  >
                    <Popup>
                      <div className="enterprise-map-popup">
                        <strong>{marker.name}</strong>
                        <span>{marker.industry || "其他行业"}</span>
                        <span className={LEVEL_GLOW[marker.predicted_level || ""] || ""}>
                          模型等级：{marker.predicted_level || "未预测"}
                        </span>
                        <span>置信度：{formatProbability(marker.probability)}</span>
                        <span>历史评级：{marker.reported_level || "暂无"}</span>
                        {marker.last_predicted_at && <span>最近预测：{marker.last_predicted_at}</span>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
                {showEmergencyFacilities && <EmergencyFacilitiesLayer facilities={emergencyFacilities} />}
              </MapContainer>
            ) : (
              <EnterpriseAmap3DMap
                key="enterprise-amap-3d"
                markers={markers}
                selectedFolder={selectedFolder}
                onSelect={selectMarker}
                showRiskField={showRiskField}
                riskFieldOpacity={riskFieldOpacity}
                riskFieldRadiusKm={riskFieldRadiusKm}
                facilities={showEmergencyFacilities ? emergencyFacilities : []}
                onBoundsChange={setMapBounds}
              />
            )}
          </div>
        </section>

        <section className={`enterprise-map-list-panel scada-card ${listExpanded ? "expanded" : "collapsed"}`}>
          <button
            type="button"
            className="enterprise-map-list-toggle"
            aria-expanded={listExpanded}
            onClick={() => setListExpanded((open) => !open)}
          >
            <span className="enterprise-map-list-toggle-title">企业列表</span>
            <span className="enterprise-map-list-toggle-meta">
              {loading ? "加载中…" : `共 ${markers.length} 家`}
              {selectedMarker ? ` · 已选 ${selectedMarker.name}` : ""}
            </span>
            <span className="enterprise-map-list-toggle-icon" aria-hidden>
              {listExpanded ? "收起" : "展开"}
            </span>
          </button>

          {listExpanded && (
            <div className="enterprise-map-list-body">
              {loading && <div className="empty-state">正在加载地图点位...</div>}
              {error && <div className="empty-state danger">{error}</div>}
              {!loading && !error && !markers.length && (
                <div className="empty-state">暂无符合条件的企业点位</div>
              )}
              <div className="enterprise-map-list">
                {markers.map((marker) => (
                  <button
                    key={marker.folder}
                    type="button"
                    className={`enterprise-map-list-item ${selectedFolder === marker.folder ? "active" : ""}`}
                    onClick={() => selectMarker(marker)}
                  >
                    {multiSelectMode && (
                      <input
                        type="checkbox"
                        className="enterprise-map-list-check"
                        checked={checkedFolders.has(marker.folder)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleFolderCheck(marker.folder, e.target.checked)}
                      />
                    )}
                    <span className="enterprise-name">{marker.name}</span>
                    <span className="enterprise-meta">{marker.industry || "其他行业"}</span>
                    <span className="enterprise-map-tags">
                      <span className={`tag ${markerTag(marker.predicted_level)}`}>
                        {marker.predicted_level || "未预测"}
                      </span>
                      {marker.tracked && <span className="tag tag-emerald">已跟踪</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
