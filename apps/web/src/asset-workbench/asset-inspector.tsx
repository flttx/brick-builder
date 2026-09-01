import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { isRuntimePartManifest, type RuntimePartManifest, type RuntimePartsIndexItem } from "../../../../packages/brick-assets/asset-types.js";
import { addBoxCollider, addConnector, createAuthoringDocument, deleteCollider, deleteConnector, duplicateConnector, parseAuthoringDocument, rotateConnector, serializeAuthoringDocument, snapValue, updateBoxCollider, updateConnector, type AuthoringDocument, type ConnectorPreset } from "../../../../packages/brick-assets/authoring.js";
import { validateRuntimePartManifest } from "../../../../packages/brick-assets/asset-validation.js";
import { isRuntimePartIndex } from "../editor/parts/part-index.js";
import { localizeCategory, localizeColliderType, localizeConnectorType, localizePartName, messages } from "../i18n/index.js";

export interface AssetInspectorPageProps {
  authoring?: boolean;
}

export const AssetInspectorPage = ({ authoring = false }: AssetInspectorPageProps): ReactElement => {
  const [index, setIndex] = useState<RuntimePartsIndexItem[]>([]);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get("asset") ?? "brick-2x4");
  const [manifest, setManifest] = useState<RuntimePartManifest | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void fetch("/assets/asset-pack/parts-index.json").then(async (response) => {
      if (!response.ok) throw new Error("Asset index unavailable");
      const value = await response.json() as unknown;
      if (!isRuntimePartIndex(value)) throw new Error("Asset index is invalid");
      if (active) setIndex(value);
    }).catch(() => { if (active) setError(messages.assets.indexError); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const item = index.find((candidate) => candidate.id === selectedId) ?? index[0];
    if (item === undefined) return;
    if (item.id !== selectedId) setSelectedId(item.id);
    let active = true;
    void fetch(item.manifestUrl).then(async (response) => {
      if (!response.ok) throw new Error("Manifest unavailable");
      const value = await response.json() as unknown;
      if (!isRuntimePartManifest(value)) throw new Error("Manifest is invalid");
      if (active) { setManifest(value); setError(undefined); }
    }).catch(() => { if (active) setError(messages.assets.loadError); });
    return () => { active = false; };
  }, [index, selectedId]);

  if (loading) return <main className="asset-workbench-shell"><div className="asset-loading" role="status" aria-busy="true">{messages.assets.loadingPack}</div></main>;
  if (error !== undefined && manifest === undefined) return <main className="asset-workbench-shell"><p className="inline-error" role="alert">{error}</p></main>;
  return <main className="asset-workbench-shell">
    <header className="asset-workbench-header"><div><p className="eyebrow">{authoring ? messages.assets.authoringEyebrow : messages.assets.inspectorEyebrow}</p><h1>{authoring ? messages.assets.authoring : messages.assets.inspector}</h1><p>{authoring ? messages.assets.authoringDescription : messages.assets.inspectorDescription}</p></div><nav className="asset-workbench-nav"><a href="/">{messages.assets.editor}</a><a href={authoring ? "/assets" : "/authoring"}>{authoring ? messages.assets.openInspector : messages.assets.openAuthoring}</a></nav></header>
    {error !== undefined && <p className="inline-error asset-error" role="alert">{error}</p>}
    <div className="asset-workbench-layout">
      <aside className="asset-part-list" aria-label={messages.assets.runtimeParts}><div className="asset-list-heading"><span className="section-label">{messages.assets.runtimeParts}</span><strong>{messages.assets.packCount(index.length)}</strong></div>{index.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? "is-active" : ""} onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selectedId}><img src={item.thumbnail} alt="" /><span><strong>{localizePartName(item.id, item.name)}</strong><small>{localizeCategory(item.category)} · {item.dimensions.width}×{item.dimensions.depth}</small></span></button>)}</aside>
      {manifest === undefined ? <div className="asset-loading" role="status">{messages.assets.loadingManifest}</div> : authoring ? <AuthoringPanel manifest={manifest} /> : <InspectorPanel manifest={manifest} />}
    </div>
  </main>;
};

const InspectorPanel = ({ manifest }: { manifest: RuntimePartManifest }): ReactElement => <section className="asset-detail-shell" aria-labelledby="asset-detail-title">
  <div className="asset-preview-card"><Canvas camera={{ position: [4, 3.4, 6], fov: 38, near: 0.1, far: 100 }} dpr={[1, 1.5]}><AssetPreviewScene manifest={manifest} /></Canvas><div className="asset-preview-caption"><span>{messages.assets.preview}</span><span>{manifest.assetHash}</span></div></div>
  <div className="asset-detail-content"><div className="asset-detail-title"><div><span className="section-label">{messages.assets.partId}</span><h2 id="asset-detail-title">{manifest.id}</h2><p>{localizePartName(manifest.id, manifest.name)} · {localizeCategory(manifest.category)}</p></div><span className="asset-valid-badge">{messages.assets.validated}</span></div><div className="asset-info-grid"><Info label={messages.assets.dimensions} value={`${manifest.dimensions.width} × ${manifest.dimensions.height} × ${manifest.dimensions.depth} BU`} /><Info label={messages.assets.origin} value={manifest.origin.map((value) => value.toFixed(2)).join(", ")} /><Info label={messages.assets.lod} value={`${manifest.geometryStats.lod0Vertices} / ${manifest.geometryStats.lod1Vertices} ${messages.assets.vertices}`} /><Info label={messages.assets.connectors} value={messages.assets.connectorDefinitions(manifest.connectors.length)} /><Info label={messages.assets.colliders} value={messages.assets.boxColliders(manifest.colliders.length)} /><Info label={messages.assets.source} value={`${manifest.source.sourceType} · ${manifest.source.sourcePartId}`} /></div><MetadataTable manifest={manifest} /><ValidationSummary manifest={manifest} /></div>
</section>;

const AuthoringPanel = ({ manifest }: { manifest: RuntimePartManifest }): ReactElement => {
  const storageKey = `brick-builder-authoring:${manifest.id}`;
  const [document, setDocument] = useState<AuthoringDocument>(() => createAuthoringDocument(manifest));
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>();
  const [selectedColliderId, setSelectedColliderId] = useState<string | undefined>();
  const [grid, setGrid] = useState(0.1);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const value = window.localStorage.getItem(storageKey);
    const parsed = readStoredAuthoringDocument(value);
    setDocument(parsed?.partId === manifest.id ? parsed : createAuthoringDocument(manifest));
    setSelectedConnectorId(undefined); setSelectedColliderId(undefined); setSaved(false);
  }, [manifest, storageKey]);
  const effectiveManifest = useMemo(() => ({ ...manifest, connectors: document.connectors, colliders: document.colliders }), [document, manifest]);
  const validation = validateRuntimePartManifest(effectiveManifest);
  const selectedConnector = document.connectors.find((connector) => connector.id === selectedConnectorId);
  const selectedCollider = document.colliders.find((collider) => collider.id === selectedColliderId);
  const save = (): void => { window.localStorage.setItem(storageKey, serializeAuthoringDocument(document)); setSaved(true); };
  const download = (): void => { const url = URL.createObjectURL(new Blob([serializeAuthoringDocument(document)], { type: "application/json" })); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${manifest.id}.metadata.json`; anchor.click(); URL.revokeObjectURL(url); };
  const addPreset = (preset: ConnectorPreset): void => { const next = addConnector(document, preset); setDocument(next); setSelectedConnectorId(next.connectors[next.connectors.length - 1]?.id); setSaved(false); };
  return <section className="asset-detail-shell authoring-detail" aria-labelledby="asset-detail-title"><div className="asset-preview-card"><Canvas camera={{ position: [4, 3.4, 6], fov: 38, near: 0.1, far: 100 }} dpr={[1, 1.5]}><AssetPreviewScene manifest={effectiveManifest} showMetadata /></Canvas><div className="asset-preview-caption"><span>{messages.assets.gameplayPreview}</span><span>{validation.length === 0 ? messages.assets.validationPass : messages.assets.issueCount(validation.length)}</span></div></div><div className="authoring-workspace"><div className="asset-detail-title"><div><span className="section-label">{messages.authoring.manualOverlay}</span><h2 id="asset-detail-title">{manifest.id}</h2><p>{messages.authoring.generatedBase} · {manifest.metadataHash}</p></div><div className="authoring-actions"><button className="primary-action" type="button" onClick={save}>{messages.authoring.saveMetadata}</button><button type="button" onClick={download}>{messages.authoring.downloadJson}</button></div></div><div className="authoring-toolbar"><label>{messages.authoring.grid}<select value={grid} onChange={(event) => setGrid(Number(event.target.value))}><option value="0.1">0.1 BU</option><option value="0.5">0.5 BU</option></select></label><span className={validation.length === 0 ? "validation-ok" : "validation-fail"}>{validation.length === 0 ? messages.authoring.ready : messages.assets.issueCount(validation.length)}</span>{saved && <span className="save-confirmation" role="status">{messages.authoring.savedLocally}</span>}</div><div className="authoring-columns"><AuthoringList title={messages.authoring.connectorList} items={document.connectors.map((connector) => ({ id: connector.id, label: `${localizeConnectorType(connector.type)} · ${connector.position.x.toFixed(1)}, ${connector.position.y.toFixed(1)}, ${connector.position.z.toFixed(1)}` }))} selectedId={selectedConnectorId} onSelect={(id) => setSelectedConnectorId(id)} /><div className="authoring-controls"><div className="authoring-control-row"><button type="button" onClick={() => addPreset("stud")}>{messages.authoring.addStud}</button><button type="button" onClick={() => addPreset("anti_stud")}>{messages.authoring.addAntiStud}</button><button type="button" onClick={() => { if (selectedConnectorId !== undefined) { const next = duplicateConnector(document, selectedConnectorId); setDocument(next); setSaved(false); } }} disabled={selectedConnectorId === undefined}>{messages.common.duplicate}</button><button type="button" onClick={() => { if (selectedConnectorId !== undefined) { setDocument(deleteConnector(document, selectedConnectorId)); setSelectedConnectorId(undefined); setSaved(false); } }} disabled={selectedConnectorId === undefined}>{messages.authoring.deleteConnector}</button></div>{selectedConnector === undefined ? <p className="authoring-empty">{messages.authoring.selectConnector}</p> : <ConnectorEditor connector={selectedConnector} grid={grid} onChange={(update) => { setDocument(updateConnector(document, selectedConnector.id, update)); setSaved(false); }} onRotate={() => { setDocument(rotateConnector(document, selectedConnector.id, 1)); setSaved(false); }} />}</div></div><div className="authoring-columns"><AuthoringList title={messages.authoring.colliderList} items={document.colliders.map((collider) => ({ id: collider.id, label: `${localizeColliderType(collider.type)} · ${collider.size.x.toFixed(1)} × ${collider.size.y.toFixed(1)} × ${collider.size.z.toFixed(1)}` }))} selectedId={selectedColliderId} onSelect={(id) => setSelectedColliderId(id)} /><div className="authoring-controls"><div className="authoring-control-row"><button type="button" onClick={() => { const next = addBoxCollider(document); setDocument(next); setSelectedColliderId(next.colliders[next.colliders.length - 1]?.id); setSaved(false); }}>{messages.authoring.addBoxCollider}</button><button type="button" onClick={() => { if (selectedColliderId !== undefined) { setDocument(deleteCollider(document, selectedColliderId)); setSelectedColliderId(undefined); setSaved(false); } }} disabled={selectedColliderId === undefined}>{messages.authoring.deleteCollider}</button></div>{selectedCollider === undefined ? <p className="authoring-empty">{messages.authoring.selectCollider}</p> : <ColliderEditor collider={selectedCollider} grid={grid} onChange={(update) => { setDocument(updateBoxCollider(document, selectedCollider.id, update)); setSaved(false); }} />}</div></div><details className="metadata-diff"><summary>{messages.authoring.generatedVsManual}</summary><p>{messages.authoring.overlayDescription(manifest.metadataHash)}</p><pre>{JSON.stringify(document, null, 2)}</pre></details></div></section>;
};

const AssetPreviewScene = ({ manifest, showMetadata = false }: { manifest: RuntimePartManifest; showMetadata?: boolean }): ReactElement => {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const group = groupRef.current;
    if (group === null) return;
    let active = true;
    const loader = new GLTFLoader();
    void loader.loadAsync(manifest.geometry.lod0).then((gltf) => { if (active && groupRef.current !== null) groupRef.current.add(gltf.scene); }).catch(() => undefined);
    return () => { active = false; group.clear(); };
  }, [manifest.geometry.lod0]);
  return <><color attach="background" args={["#111619"]} /><ambientLight intensity={1.3} /><directionalLight position={[4, 7, 5]} intensity={2.2} /><gridHelper args={[8, 8, "#687271", "#3b4546"]} position={[0, -0.7, 0]} /><axesHelper args={[1.3]} /><group ref={groupRef} /><MetadataOverlay manifest={manifest} visible={showMetadata} /><OrbitControls makeDefault enableDamping /></>;
};

const MetadataOverlay = ({ manifest, visible }: { manifest: RuntimePartManifest; visible: boolean }): ReactElement | null => !visible ? null : <>{manifest.connectors.map((connector) => <mesh key={connector.id} position={[connector.position.x, connector.position.y, connector.position.z]}><sphereGeometry args={[0.08, 12, 8]} /><meshBasicMaterial color={connector.type === "stud" ? "#f6c453" : "#91d0c0"} /></mesh>)}{manifest.colliders.map((collider) => <mesh key={collider.id} position={[collider.center.x, collider.center.y, collider.center.z]}><boxGeometry args={[collider.size.x, collider.size.y, collider.size.z]} /><meshBasicMaterial color="#ff9a91" wireframe /></mesh>)}</>;

const MetadataTable = ({ manifest }: { manifest: RuntimePartManifest }): ReactElement => <div className="metadata-table"><div><span>{messages.assets.sourceFile}</span><code>{manifest.source.sourceFile}</code></div><div><span>{messages.assets.pipeline}</span><code>v{manifest.pipelineVersion} · asset {manifest.assetHash}</code></div><div><span>{messages.assets.geometryHash}</span><code>{manifest.geometryHash}</code></div><div><span>{messages.assets.metadataHash}</span><code>{manifest.metadataHash}</code></div><div><span>{messages.assets.lodPaths}</span><code>{manifest.geometry.lod0}<br />{manifest.geometry.lod1}</code></div><div><span>{messages.assets.thumbnail}</span><code>{manifest.thumbnail}</code></div></div>;
const ValidationSummary = ({ manifest }: { manifest: RuntimePartManifest }): ReactElement => { const issues = validateRuntimePartManifest(manifest); return <section className="validation-summary" aria-label={messages.assets.validation}><div><span className="section-label">{messages.assets.validation}</span><strong>{issues.length === 0 ? messages.assets.validationPass : messages.assets.validationFail}</strong></div>{issues.length > 0 && <ul>{issues.map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}</ul>}<p>{messages.assets.validationDescription}</p></section>; };
const Info = ({ label, value }: { label: string; value: string }): ReactElement => <div className="asset-info-item"><span>{label}</span><strong>{value}</strong></div>;
const AuthoringList = ({ title, items, selectedId, onSelect }: { title: string; items: Array<{ id: string; label: string }>; selectedId: string | undefined; onSelect: (id: string) => void }): ReactElement => <div className="authoring-list"><div className="authoring-list-heading"><span>{title}</span><strong>{items.length}</strong></div>{items.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? "is-active" : ""} onClick={() => onSelect(item.id)} aria-pressed={item.id === selectedId}><strong>{item.id}</strong><small>{item.label}</small></button>)}</div>;
const ConnectorEditor = ({ connector, grid, onChange, onRotate }: { connector: RuntimePartManifest["connectors"][number]; grid: number; onChange: (update: { position: { x: number; y: number; z: number } }) => void; onRotate: () => void }): ReactElement => <div className="authoring-form"><strong>{connector.id}</strong><div className="axis-fields">{(["x", "y", "z"] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<input type="number" step={grid} value={connector.position[axis]} onChange={(event) => onChange({ position: { ...connector.position, [axis]: snapValue(Number(event.target.value), grid) } })} /></label>)}</div><button type="button" onClick={onRotate}>{messages.authoring.rotate}</button></div>;
const ColliderEditor = ({ collider, grid, onChange }: { collider: RuntimePartManifest["colliders"][number]; grid: number; onChange: (update: { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } }) => void }): ReactElement => <div className="authoring-form"><strong>{collider.id}</strong><span>{messages.authoring.center}</span><div className="axis-fields">{(["x", "y", "z"] as const).map((axis) => <label key={`center-${axis}`}>{axis.toUpperCase()}<input type="number" step={grid} value={collider.center[axis]} onChange={(event) => onChange({ center: { ...collider.center, [axis]: snapValue(Number(event.target.value), grid) } })} /></label>)}</div><span>{messages.authoring.size}</span><div className="axis-fields">{(["x", "y", "z"] as const).map((axis) => <label key={`size-${axis}`}>{axis.toUpperCase()}<input type="number" min="0.1" step={grid} value={collider.size[axis]} onChange={(event) => onChange({ size: { ...collider.size, [axis]: snapValue(Number(event.target.value), grid) } })} /></label>)}</div></div>;
const readStoredAuthoringDocument = (value: string | null): AuthoringDocument | undefined => {
  if (value === null) return undefined;
  try {
    return parseAuthoringDocument(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
};
