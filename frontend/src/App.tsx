import { useCallback, useEffect, useState } from "react";
import {
  fetchHealth,
  fetchIterationStatus,
  fetchMemoryStats,
  switchScenario,
} from "./api/client";
import type {
  HealthResponse,
  IterationStatus,
  ScenarioId,
} from "./api/types";
import StatusBar from "./components/StatusBar";
import Sidebar from "./components/Sidebar";
import Tabs from "./components/Tabs";
import { DecisionBatchProvider } from "./context/DecisionBatchContext";
import RiskPredictionPage from "./pages/RiskPredictionPage";
import KnowledgeMemoryPage from "./pages/KnowledgeMemoryPage";
import IterationPage from "./pages/IterationPage";
import SystemConfigPage from "./pages/SystemConfigPage";
import VisualizationDashboard from "./pages/VisualizationPage";

const TAB_DEFS = [
  { id: "risk", label: "企业风险预测" },
  { id: "visualization", label: "数据可视化" },
  { id: "knowledge", label: "预警经验与记忆" },
  { id: "iteration", label: "模型迭代与 CI/CD" },
  { id: "config", label: "系统配置与 API" },
];

const TAB_IDS = TAB_DEFS.map((t) => t.id);
const DEMO_ROTATE_MS = 12_000;

function tabFromHash(): string {
  const raw = window.location.hash.replace(/^#/, "").trim();
  return TAB_IDS.includes(raw) ? raw : "risk";
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [iteration, setIteration] = useState<IterationStatus | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("chemical");
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => tabFromHash());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const online = health?.status === "healthy";

  const setTab = useCallback((id: string) => {
    setActiveTab(id);
    if (window.location.hash !== `#${id}`) {
      window.location.hash = id;
    }
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    fetchHealth().then(setHealth);
    fetchIterationStatus().then(setIteration);
    fetchMemoryStats().then((s) => setPendingApprovals(s?.pending_approvals ?? null));
    const id = setInterval(() => {
      fetchHealth().then(setHealth);
      fetchMemoryStats().then((s) => setPendingApprovals(s?.pending_approvals ?? null));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = activeTab;
    }
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const timer = window.setInterval(() => {
      setActiveTab((prev) => {
        const idx = TAB_IDS.indexOf(prev);
        const next = TAB_IDS[(idx + 1) % TAB_IDS.length];
        window.location.hash = next;
        return next;
      });
    }, DEMO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [demoMode]);

  async function changeScenario(s: ScenarioId) {
    setScenario(s);
    await switchScenario(s);
  }

  return (
    <DecisionBatchProvider>
    <div className="app-shell">
      <StatusBar
        health={health}
        scenario={scenario}
        onScenarioChange={changeScenario}
        backendOnline={online}
        demoMode={demoMode}
        onMenuToggle={() => setSidebarOpen((o) => !o)}
        menuExpanded={sidebarOpen}
        onOpenRiskTab={() => setTab("risk")}
      />
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭侧边栏"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="app-body">
        <Sidebar
          health={health}
          iteration={iteration}
          pendingApprovals={pendingApprovals}
          demoMode={demoMode}
          onDemoToggle={setDemoMode}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="main-content" id="main-content">
          <Tabs tabs={TAB_DEFS} active={activeTab} onChange={setTab} />
          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {activeTab === "risk" && <RiskPredictionPage scenario={scenario} />}
            {activeTab === "visualization" && <VisualizationDashboard />}
            {activeTab === "knowledge" && <KnowledgeMemoryPage />}
            {activeTab === "iteration" && <IterationPage />}
            {activeTab === "config" && (
              <SystemConfigPage scenario={scenario} health={health} />
            )}
          </div>
        </main>
      </div>
    </div>
    </DecisionBatchProvider>
  );
}
