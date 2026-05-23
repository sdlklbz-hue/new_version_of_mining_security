import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchIterationStatus,
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
import { SCENARIO_NAMES } from "./data/demoData";
import RiskPredictionPage from "./pages/RiskPredictionPage";
import KnowledgeMemoryPage from "./pages/KnowledgeMemoryPage";
import IterationPage from "./pages/IterationPage";
import SystemConfigPage from "./pages/SystemConfigPage";
import VisualizationDashboard from "./pages/VisualizationPage";

const TAB_DEFS = [
  { id: "risk", label: "企业风险预测", icon: "◎" },
  { id: "visualization", label: "数据可视化", icon: "▥" },
  { id: "knowledge", label: "知识与记忆系统", icon: "▧" },
  { id: "iteration", label: "模型迭代 CI/CD", icon: "↻" },
  { id: "config", label: "系统配置 API", icon: "⚙" },
];

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [iteration, setIteration] = useState<IterationStatus | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("chemical");
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("risk");

  useEffect(() => {
    fetchHealth().then(setHealth);
    fetchIterationStatus().then(setIteration);
    const id = setInterval(() => {
      fetchHealth().then(setHealth);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  async function changeScenario(s: ScenarioId) {
    setScenario(s);
    await switchScenario(s);
  }

  return (
    <div className="app-shell">
      <StatusBar health={health} scenarioName={SCENARIO_NAMES[scenario]} />
      <div className="app-body">
        <Sidebar
          health={health}
          scenario={scenario}
          onScenarioChange={changeScenario}
          iteration={iteration}
          demoMode={demoMode}
          onDemoToggle={setDemoMode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          navItems={TAB_DEFS}
        />
        <main className="main-content">
          <div className="workspace-header">
            <div>
              <div className="workspace-eyebrow">INDUSTRIAL WARNING SYSTEM</div>
              <h1 className="workspace-title">
                {TAB_DEFS.find((tab) => tab.id === activeTab)?.label}
              </h1>
            </div>
            <div className="workspace-scenario font-mono">
              SCENE / {SCENARIO_NAMES[scenario]}
            </div>
          </div>
          <Tabs tabs={TAB_DEFS} active={activeTab} onChange={setActiveTab} />
          <section className="workspace-surface">
            {activeTab === "risk" && <RiskPredictionPage scenario={scenario} />}
            {activeTab === "visualization" && <VisualizationDashboard />}
            {activeTab === "knowledge" && <KnowledgeMemoryPage />}
            {activeTab === "iteration" && <IterationPage />}
            {activeTab === "config" && (
              <SystemConfigPage scenario={scenario} health={health} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
