import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker as LeafletCircleMarker, LatLngBoundsExpression } from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { fetchEnterpriseDecisionPayload, fetchEnterpriseMapMarkers } from "../api/client";
import type { EnterpriseMapMarker, EnterpriseMapMeta, ScenarioId } from "../api/types";
import BatchDecisionPanel from "../components/BatchDecisionPanel";
import EnterpriseAmap3DMap from "../components/EnterpriseAmap3DMap";
import { useDecisionBatch } from "../context/DecisionBatchContext";
import { saveEnterprisePredictionImport } from "../lib/enterprisePredictionImport";
import { LEVEL_GLOW, RISK_LEVELS_CONFIG, riskLevelColor } from "../lib/riskLevels";
import "../styles/enterprise-map.css";

interface Props {
  scenario: ScenarioId;
}

const SUZHOU_CENTER: [number, number] = [31.298886, 120.585316];
const REFRESH_MS = 30_000;
type MapEngine = "2d" | "3d";

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

function FitToMarkers({ markers }: { markers: EnterpriseMapMarker[] }) {
  const map = useMap();

  useEffect(() => {
    if (!markers.length) return;
    const bounds: LatLngBoundsExpression = markers.map((m) => [m.lat, m.lng]);
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
  }, [map, markers]);

  return null;
}

export default function EnterpriseMapPage({ scenario }: Props) {
  const [markers, setMarkers] = useState<EnterpriseMapMarker[]>([]);
  const [meta, setMeta] = useState<EnterpriseMapMeta | null>(null);
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState("");
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [mapEngine, setMapEngine] = useState<MapEngine>("2d");
  const [listExpanded, setListExpanded] = useState(false);
  const [importingFolder, setImportingFolder] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [checkedFolders, setCheckedFolders] = useState<Set<string>>(new Set());
  const markerRefs = useRef<Record<string, LeafletCircleMarker | null>>({});
  const {
    batchLoading,
    batchInfo,
    batchStatus,
    startMapBatch,
    cancelBatch,
    clearBatch,
  } = useDecisionBatch();

  const loadMarkers = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
      return;
    }
    setMarkers(resp.markers);
    setMeta(resp.meta);
    setLoading(false);
  }, [keyword, level, trackedOnly]);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers]);

  useEffect(() => {
    const intervalMs = batchStatus && !["completed", "completed_with_errors", "cancelled"].includes(batchStatus.status)
      ? 10_000
      : REFRESH_MS;
    const id = window.setInterval(loadMarkers, intervalMs);
    return () => window.clearInterval(id);
  }, [loadMarkers, batchStatus?.status]);

  useEffect(() => {
    if (!batchStatus) return;
    if (["completed", "completed_with_errors", "cancelled"].includes(batchStatus.status)) {
      loadMarkers();
    }
  }, [batchStatus?.status, loadMarkers]);

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

  const mapSourceLabel = mapEngine === "3d" ? "高德 3D 底图" : "OpenStreetMap 底图";

  return (
    <div className="enterprise-map-page">
      <section className="enterprise-map-header scada-card">
        <div>
          <p className="section-kicker">实时空间态势</p>
          <h2>企业风险地图</h2>
          <p className="muted">
            {mapSourceLabel} · 当前场景 {scenario} · 批量预测仅调用 Stacking 模型（不调 GLM）
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
          {mapEngine === "2d" ? (
            <MapContainer center={SUZHOU_CENTER} zoom={12} scrollWheelZoom className="enterprise-leaflet-map">
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {!selectedFolder && <FitToMarkers markers={markers} />}
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
            </MapContainer>
          ) : (
            <EnterpriseAmap3DMap
              markers={markers}
              selectedFolder={selectedFolder}
              onSelect={selectMarker}
            />
          )}
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
