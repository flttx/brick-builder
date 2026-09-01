import type { ReactElement } from "react";
import type { FaultName, FaultState } from "./fault-injection.js";
import type { DebugFlags } from "./debug-visuals.js";
import { messages } from "../../i18n/index.js";

export type DevToolsTab = "scene" | "performance" | "engine" | "snap" | "collision" | "assets" | "persistence" | "network" | "faults";

export interface DevToolsMetrics {
  frame: { fps: number; frameMs: number; drawCalls: number; instanceCount: number; triangles: number };
  interaction: { snapTime: number; collisionTime: number };
  brickCount: number;
  connectionCount: number;
  selected?: string | undefined;
  candidatePairs?: number | undefined;
  matchedPairs?: number | undefined;
}

export interface DevToolsShellProps {
  open: boolean;
  tab: DevToolsTab;
  onTabChange: (tab: DevToolsTab) => void;
  onClose: () => void;
  onValidate: () => void;
  onExportDiagnostics: () => void;
  consistency: string;
  performance: string;
  faults: FaultState;
  onToggleFault: (name: FaultName) => void;
  enabled: boolean;
  metrics: DevToolsMetrics;
  debugFlags: DebugFlags;
  onToggleDebug: (key: keyof DebugFlags) => void;
}

const tabs: Array<{ id: DevToolsTab; label: string }> = [
  { id: "scene", label: messages.devtools.tabs.scene },
  { id: "performance", label: messages.devtools.tabs.performance },
  { id: "engine", label: messages.devtools.tabs.engine },
  { id: "snap", label: messages.devtools.tabs.snap },
  { id: "collision", label: messages.devtools.tabs.collision },
  { id: "assets", label: messages.devtools.tabs.assets },
  { id: "persistence", label: messages.devtools.tabs.persistence },
  { id: "network", label: messages.devtools.tabs.network },
  { id: "faults", label: messages.devtools.tabs.faults }
];
const faultLabels: Record<FaultName, string> = messages.devtools.faults;

export const DevToolsShell = (props: DevToolsShellProps): ReactElement | null => {
  if (!props.open) return null;
  return (
    <aside className="devtools-shell" aria-label={messages.devtools.label}>
      <div className="devtools-header"><div><span className="devtools-kicker">{messages.devtools.label}</span><h2>{messages.devtools.heading}</h2></div><button className="drawer-close" type="button" onClick={props.onClose} aria-label={messages.common.close}>×</button></div>
      <div className="devtools-tabs" role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={props.tab === tab.id} onClick={() => props.onTabChange(tab.id)}>{tab.label}</button>)}</div>
      {props.tab === "scene" && <div className="devtools-panel" role="tabpanel"><p>{props.consistency}</p><Readout label={messages.editor.debug.bricks} value={String(props.metrics.brickCount)} /><Readout label={messages.editor.debug.connections} value={String(props.metrics.connectionCount)} /><Readout label={messages.editor.debug.selected} value={props.metrics.selected ?? "—"} /><button type="button" onClick={props.onValidate}>{messages.devtools.validate}</button><button type="button" onClick={props.onExportDiagnostics}>{messages.devtools.exportDiagnostics}</button></div>}
      {props.tab === "performance" && <div className="devtools-panel" role="tabpanel"><p>{props.performance}</p><Readout label="FPS" value={formatNumber(props.metrics.frame.fps, 1)} /><Readout label="Draw calls" value={String(props.metrics.frame.drawCalls)} /><Readout label="Instances" value={String(props.metrics.frame.instanceCount)} /></div>}
      {props.tab === "engine" && <div className="devtools-panel" role="tabpanel"><Readout label={messages.editor.debug.bricks} value={String(props.metrics.brickCount)} /><Readout label={messages.editor.debug.connections} value={String(props.metrics.connectionCount)} /><Readout label={messages.editor.debug.selected} value={props.metrics.selected ?? "—"} /><div className="devtools-section-label">{messages.editor.debug.layers}</div><DebugToggle label={messages.editor.debug.showConnectors} active={props.debugFlags.connectors} onClick={() => props.onToggleDebug("connectors")} /><DebugToggle label={messages.editor.debug.showColliders} active={props.debugFlags.colliders} onClick={() => props.onToggleDebug("colliders")} /><DebugToggle label={messages.editor.debug.showCandidate} active={props.debugFlags.candidate} onClick={() => props.onToggleDebug("candidate")} /><DebugToggle label={messages.editor.debug.showConnections} active={props.debugFlags.connections} onClick={() => props.onToggleDebug("connections")} /><DebugToggle label={messages.editor.debug.showDragPlane} active={props.debugFlags.dragPlane} onClick={() => props.onToggleDebug("dragPlane")} /></div>}
      {props.tab === "snap" && <div className="devtools-panel" role="tabpanel"><Readout label={messages.editor.debug.pairs} value={String(props.metrics.candidatePairs ?? 0)} /><Readout label="Snap ms" value={formatNumber(props.metrics.interaction.snapTime, 2)} /></div>}
      {props.tab === "collision" && <div className="devtools-panel" role="tabpanel"><Readout label="Collision ms" value={formatNumber(props.metrics.interaction.collisionTime, 2)} /><Readout label={messages.editor.debug.matchedPairs} value={String(props.metrics.matchedPairs ?? 0)} /></div>}
      {["assets", "persistence", "network"].includes(props.tab) && <div className="devtools-panel" role="tabpanel"><p>{messages.devtools.readOnlyTab}</p></div>}
      {props.tab === "faults" && <div className="devtools-panel" role="tabpanel">{props.enabled ? (Object.keys(faultLabels) as FaultName[]).map((name) => <label key={name}><input type="checkbox" checked={props.faults[name]} onChange={() => props.onToggleFault(name)} />{faultLabels[name]}</label>) : <p>{messages.devtools.unavailable}</p>}</div>}
    </aside>
  );
};

const Readout = ({ label, value }: { label: string; value: string }): ReactElement => <div className="readout-row"><span>{label}</span><strong>{value}</strong></div>;
const formatNumber = (value: number, digits: number): string => value === 0 ? "—" : value.toFixed(digits);
const DebugToggle = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement => <button className="debug-toggle" type="button" aria-pressed={active} onClick={onClick}><span className={`toggle-box${active ? " is-active" : ""}`} aria-hidden="true">{active ? "✓" : ""}</span><span>{label}</span></button>;
