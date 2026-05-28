import { useCallback, useEffect, useState } from "react";
import {
  fetchHealth,
  fetchMemoryStats,
  switchScenario,
} from "./api/client";
import type {
  HealthResponse,
  ScenarioId,
} from "./api/types";
import StatusBar from "./components/StatusBar";
import Sidebar from "./components/Sidebar";
import type { IndustrialIconName } from "./components/IndustrialIcon";
import type { NavItem } from "./components/Sidebar";
import { DecisionBatchProvider } from "./context/DecisionBatchContext";
import RiskPredictionPage from "./pages/RiskPredictionPage";
import KnowledgeMemoryPage, {
  KNOWLEDGE_SECTIONS,
  type KnowledgeSection,
} from "./pages/KnowledgeMemoryPage";
import IterationPage, {
  ITERATION_SECTIONS,
  type IterationSection,
} from "./pages/IterationPage";
import SystemConfigPage from "./pages/SystemConfigPage";
import VisualizationDashboard from "./pages/VisualizationPage";
import EnterpriseProfilePage from "./pages/EnterpriseProfilePage";
import EnterpriseMapPage from "./pages/EnterpriseMapPage";

const SCENARIO_NAMES: Record<ScenarioId, string> = {
  chemical: "危化品",
  metallurgy: "冶金",
  dust: "粉尘涉爆",
};

const KNOWLEDGE_SECTION_ICONS: Record<KnowledgeSection, IndustrialIconName> = {
  overview: "database",
  data: "table",
  risk: "radar",
  import: "import",
  experience: "warning",
  short: "memory",
  long: "database",
  approval: "approve",
  audit: "log",
};

const ITERATION_SECTION_ICONS: Record<IterationSection, IndustrialIconName> = {
  dashboard: "chart",
  tracking: "trend",
  lifecycle: "iteration",
  approval: "approve",
  compare: "details",
  changelog: "history",
};

const TAB_DEFS: NavItem[] = [
  { id: "risk", label: "企业风险预测", icon: "risk" },
  { id: "visualization", label: "数据可视化", icon: "chart" },
  { id: "map", label: "风险地图", icon: "map" },
  { id: "enterprise", label: "企业多维画像", icon: "enterprise" },
  {
    id: "knowledge",
    label: "预警经验与记忆",
    icon: "knowledge",
    children: KNOWLEDGE_SECTIONS.map((section) => ({
      ...section,
      icon: KNOWLEDGE_SECTION_ICONS[section.id],
    })),
  },
  {
    id: "iteration",
    label: "模型迭代 CI/CD",
    icon: "iteration",
    children: ITERATION_SECTIONS.map((section) => ({
      ...section,
      icon: ITERATION_SECTION_ICONS[section.id],
    })),
  },
  { id: "config", label: "系统配置 API", icon: "config" },
];

const TAB_IDS = TAB_DEFS.map((t) => t.id);

function tabFromHash(): string {
  const raw = window.location.hash.replace(/^#/, "").trim();
  return TAB_IDS.includes(raw) ? raw : "risk";
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("chemical");
  const [activeTab, setActiveTab] = useState<string>(() => tabFromHash());
  const [knowledgeSection, setKnowledgeSection] =
    useState<KnowledgeSection>("overview");
  const [iterationSection, setIterationSection] =
    useState<IterationSection>("dashboard");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set([tabFromHash()]),
  );

  const online = health?.status === "healthy";
  const activeTabDef = TAB_DEFS.find((tab) => tab.id === activeTab) ?? TAB_DEFS[0];

  const setTab = useCallback((id: string) => {
    setVisitedTabs((prev) => {
      if (prev.has(id)) return prev;
      return new Set([...prev, id]);
    });
    setActiveTab(id);
    if (window.location.hash !== `#${id}`) {
      window.location.hash = id;
    }
  }, []);

  const setNavChild = useCallback((parentId: string, childId: string) => {
    if (parentId === "knowledge") {
      setKnowledgeSection(childId as KnowledgeSection);
    }
    if (parentId === "iteration") {
      setIterationSection(childId as IterationSection);
    }
    setTab(parentId);
  }, [setTab]);

  useEffect(() => {
    const updateHealth = () => {
      fetchHealth().then(setHealth).catch(() => setHealth(null));
    };
    const updateMemoryStats = () => {
      fetchMemoryStats()
        .then((s) => setPendingApprovals(s?.pending_approvals ?? null))
        .catch(() => setPendingApprovals(null));
    };

    updateHealth();
    updateMemoryStats();
    const id = setInterval(() => {
      updateHealth();
      updateMemoryStats();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = activeTab;
    }
  }, []);

  async function changeScenario(s: ScenarioId) {
    setScenario(s);
    try {
      await switchScenario(s);
    } catch {
      // The UI can continue with local demo data when the backend is offline.
    }
  }

  function renderTabContent(tabId: string, active: boolean) {
    switch (tabId) {
      case "risk":
        return <RiskPredictionPage scenario={scenario} />;
      case "visualization":
        return <VisualizationDashboard />;
      case "map":
        return <EnterpriseMapPage scenario={scenario} active={active} />;
      case "enterprise":
        return <EnterpriseProfilePage />;
      case "knowledge":
        return (
          <KnowledgeMemoryPage
            activeSection={knowledgeSection}
            onSectionChange={setKnowledgeSection}
          />
        );
      case "iteration":
        return (
          <IterationPage
            activeSection={iterationSection}
            onSectionChange={setIterationSection}
          />
        );
      case "config":
        return <SystemConfigPage scenario={scenario} health={health} />;
      default:
        return null;
    }
  }

  return (
    <DecisionBatchProvider>
      <div className="app-shell">
        <StatusBar
          health={health}
          scenario={scenario}
          onScenarioChange={changeScenario}
          backendOnline={online}
          onOpenRiskTab={() => setTab("risk")}
        />
        <div className="app-body">
          <Sidebar
            activeTab={activeTab}
            activeChildByTab={{
              knowledge: knowledgeSection,
              iteration: iterationSection,
            }}
            onTabChange={setTab}
            onChildChange={setNavChild}
            navItems={TAB_DEFS}
            pendingApprovals={pendingApprovals}
          />
          <main className="main-content" id="main-content">
            <div className="workspace-header">
              <div>
                <div className="workspace-eyebrow">INDUSTRIAL WARNING SYSTEM</div>
                <h1 className="workspace-title">{activeTabDef.label}</h1>
              </div>
              <div className="workspace-scenario font-mono">
                SCENE / {SCENARIO_NAMES[scenario]}
              </div>
            </div>
            <section
              className="workspace-surface"
            >
              {TAB_DEFS.map((tab) => {
                const active = tab.id === activeTab;
                if (!active && !visitedTabs.has(tab.id)) return null;
                return (
                  <div
                    key={tab.id}
                    role="tabpanel"
                    id={`panel-${tab.id}`}
                    aria-labelledby={`nav-${tab.id}`}
                    aria-hidden={!active}
                    hidden={!active}
                  >
                    {renderTabContent(tab.id, active)}
                  </div>
                );
              })}
            </section>
          </main>
        </div>
      </div>
    </DecisionBatchProvider>
  );
}
