import { useEffect, useState } from "react";
import IndustrialIcon from "./IndustrialIcon";
import type { IndustrialIconName } from "./IndustrialIcon";

export interface NavChildItem {
  id: string;
  label: string;
  icon?: IndustrialIconName;
}

export interface NavItem {
  id: string;
  label: string;
  icon?: IndustrialIconName;
  children?: NavChildItem[];
}

interface Props {
  activeTab: string;
  activeChildByTab?: Record<string, string | undefined>;
  onTabChange: (id: string) => void;
  onChildChange: (parentId: string, childId: string) => void;
  navItems: NavItem[];
  pendingApprovals?: number | null;
}

const SIDEBAR_EXPANDED_STORAGE_KEY = "mining-security-sidebar-expanded";

function readStoredExpanded(): boolean {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export default function Sidebar({
  activeTab,
  activeChildByTab,
  onTabChange,
  onChildChange,
  navItems,
  pendingApprovals,
}: Props) {
  const approvalCount = pendingApprovals ?? 0;
  const [expanded, setExpanded] = useState(readStoredExpanded);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () =>
      new Set(
        navItems
          .filter((item) => item.id === activeTab && item.children?.length)
          .map((item) => item.id),
      ),
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(expanded));
  }, [expanded]);

  useEffect(() => {
    const activeItem = navItems.find((item) => item.id === activeTab);
    if (!activeItem?.children?.length) return;

    setOpenGroups((prev) => (prev.has(activeTab) ? prev : new Set([activeTab])));
  }, [activeTab, navItems]);

  function toggleGroup(id: string, selected: boolean) {
    setOpenGroups((prev) => {
      if (selected && prev.has(id)) {
        return new Set();
      }
      return new Set([id]);
    });
  }

  return (
    <aside
      className={`sidebar ${expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}
      aria-label="主导航"
    >
      <div className="sidebar-rail" role="navigation">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-title">风险预警智能体</div>
            <div className="sidebar-subtitle">INDUSTRIAL WARNING SYSTEM</div>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收拢侧边栏" : "展开侧边栏"}
            title={expanded ? "收拢侧边栏" : "展开侧边栏"}
          >
            <IndustrialIcon name={expanded ? "collapse" : "expand"} />
          </button>
        </div>

        {navItems.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const selected = item.id === activeTab;
          const groupOpen = openGroups.has(item.id);
          const activeChildId = activeChildByTab?.[item.id];
          const showBadge = item.id === "risk" && approvalCount > 0;

          return (
            <div
              key={item.id}
              className={`rail-group ${selected ? "active" : ""} ${groupOpen ? "open" : ""}`}
            >
              <button
                id={`nav-${item.id}`}
                type="button"
                className={`rail-button ${selected ? "active" : ""} ${hasChildren ? "has-children" : ""}`}
                onClick={() => {
                  onTabChange(item.id);
                  if (hasChildren && expanded) toggleGroup(item.id, selected);
                }}
                aria-current={selected ? "page" : undefined}
                aria-expanded={hasChildren && expanded ? groupOpen : undefined}
                aria-controls={hasChildren ? `nav-group-${item.id}` : undefined}
                aria-label={item.label}
                title={item.label}
              >
                <span className="rail-icon">
                  <IndustrialIcon name={item.icon ?? "details"} />
                </span>
                <span className="rail-label">{item.label}</span>
                {showBadge && (
                  <span className="rail-badge font-mono">{approvalCount}</span>
                )}
                {hasChildren && expanded && (
                  <span className="rail-chevron" aria-hidden="true">
                    <IndustrialIcon name={groupOpen ? "collapse" : "expand"} />
                  </span>
                )}
              </button>

              {hasChildren && expanded && groupOpen && (
                <div
                  id={`nav-group-${item.id}`}
                  className="sidebar-subnav"
                  role="group"
                  aria-label={`${item.label}子目录`}
                >
                  {item.children?.map((child) => {
                    const childSelected = selected && child.id === activeChildId;

                    return (
                      <button
                        key={child.id}
                        id={`nav-${item.id}-${child.id}`}
                        type="button"
                        className={`subnav-button ${childSelected ? "active" : ""}`}
                        onClick={() => {
                          setOpenGroups(new Set([item.id]));
                          onChildChange(item.id, child.id);
                        }}
                        aria-current={childSelected ? "page" : undefined}
                        title={child.label}
                      >
                        <span className="subnav-icon" aria-hidden="true">
                          <IndustrialIcon name={child.icon ?? "details"} />
                        </span>
                        <span className="subnav-label">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="rail-spacer" />
      </div>
    </aside>
  );
}
