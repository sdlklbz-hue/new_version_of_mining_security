import type { ReactNode } from "react";

export type IndustrialIconName =
  | "risk"
  | "chart"
  | "map"
  | "enterprise"
  | "knowledge"
  | "iteration"
  | "config"
  | "upload"
  | "run"
  | "refresh"
  | "file"
  | "stream"
  | "guard"
  | "log"
  | "json"
  | "government"
  | "factory"
  | "check"
  | "block"
  | "warning"
  | "list"
  | "history"
  | "memory"
  | "database"
  | "export"
  | "import"
  | "search"
  | "approve"
  | "reject"
  | "table"
  | "trend"
  | "heat"
  | "radar"
  | "gear"
  | "clock"
  | "location"
  | "tag"
  | "shield"
  | "details"
  | "collapse"
  | "expand";

interface Props {
  name: IndustrialIconName;
  className?: string;
  title?: string;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function hatch(): ReactNode {
  return (
    <>
      <path d="M7 8.5 15.5 17" {...STROKE} />
      <path d="M7 12 12 17" {...STROKE} />
      <path d="M10.5 7 17 13.5" {...STROKE} />
    </>
  );
}

function glyph(name: IndustrialIconName): ReactNode {
  switch (name) {
    case "risk":
      return (
        <>
          <circle cx="12" cy="12" r="8" {...STROKE} />
          <circle cx="12" cy="12" r="4.2" {...STROKE} />
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" {...STROKE} />
        </>
      );
    case "chart":
      return (
        <>
          <path d="M5 18.5h14" {...STROKE} />
          <path d="M7 16V9M12 16V5.5M17 16v-4.5" {...STROKE} />
          <path d="M6 7.5h12" {...STROKE} opacity={0.45} />
        </>
      );
    case "map":
      return (
        <>
          <path d="M6 5.5 10 4l4 1.6 4-1.4v14.2l-4 1.4-4-1.6-4 1.5V5.5Z" {...STROKE} />
          <path d="M10 4v14.2M14 5.6v14.2" {...STROKE} opacity={0.6} />
        </>
      );
    case "enterprise":
      return (
        <>
          <path d="M5.5 19V7l5-2.2V19M10.5 8.5h8V19" {...STROKE} />
          <path d="M8 9.5h.1M8 13h.1M13.5 11h.1M16 11h.1M13.5 14.5h.1M16 14.5h.1" {...STROKE} />
        </>
      );
    case "knowledge":
      return (
        <>
          <rect x="5.5" y="5.5" width="13" height="13" rx="1.8" {...STROKE} />
          {hatch()}
        </>
      );
    case "iteration":
      return (
        <>
          <path d="M6.5 9.2a6.5 6.5 0 0 1 10.7-2.5L19 8.5" {...STROKE} />
          <path d="M19 4.8v3.7h-3.7M17.5 14.8a6.5 6.5 0 0 1-10.7 2.5L5 15.5" {...STROKE} />
          <path d="M5 19.2v-3.7h3.7" {...STROKE} />
        </>
      );
    case "config":
    case "gear":
      return (
        <>
          <circle cx="12" cy="12" r="3.2" {...STROKE} />
          <path d="M12 3.8v2M12 18.2v2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M3.8 12h2M18.2 12h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" {...STROKE} />
        </>
      );
    case "upload":
      return (
        <>
          <path d="M12 16V5.5M8.5 9 12 5.5 15.5 9" {...STROKE} />
          <path d="M5.5 15.5v3h13v-3" {...STROKE} />
        </>
      );
    case "run":
      return (
        <>
          <path d="M7.5 5.5v13l10-6.5-10-6.5Z" {...STROKE} />
          <path d="M5 5.5v13" {...STROKE} opacity={0.45} />
        </>
      );
    case "refresh":
      return glyph("iteration");
    case "file":
      return (
        <>
          <path d="M7 4.5h7l3 3V19H7V4.5Z" {...STROKE} />
          <path d="M14 4.5v3h3M9.5 11h5M9.5 14h5" {...STROKE} opacity={0.65} />
        </>
      );
    case "stream":
      return (
        <>
          <path d="M5 7h14M5 12h14M5 17h14" {...STROKE} />
          <path d="M8 5v14M16 5v14" {...STROKE} opacity={0.45} />
        </>
      );
    case "guard":
    case "shield":
      return (
        <>
          <path d="M12 4.2 18 6.5v5.2c0 3.7-2.4 6.3-6 8.1-3.6-1.8-6-4.4-6-8.1V6.5l6-2.3Z" {...STROKE} />
          <path d="M9.2 12.2 11.1 14l3.8-4.4" {...STROKE} />
        </>
      );
    case "log":
      return (
        <>
          <path d="M6 5.5h12v13H6v-13Z" {...STROKE} />
          <path d="M9 9h6M9 12h6M9 15h4" {...STROKE} opacity={0.65} />
        </>
      );
    case "json":
      return (
        <>
          <path d="M9 7 5.5 12 9 17M15 7l3.5 5-3.5 5" {...STROKE} />
          <path d="m13 6-2 12" {...STROKE} opacity={0.55} />
        </>
      );
    case "government":
      return (
        <>
          <path d="M4.8 9.5h14.4L12 5 4.8 9.5ZM6.5 18.5h11M7.5 10.5v6M12 10.5v6M16.5 10.5v6" {...STROKE} />
        </>
      );
    case "factory":
      return (
        <>
          <path d="M5 18.5V9.2l4.2 2.6V9.2l4.2 2.6V6h4v12.5H5Z" {...STROKE} />
          <path d="M8 15h1.5M12 15h1.5M16 15h1.5" {...STROKE} opacity={0.65} />
        </>
      );
    case "check":
    case "approve":
      return (
        <>
          <circle cx="12" cy="12" r="8" {...STROKE} />
          <path d="m8.5 12.2 2.2 2.2 4.8-5" {...STROKE} />
        </>
      );
    case "block":
    case "reject":
      return (
        <>
          <circle cx="12" cy="12" r="8" {...STROKE} />
          <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" {...STROKE} />
        </>
      );
    case "warning":
      return (
        <>
          <path d="M12 4.6 20 18H4L12 4.6Z" {...STROKE} />
          <path d="M12 9.5v4M12 16.3h.1" {...STROKE} />
        </>
      );
    case "list":
    case "details":
      return (
        <>
          <path d="M8 7h11M8 12h11M8 17h11" {...STROKE} />
          <path d="M5 7h.1M5 12h.1M5 17h.1" {...STROKE} />
        </>
      );
    case "history":
      return (
        <>
          <path d="M6.2 8A7 7 0 1 1 5 12" {...STROKE} />
          <path d="M6.2 4.8V8H9.4M12 8.2v4l3 1.8" {...STROKE} />
        </>
      );
    case "memory":
      return (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" {...STROKE} />
          <path d="M9 9h6v6H9V9ZM4 9h2M4 12h2M4 15h2M18 9h2M18 12h2M18 15h2" {...STROKE} opacity={0.65} />
        </>
      );
    case "database":
      return (
        <>
          <ellipse cx="12" cy="6.5" rx="6" ry="2.4" {...STROKE} />
          <path d="M6 6.5v8.8c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V6.5M6 11c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" {...STROKE} />
        </>
      );
    case "export":
      return (
        <>
          <path d="M12 8v10M8.5 14.5 12 18l3.5-3.5" {...STROKE} />
          <path d="M5.5 5.5h13v3" {...STROKE} />
        </>
      );
    case "import":
      return (
        <>
          <path d="M12 16V6M8.5 9.5 12 6l3.5 3.5" {...STROKE} />
          <path d="M5.5 18.5h13v-3" {...STROKE} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="10.5" cy="10.5" r="5.3" {...STROKE} />
          <path d="m14.5 14.5 4 4" {...STROKE} />
        </>
      );
    case "table":
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="1.5" {...STROKE} />
          <path d="M5 10h14M5 14h14M10 6v12M15 6v12" {...STROKE} opacity={0.55} />
        </>
      );
    case "trend":
      return (
        <>
          <path d="M5 17h14M6.5 15l3.4-4 3 2.2 4.6-6" {...STROKE} />
          <path d="M15.5 7h2.5v2.5" {...STROKE} />
        </>
      );
    case "heat":
      return (
        <>
          <rect x="5" y="5" width="14" height="14" rx="1.5" {...STROKE} />
          <path d="M9 5v14M15 5v14M5 9h14M5 15h14" {...STROKE} opacity={0.55} />
        </>
      );
    case "radar":
      return (
        <>
          <path d="M12 4 19 9v7l-7 4-7-4V9l7-5Z" {...STROKE} />
          <path d="M12 8 16 11v4l-4 2.2L8 15v-4l4-3Z" {...STROKE} opacity={0.6} />
          <path d="M12 4v16M5 9l14 7M19 9 5 16" {...STROKE} opacity={0.35} />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8" {...STROKE} />
          <path d="M12 7.5v5l3.2 2" {...STROKE} />
        </>
      );
    case "location":
      return (
        <>
          <path d="M12 20s6-5.1 6-10a6 6 0 0 0-12 0c0 4.9 6 10 6 10Z" {...STROKE} />
          <circle cx="12" cy="10" r="2.2" {...STROKE} />
        </>
      );
    case "tag":
      return (
        <>
          <path d="M5.5 12.5 12.5 5.5H18v5.5l-7 7-5.5-5.5Z" {...STROKE} />
          <path d="M15.5 8.2h.1" {...STROKE} />
        </>
      );
    case "collapse":
      return <path d="M7 14.5 12 9.5l5 5" {...STROKE} />;
    case "expand":
      return <path d="M7 9.5 12 14.5l5-5" {...STROKE} />;
    default:
      return hatch();
  }
}

export default function IndustrialIcon({ name, className, title }: Props) {
  return (
    <span className={`industrial-icon ${className ?? ""}`} title={title} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 24 24" role={title ? "img" : undefined} aria-label={title}>
        {glyph(name)}
      </svg>
    </span>
  );
}
