import type { ReactElement } from "react";
import type { FaultName, FaultState } from "./fault-injection.js";
import { messages } from "../../i18n/index.js";

export type DevToolsTab = "scene" | "performance" | "faults";

export interface DevToolsShellProps {
  tab: DevToolsTab;
  onTabChange: (tab: DevToolsTab) => void;
  onValidate: () => void;
  onExportDiagnostics: () => void;
  consistency: string;
  performance: string;
  faults: FaultState;
  onToggleFault: (name: FaultName) => void;
  enabled: boolean;
}

const tabs: Array<{ id: DevToolsTab; label: string }> = [{ id: "scene", label: messages.devtools.tabs.scene }, { id: "performance", label: messages.devtools.tabs.performance }, { id: "faults", label: messages.devtools.tabs.faults }];
const faultLabels: Record<FaultName, string> = messages.devtools.faults;

export const DevToolsShell = (props: DevToolsShellProps): ReactElement => <section className="devtools-shell" aria-label={messages.devtools.label}><div className="devtools-tabs" role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={props.tab === tab.id} onClick={() => props.onTabChange(tab.id)}>{tab.label}</button>)}</div>{props.tab === "scene" && <div className="devtools-panel" role="tabpanel"><p>{props.consistency}</p><button type="button" onClick={props.onValidate}>{messages.devtools.validate}</button><button type="button" onClick={props.onExportDiagnostics}>{messages.devtools.exportDiagnostics}</button></div>}{props.tab === "performance" && <div className="devtools-panel" role="tabpanel"><p>{props.performance}</p></div>}{props.tab === "faults" && <div className="devtools-panel" role="tabpanel">{props.enabled ? (Object.keys(faultLabels) as FaultName[]).map((name) => <label key={name}><input type="checkbox" checked={props.faults[name]} onChange={() => props.onToggleFault(name)} />{faultLabels[name]}</label>) : <p>{messages.devtools.unavailable}</p>}</div>}</section>;
