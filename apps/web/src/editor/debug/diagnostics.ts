export interface DiagnosticsInput {
  appVersion: string;
  assetPackVersion: string;
  projectId: string;
  brickCount: number;
  connectionCount: number;
  history: { undo: number; redo: number; limit: number };
  render: { instances: number; batches: number; chunks: number; drawCalls: number };
  quality: { level: string; dpr: number };
  recovery: string;
  offline: boolean;
  consistency: { valid: boolean; issueCount: number };
}

export interface DiagnosticsReport extends DiagnosticsInput {
  generatedAt: string;
  schemaVersion: 1;
}

export const createDiagnosticsReport = (input: DiagnosticsInput, now = new Date()): DiagnosticsReport => ({ ...input, generatedAt: now.toISOString(), schemaVersion: 1 });
export const diagnosticsJson = (input: DiagnosticsInput, now = new Date()): string => JSON.stringify(createDiagnosticsReport(input, now), null, 2);

