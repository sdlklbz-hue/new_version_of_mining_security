export const ENTERPRISE_PREDICTION_IMPORT_KEY = "mra_enterprise_prediction_import";

export interface EnterprisePredictionImport {
  enterpriseId: string;
  payload: Record<string, unknown>;
  name?: string;
  folder?: string;
  hint?: string;
}

export function saveEnterprisePredictionImport(data: EnterprisePredictionImport): void {
  sessionStorage.setItem(ENTERPRISE_PREDICTION_IMPORT_KEY, JSON.stringify(data));
}

export function consumeEnterprisePredictionImport(): EnterprisePredictionImport | null {
  const raw = sessionStorage.getItem(ENTERPRISE_PREDICTION_IMPORT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(ENTERPRISE_PREDICTION_IMPORT_KEY);
  try {
    return JSON.parse(raw) as EnterprisePredictionImport;
  } catch {
    return null;
  }
}
