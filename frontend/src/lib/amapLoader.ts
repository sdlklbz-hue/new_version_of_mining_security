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
