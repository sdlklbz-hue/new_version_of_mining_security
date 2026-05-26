import AMapLoader from "@amap/amap-jsapi-loader";

export type AMapNamespace = any;

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
      serviceHost?: string;
    };
  }
}

let amapPromise: Promise<AMapNamespace> | null = null;

export function loadAmap(): Promise<AMapNamespace> {
  const key = import.meta.env.VITE_AMAP_KEY;
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE;

  if (!key || !securityJsCode) {
    return Promise.reject(new Error("未配置 VITE_AMAP_KEY 或 VITE_AMAP_SECURITY_CODE"));
  }

  window._AMapSecurityConfig = {
    securityJsCode,
  };

  if (!amapPromise) {
    amapPromise = AMapLoader.load({
      key,
      version: "2.0",
      plugins: ["AMap.ControlBar", "AMap.ToolBar"],
    }) as Promise<AMapNamespace>;
  }

  return amapPromise;
}

/** 3D 地图 destroy 后 InfoWindow / 遮罩可能挂在 body，切回 2D 前需清理。 */
export function purgeAmapDomArtifacts(): void {
  const selectors = [
    ".amap-info-window",
    ".amap-info-sharp",
    ".amap-info-contentContainer",
    ".amap-info-outer",
    ".amap-layers",
    ".amap-maps",
  ];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node.closest(".enterprise-amap-map")) return;
      node.remove();
    });
  }
  document.querySelectorAll("div.amap-container").forEach((node) => {
    if (node.closest(".enterprise-amap-shell")) return;
    node.remove();
  });
}
