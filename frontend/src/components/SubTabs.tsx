export interface SubTabDef {
  id: string;
  label: string;
}

interface Props {
  tabs: SubTabDef[];
  active: string;
  onChange: (id: string) => void;
  /** 供屏幕阅读器识别的 Tab 组名称 */
  ariaLabel: string;
}

/** 页面内二级导航，带基础无障碍属性 */
export default function SubTabs({ tabs, active, onChange, ariaLabel }: Props) {
  return (
    <div className="sub-tab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`subtab-${t.id}`}
            aria-selected={selected}
            aria-controls={`subtab-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`sub-tab ${selected ? "active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
