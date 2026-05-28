import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchEnterpriseDbList,
  fetchEnterpriseDbDetail,
  fetchIndustryList,
  type EnterpriseListItem,
  type EnterpriseDetailResponse,
} from "../api/client";
import EnterpriseDetailPanel from "./EnterpriseDetailPanel";
import IndustrialIcon from "../components/IndustrialIcon";

const RISK_LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  D: { label: "重大风险", color: "#ef4444", bg: "rgba(239,68,68,0.15)", glow: "0 0 20px rgba(239,68,68,0.4)" },
  C: { label: "较大风险", color: "#f97316", bg: "rgba(249,115,22,0.15)", glow: "0 0 20px rgba(249,115,22,0.4)" },
  B: { label: "一般风险", color: "#eab308", bg: "rgba(234,179,8,0.15)", glow: "0 0 20px rgba(234,179,8,0.3)" },
  A: { label: "低风险", color: "#10b981", bg: "rgba(16,185,129,0.15)", glow: "0 0 20px rgba(16,185,129,0.3)" },
};

const SCALE_CONFIG: Record<string, { icon: string; color: string }> = {
  "大型": { icon: "enterprise", color: "#3b82f6" },
  "中型": { icon: "factory", color: "#f97316" },
  "小型": { icon: "database", color: "#eab308" },
  "微型": { icon: "knowledge", color: "#10b981" },
};

export default function EnterpriseProfilePage() {
  const [enterprises, setEnterprises] = useState<EnterpriseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selectedEnterprise, setSelectedEnterprise] = useState<EnterpriseDetailResponse | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageSize = 24;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchEnterpriseDbList({
        keyword: keyword || undefined,
        industry: industryFilter || undefined,
        risk_level: riskFilter || undefined,
        page,
        page_size: pageSize,
      });
      if (resp?.success) {
        setEnterprises(resp.enterprises);
        setTotal(resp.total);
      }
    } catch (e) {
      console.error("加载企业列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, [keyword, industryFilter, riskFilter, page]);

  useEffect(() => {
    fetchIndustryList().then((r) => {
      if (r?.success) setIndustries(r.industries);
    });
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const totalPages = Math.ceil(total / pageSize);

  const handleCardClick = useCallback(async (folder: string) => {
    setDetailLoading(true);
    setSelectedFolder(folder);
    try {
      const resp = await fetchEnterpriseDbDetail(folder);
      if (resp?.success) {
        setSelectedEnterprise(resp);
      }
    } catch (e) {
      console.error("加载企业详情失败:", e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedEnterprise(null);
    setSelectedFolder(null);
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    loadList();
  }, [loadList]);

  if (selectedEnterprise) {
    return <EnterpriseDetailPanel data={selectedEnterprise} onBack={handleBack} />;
  }

  return (
    <div style={{ padding: "0 0 24px 0" }}>
      <div style={{
        display: "flex",
        gap: "12px",
        marginBottom: "24px",
        flexWrap: "wrap",
        alignItems: "center",
        padding: "16px",
        backgroundColor: "rgba(31, 41, 55, 0.5)",
        borderRadius: "12px",
        border: "1px solid #374151"
      }}>
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <input
            type="text"
            placeholder="搜索企业名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{
              width: "100%",
              padding: "10px 16px 10px 40px",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#e5e7eb",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s"
            }}
          />
          <span style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            opacity: 0.6,
            color: "#94a3b8"
          }}>
            <IndustrialIcon name="search" />
          </span>
        </div>
        <select
          value={industryFilter}
          onChange={(e) => { setIndustryFilter(e.target.value); setPage(1); }}
          style={{
            padding: "10px 16px",
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#e5e7eb",
            fontSize: "14px",
            cursor: "pointer",
            minWidth: 140
          }}
        >
          <option value="">全部行业</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
          style={{
            padding: "10px 16px",
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#e5e7eb",
            fontSize: "14px",
            cursor: "pointer",
            minWidth: 120
          }}
        >
          <option value="">全部风险等级</option>
          <option value="D">重大风险</option>
          <option value="C">较大风险</option>
          <option value="B">一般风险</option>
          <option value="A">低风险</option>
        </select>
        <button
          onClick={handleSearch}
          style={{
            padding: "10px 24px",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            border: "none",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s"
          }}
        >
          搜索
        </button>
        <span style={{ color: "#9ca3af", fontSize: "13px" }}>
          共 {total} 家企业
        </span>
      </div>

      {detailLoading && (
        <div style={{
          textAlign: "center",
          padding: "40px",
          color: "#9ca3af",
          fontSize: "16px"
        }}>
          正在加载企业详情...
        </div>
      )}

      {loading && !detailLoading ? (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "300px",
          color: "#9ca3af",
          fontSize: "16px"
        }}>
          <div>
            <div className="loading-industrial-icon">
              <IndustrialIcon name="enterprise" />
            </div>
            正在加载企业数据...
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "20px",
            marginBottom: "24px"
          }}>
            {enterprises.map((ent, idx) => {
              const riskCfg = RISK_LEVEL_CONFIG[ent.risk_level] || RISK_LEVEL_CONFIG["A"];
              const scaleCfg = SCALE_CONFIG[ent.scale] || { icon: "enterprise", color: "#9ca3af" };
              return (
                <div
                  key={ent.folder}
                  onClick={() => handleCardClick(ent.folder)}
                  style={{
                    backgroundColor: "rgba(31, 41, 55, 0.6)",
                    borderRadius: "16px",
                    border: `1px solid ${riskCfg.color}30`,
                    padding: "20px",
                    cursor: "pointer",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    position: "relative",
                    overflow: "hidden",
                    animation: `fadeInUp 0.4s ease ${idx * 0.03}s both`
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = riskCfg.glow;
                    (e.currentTarget as HTMLElement).style.borderColor = riskCfg.color;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLElement).style.borderColor = `${riskCfg.color}30`;
                  }}
                >
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: `linear-gradient(90deg, ${riskCfg.color}, transparent)`
                  }} />
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{
                        color: "#f1f5f9",
                        fontSize: "15px",
                        fontWeight: "bold",
                        margin: 0,
                        marginBottom: 6,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {ent.name}
                      </h4>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {ent.industry && (
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: "rgba(59,130,246,0.15)",
                            color: "#60a5fa",
                            fontSize: 11
                          }}>
                            {ent.industry}
                          </span>
                        )}
                        {ent.scale && (
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: `${scaleCfg.color}20`,
                            color: scaleCfg.color,
                            fontSize: 11
                          }}>
                            <IndustrialIcon name={scaleCfg.icon as any} /> {ent.scale}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      padding: "4px 12px",
                      borderRadius: "20px",
                      backgroundColor: riskCfg.bg,
                      border: `1px solid ${riskCfg.color}40`,
                      color: riskCfg.color,
                      fontSize: "12px",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                      boxShadow: riskCfg.glow
                    }}>
                      {riskCfg.label}
                    </div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginTop: 12
                  }}>
                    <div style={{
                      padding: "8px 10px",
                      backgroundColor: "rgba(15, 23, 42, 0.5)",
                      borderRadius: 8,
                      borderLeft: "3px solid #3b82f6"
                    }}>
                      <div style={{ color: "#6b7280", fontSize: 10 }}>数据类别</div>
                      <div style={{ color: "#3b82f6", fontSize: 16, fontWeight: "bold" }}>{ent.category_count}</div>
                    </div>
                    <div style={{
                      padding: "8px 10px",
                      backgroundColor: "rgba(15, 23, 42, 0.5)",
                      borderRadius: 8,
                      borderLeft: "3px solid #8b5cf6"
                    }}>
                      <div style={{ color: "#6b7280", fontSize: 10 }}>数据记录</div>
                      <div style={{ color: "#8b5cf6", fontSize: 16, fontWeight: "bold" }}>{ent.record_count}</div>
                    </div>
                  </div>

                  {ent.region && (
                    <div style={{
                      marginTop: 10,
                      color: "#6b7280",
                      fontSize: 11,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      <span className="title-with-icon">
                        <IndustrialIcon name="location" />
                        {ent.region}
                      </span>
                    </div>
                  )}

                  <div style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "flex-end"
                  }}>
                    <span style={{
                      color: "#3b82f6",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "transform 0.2s"
                    }}>
                      查看画像 →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              padding: "16px 0"
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "8px 16px",
                  backgroundColor: page === 1 ? "#1f2937" : "rgba(59,130,246,0.2)",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  color: page === 1 ? "#6b7280" : "#3b82f6",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                ← 上一页
              </button>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "8px 16px",
                  backgroundColor: page === totalPages ? "#1f2937" : "rgba(59,130,246,0.2)",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  color: page === totalPages ? "#6b7280" : "#3b82f6",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                下一页 →
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
