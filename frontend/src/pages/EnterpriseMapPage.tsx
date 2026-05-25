import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker as LeafletCircleMarker, LatLngBoundsExpression } from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { fetchEnterpriseMapMarkers } from "../api/client";
import type { EnterpriseMapMarker, EnterpriseMapMeta, ScenarioId } from "../api/types";
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

function FlyToSelected({ marker }: { marker?: EnterpriseMapMarker }) {
  const map = useMap();

  useEffect(() => {
    if (!marker) return;
    map.flyTo([marker.lat, marker.lng], 15, { duration: 0.8 });
  }, [map, marker]);

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
  const markerRefs = useRef<Record<string, LeafletCircleMarker | null>>({});

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
    const id = window.setInterval(loadMarkers, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadMarkers]);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.folder === selectedFolder),
    [markers, selectedFolder],
  );

  useEffect(() => {
    if (!selectedMarker) return;
    window.setTimeout(() => {
      markerRefs.current[selectedMarker.folder]?.openPopup();
    }, 250);
  }, [selectedMarker]);

  const levelCounts = useMemo(() => {
    return markers.reduce<Record<string, number>>((acc, marker) => {
      const key = marker.predicted_level || "未预测";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [markers]);

  function selectMarker(marker: EnterpriseMapMarker) {
    setSelectedFolder(marker.folder);
  }

  return (
    <div className="enterprise-map-page">
      <section className="enterprise-map-header scada-card">
        <div>
          <p className="section-kicker">实时空间态势</p>
          <h2>企业风险地图</h2>
          <p className="muted">
            OpenStreetMap 底图 · 当前场景 {scenario} · 每 30 秒刷新已跟踪预测状态
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
        <aside className="enterprise-map-sidebar scada-card">
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

          {loading && <div className="empty-state">正在加载地图点位...</div>}
          {error && <div className="empty-state danger">{error}</div>}
          {!loading && !error && !markers.length && <div className="empty-state">暂无符合条件的企业点位</div>}

          <div className="enterprise-map-list">
            {markers.map((marker) => (
              <button
                key={marker.folder}
                type="button"
                className={`enterprise-map-list-item ${selectedFolder === marker.folder ? "active" : ""}`}
                onClick={() => selectMarker(marker)}
              >
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
        </aside>

        <section className="enterprise-map-canvas scada-card">
          <MapContainer center={SUZHOU_CENTER} zoom={12} scrollWheelZoom className="enterprise-leaflet-map">
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!selectedMarker && <FitToMarkers markers={markers} />}
            <FlyToSelected marker={selectedMarker} />
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
        </section>
      </div>
    </div>
  );
}
