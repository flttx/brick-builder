import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type { BrickProjectSnapshot } from "../../../src/serialization/project-snapshot.js";
import { ApiRequestError, IndexedDbCachedProjectStore, IndexedDbLocalDraftStore, IndexedDbLocalProjectIndexStore, RecoveryManager, HttpProjectRepository, localProjectIndexFromMetadata, type CachedProjectStore, type LocalDraftStore, type LocalProjectIndexEntry, type LocalProjectIndexStore, type LocalProjectDraft, type ProjectDetail, type ProjectMetadata, type ProjectRepository } from "../../../packages/project-persistence/index.js";
import { clearUserOfflineState } from "../../../packages/project-persistence/offline-cleanup.js";
import { prepareProjectOfflineAssets } from "./offline/runtime-asset-cache.js";
import { formatDateTimeZhCN, localizeProjectName, messages } from "./i18n/index.js";

const EditorApp = lazy(() => import("./editor/editor-app.js").then((module) => ({ default: module.EditorApp })));
const AssetInspectorPage = lazy(() => import("./asset-workbench/asset-inspector.js").then((module) => ({ default: module.AssetInspectorPage })));

type View = "checking" | "auth" | "builds" | "editor" | "local" | "assets" | "authoring" | "benchmark";

interface Session { userId: string; email: string; }
interface EditorProject extends ProjectDetail { recoveryNotice?: string; recoveredDraft?: boolean; }
interface ConflictState { cloud: ProjectDetail; localSnapshot: BrickProjectSnapshot; draft: LocalProjectDraft | null; }
interface ReauthState { email: string; }

const LOCAL_STATE_TIMEOUT_MS = 1500;

const withTimeout = <T,>(task: Promise<T>, fallback: T): Promise<T> => new Promise<T>((resolve) => {
  const timer = { id: 0 };
  const finish = (value: T): void => { window.clearTimeout(timer.id); resolve(value); };
  timer.id = window.setTimeout(() => finish(fallback), LOCAL_STATE_TIMEOUT_MS);
  void task.then(finish, () => finish(fallback));
});

const syncLocalProjectIndex = async (projects: ProjectMetadata[], userId: string, indexStore: LocalProjectIndexStore): Promise<LocalProjectIndexEntry[]> => {
  await Promise.all(projects.map(async (project) => {
    try {
      await indexStore.upsert(localProjectIndexFromMetadata(project, userId, (await indexStore.get(userId, project.id)) ?? undefined));
    } catch {
      return;
    }
  }));
  return indexStore.list(userId);
};

export const AppRoot = (): ReactElement => {
  const repository = useMemo<ProjectRepository>(() => new HttpProjectRepository(), []);
  const draftStore = useMemo(() => new IndexedDbLocalDraftStore(), []);
  const cachedStore = useMemo(() => new IndexedDbCachedProjectStore(), []);
  const indexStore = useMemo(() => new IndexedDbLocalProjectIndexStore(), []);
  const recoveryManager = useMemo(() => new RecoveryManager(), []);
  const [view, setView] = useState<View>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [localIndex, setLocalIndex] = useState<LocalProjectIndexEntry[]>([]);
  const [editorProject, setEditorProject] = useState<EditorProject | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [appError, setAppError] = useState<string | undefined>();
  const [reauthenticate, setReauthenticate] = useState<ReauthState | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [apiOnline, setApiOnline] = useState(true);
  const loggingOutRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const routeProjectId = useMemo(() => readProjectId(), []);
  const returnToRef = useRef<string | null>(readReturnTo());

  useEffect(() => {
    document.documentElement.lang = "zh-CN";
      document.title = view === "builds" ? messages.pageTitles.builds : view === "editor" || view === "benchmark" ? messages.pageTitles.editor : view === "assets" ? messages.pageTitles.assets : view === "authoring" ? messages.pageTitles.authoring : messages.pageTitles.auth;
  }, [view]);

  const go = useCallback((nextView: View, path: string): void => { window.history.pushState({}, "", path); setView(nextView); }, []);
  const loadProjects = useCallback(async (userId = session?.userId): Promise<void> => {
    if (userId === undefined) return;
    try {
      const cloudProjects = await repository.listProjects();
      setProjects(cloudProjects);
      void withTimeout(syncLocalProjectIndex(cloudProjects, userId, indexStore), []).then(setLocalIndex);
    } catch {
      setApiOnline(false);
      const offlineEntries = await withTimeout(indexStore.list(userId), []);
      setProjects(offlineEntries.map(metadataFromLocalIndex));
      setLocalIndex(offlineEntries);
    }
  }, [indexStore, repository, session?.userId]);
  const openProject = useCallback(async (projectId: string, userId = session?.userId): Promise<void> => {
    setAppError(undefined);
    try {
      const cloud = await repository.getProject(projectId);
      const [draft, cached] = await Promise.all([withTimeout(draftStore.get(userId ?? "", projectId), null), withTimeout(cachedStore.get(userId ?? "", projectId), null)]);
      if (userId !== undefined) void withTimeout(cachedStore.put({ userId, projectId, serverRevision: cloud.serverRevision, snapshot: cloud.snapshot, cachedAt: Date.now() }), undefined);
      if (userId !== undefined) {
        void withTimeout((async () => {
          const currentIndex = await indexStore.get(userId, projectId);
          await indexStore.upsert({ ...localProjectIndexFromMetadata(cloud, userId, currentIndex ?? undefined), lastOpenedAt: Date.now(), offlineReady: false });
        })(), undefined);
        void prepareProjectOfflineAssets(cloud.snapshot).then((result) => indexStore.patch(userId, projectId, { offlineReady: result.missingUrls.length === 0 })).then(() => indexStore.list(userId).then(setLocalIndex)).catch(() => undefined);
      }
      const decision = recoveryManager.resolve(cloud, draft, cached);
      if ("cloud" in decision) {
        setConflict({ cloud: decision.cloud, localSnapshot: decision.local.snapshot, draft: decision.local });
        setEditorProject(cloud);
      } else {
        setConflict(null);
        setEditorProject({ ...cloud, snapshot: decision.snapshot, serverRevision: decision.baseServerRevision, ...(decision.message === undefined ? {} : { recoveryNotice: decision.message }), ...(decision.source === "draft" ? { recoveredDraft: true } : {}) });
      }
      setEditorVersion((value) => value + 1);
      go("editor", `/projects/${encodeURIComponent(projectId)}`);
    } catch {
      if (userId !== undefined) {
        try {
          const offlineProject = await recoverOfflineProject(userId, projectId, draftStore, cachedStore);
          if (offlineProject !== null) { setSession({ userId, email: messages.auth.offlineMode }); setEditorProject(offlineProject); setApiOnline(false); setEditorVersion((value) => value + 1); go("editor", `/projects/${encodeURIComponent(projectId)}`); return; }
        } catch { setAppError(messages.errors.LOCAL_STORAGE_UNAVAILABLE); }
      }
      setAppError(messages.errors.PROJECT_OPEN_FAILED); setView("builds");
    }
  }, [cachedStore, draftStore, go, indexStore, recoveryManager, repository, session?.userId]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let active = true;
    const toolView = readToolView();
    if (toolView !== null) { setView(toolView); return () => { active = false; }; }
    void repository.getSession().then(async (current) => {
      if (!active || loggingOutRef.current) return;
      setApiOnline(true);
      if (current === null) {
        const returnTo = routeProjectId === null ? returnToRef.current : `/projects/${encodeURIComponent(routeProjectId)}`;
        returnToRef.current = returnTo;
        window.history.replaceState({}, "", returnTo === null ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`);
        setView("auth"); return;
      }
      setSession(current);
      window.localStorage.setItem("brick-builder-active-user", current.userId);
      if (routeProjectId !== null) void openProject(routeProjectId, current.userId); else { void loadProjects(current.userId).then(() => { if (active) setView("builds"); }); }
    }).catch(async () => { if (!active) return; const offlineUserId = window.localStorage.getItem("brick-builder-active-user"); if (offlineUserId !== null) { try { const offlineEntries = await withTimeout(indexStore.list(offlineUserId), []); setLocalIndex(offlineEntries); if (routeProjectId !== null) { const offlineProject = await recoverOfflineProject(offlineUserId, routeProjectId, draftStore, cachedStore); if (offlineProject !== null) { setSession({ userId: offlineUserId, email: messages.auth.offlineMode }); setEditorProject(offlineProject); setApiOnline(false); setView("editor"); return; } } if (offlineEntries.length > 0) { setSession({ userId: offlineUserId, email: messages.auth.offlineMode }); setProjects(offlineEntries.map(metadataFromLocalIndex)); setApiOnline(false); setView("builds"); return; } } catch { setAppError(messages.errors.LOCAL_STORAGE_UNAVAILABLE); } } setApiOnline(false); setView("local"); });
    return () => { active = false; };
  }, [draftStore, cachedStore, indexStore, loadProjects, openProject, repository, routeProjectId]);

  const handleAuthenticated = useCallback(async (current: Session): Promise<void> => {
    loggingOutRef.current = false;
    window.localStorage.setItem("brick-builder-active-user", current.userId);
    setSession(current);
    setApiOnline(true);
    const returnTo = returnToRef.current;
    returnToRef.current = null;
    const returnProjectId = projectIdFromPath(returnTo);
    await loadProjects(current.userId);
    if (returnProjectId !== null) {
      await openProject(returnProjectId, current.userId);
      return;
    }
    go("builds", "/my-builds");
  }, [go, loadProjects, openProject]);
  const handleCreate = useCallback(async (): Promise<void> => { try { const project = await repository.createProject(); await openProject(project.id); } catch { setAppError(messages.errors.PROJECT_CREATE_FAILED); } }, [openProject, repository]);
  const handleLogout = useCallback(async (): Promise<void> => { const userId = session?.userId; loggingOutRef.current = true; window.localStorage.removeItem("brick-builder-active-user"); setSession(null); setEditorProject(null); setConflict(null); go("auth", "/login"); try { if (userId !== undefined) await clearUserOfflineState(userId, { draftStore, cachedStore, indexStore }); await repository.logout(); } catch { setAppError(messages.errors.LOGOUT_CLEANUP_FAILED); } }, [cachedStore, draftStore, go, indexStore, repository, session]);
  const handleEditorConflict = useCallback(async (localSnapshot: BrickProjectSnapshot): Promise<void> => { if (session === null || editorProject === null) return; try { const cloud = await repository.getProject(editorProject.id); const draft = await draftStore.get(session.userId, editorProject.id); setConflict({ cloud, localSnapshot, draft }); } catch { setAppError(messages.errors.CLOUD_READ_FAILED); } }, [draftStore, editorProject, repository, session]);
  const handleReauth = useCallback((current: Session): void => { if (session !== null && current.userId !== session.userId) { setAppError(messages.errors.WRONG_ACCOUNT); return; } window.localStorage.setItem("brick-builder-active-user", current.userId); setSession(current); setReauthenticate(null); setAuthEpoch((value) => value + 1); }, [session]);
  const handleLoadCloud = useCallback(async (): Promise<void> => { if (conflict === null || session === null) return; await draftStore.delete(session.userId, conflict.cloud.id); setConflict(null); setEditorProject(conflict.cloud); setEditorVersion((value) => value + 1); }, [conflict, draftStore, session]);
  const handleSaveCopy = useCallback(async (): Promise<void> => { if (conflict === null || session === null) return; try { const copy = await repository.createProject(messages.builds.copyName(localizeProjectName(conflict.cloud.name)), conflict.localSnapshot); await draftStore.delete(session.userId, conflict.cloud.id); setConflict(null); await openProject(copy.id); } catch { setAppError(messages.errors.COPY_SAVE_FAILED); } }, [conflict, draftStore, openProject, repository, session]);
  const handleDuplicate = useCallback(async (projectId: string): Promise<void> => {
    try {
      const source = await repository.getProject(projectId);
      await repository.createProject(messages.builds.copyName(localizeProjectName(source.name)), source.snapshot);
      await loadProjects(session?.userId);
    } catch {
      setAppError(messages.errors.COPY_SAVE_FAILED);
    }
  }, [loadProjects, repository, session?.userId]);
  const handleRename = useCallback(async (projectId: string, name: string): Promise<void> => { try { const updated = await repository.renameProject(projectId, name); setProjects((items) => items.map((item) => item.id === projectId ? updated : item)); const current = session?.userId === undefined ? null : await indexStore.get(session.userId, projectId); if (current !== null) await indexStore.upsert({ ...current, name: updated.name }); setLocalIndex(session?.userId === undefined ? [] : await indexStore.list(session.userId)); } catch { setAppError(messages.errors.RENAME_FAILED); } }, [indexStore, repository, session?.userId]);
  const handleDelete = useCallback(async (projectId: string): Promise<void> => { try { await repository.deleteProject(projectId); setProjects((items) => items.filter((item) => item.id !== projectId)); if (session?.userId !== undefined) { await Promise.all([draftStore.delete(session.userId, projectId), cachedStore.delete(session.userId, projectId), indexStore.delete(session.userId, projectId)]); setLocalIndex(await indexStore.list(session.userId)); } } catch { setAppError(messages.errors.DELETE_FAILED); } }, [cachedStore, draftStore, indexStore, repository, session?.userId]);
  const handleTogglePin = useCallback(async (projectId: string): Promise<void> => { if (session?.userId === undefined) return; const current = await indexStore.get(session.userId, projectId); if (current === null) return; const pinned = !current.isPinned; await indexStore.patch(session.userId, projectId, { isPinned: pinned }); if (pinned) { const cached = await cachedStore.get(session.userId, projectId); if (cached !== null) { void prepareProjectOfflineAssets(cached.snapshot).then((result) => indexStore.patch(session.userId, projectId, { offlineReady: result.missingUrls.length === 0 })).catch(() => undefined); } } setLocalIndex(await indexStore.list(session.userId)); }, [cachedStore, indexStore, session?.userId]);

  if (view === "checking") return <div className="app-loading" role="status" aria-busy="true">{messages.editor.loadingWorkbench}</div>;
  if (view === "assets") return <Suspense fallback={<div className="app-loading" role="status">{messages.common.loading}</div>}><AssetInspectorPage /></Suspense>;
  if (view === "authoring") return <Suspense fallback={<div className="app-loading" role="status">{messages.common.loading}</div>}><AssetInspectorPage authoring /></Suspense>;
  if (view === "benchmark") return <Suspense fallback={<div className="app-loading" role="status" aria-busy="true">{messages.common.loading}</div>}><EditorApp benchmark projectId="browser-benchmark" projectName="Browser Benchmark" /></Suspense>;
  if (view === "auth") return <AuthScreen repository={repository} onAuthenticated={handleAuthenticated} onLocal={() => setView("local")} apiOnline={apiOnline} />;
  if (view === "local") return <><div className="local-mode-banner" role="status">{messages.editor.localWorkspaceBanner}<button type="button" onClick={() => { setApiOnline(true); setView("auth"); }}>{messages.auth.login}</button></div><EditorApp projectName={messages.editor.localWorkspace} initialNotice={messages.editor.localWorkspaceNotice} /></>;
  if (view === "builds") return <MyBuilds projects={projects} localIndex={localIndex} {...(appError === undefined ? {} : { error: appError })} onCreate={() => void handleCreate()} onOpen={(id) => void openProject(id)} onRename={(id, name) => void handleRename(id, name)} onDuplicate={(id) => void handleDuplicate(id)} onDelete={(id) => void handleDelete(id)} onTogglePin={(id) => void handleTogglePin(id)} onLogout={() => void handleLogout()} email={session?.email ?? ""} />;
  if (editorProject === null || session === null) return <div className="app-loading" role="status">{messages.editor.loadingProject}</div>;
  return <><Suspense fallback={<div className="app-loading" role="status">{messages.editor.loadingWorkbench}</div>}><EditorApp key={`${editorProject.id}:${editorVersion}`} projectId={editorProject.id} projectName={localizeProjectName(editorProject.name)} initialSnapshot={editorProject.snapshot} {...(editorProject.recoveryNotice === undefined ? {} : { initialNotice: editorProject.recoveryNotice })} {...(editorProject.recoveredDraft === true ? { recoveredDraft: true } : {})} persistence={{ userId: session.userId, projectId: editorProject.id, baseServerRevision: editorProject.serverRevision, repository, indexStore }} authEpoch={authEpoch} onAuthRequired={() => setReauthenticate({ email: session.email })} onRenameProject={(name) => void handleRename(editorProject.id, name)} onBackToProjects={() => { setConflict(null); void loadProjects(session.userId).then(() => { if (!loggingOutRef.current) go("builds", "/my-builds"); }); }} onConflict={(snapshot) => void handleEditorConflict(snapshot)} /></Suspense><div className="editor-account-bar"><span>{session.email}</span><button type="button" onClick={() => void handleLogout()}>{messages.builds.logout}</button></div>{conflict !== null && <ConflictDialog conflict={conflict} onLoadCloud={() => void handleLoadCloud()} onSaveCopy={() => void handleSaveCopy()} />}{reauthenticate !== null && <ReauthDialog repository={repository} email={reauthenticate.email} onSuccess={handleReauth} onCancel={() => setReauthenticate(null)} />}</>;
};

interface AuthScreenProps { repository: ProjectRepository; onAuthenticated: (session: Session) => Promise<void>; onLocal: () => void; apiOnline: boolean; }
const authErrorMessage = (error: unknown, registering: boolean): string => {
  if (!(error instanceof ApiRequestError)) return messages.auth.apiUnavailable;
  if (error.apiError.code === "AUTH_INVALID") return messages.auth.loginError;
  if (error.apiError.code === "EMAIL_TAKEN") return messages.auth.emailTaken;
  if (error.apiError.code === "INVALID_AUTH_INPUT") return registering ? messages.auth.registerError : messages.auth.loginError;
  return messages.auth.apiUnavailable;
};
const AuthScreen = ({ repository, onAuthenticated, onLocal, apiOnline }: AuthScreenProps): ReactElement => {
  const [registering, setRegistering] = useState(false); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | undefined>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => { event.preventDefault(); setBusy(true); setError(undefined); try { const result = registering ? await repository.register(email, password) : await repository.login(email, password); await onAuthenticated(result); } catch (error: unknown) { setError(authErrorMessage(error, registering)); } finally { setBusy(false); } };
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="auth-title"><div className="auth-mark"><BrickBuilderLogo /></div><p className="eyebrow">{messages.brand}</p><h1 id="auth-title">{registering ? messages.auth.registerTitle : messages.auth.loginTitle}</h1><p className="auth-copy">{messages.auth.description}</p>{!apiOnline && <p className="inline-error" role="alert">{messages.auth.apiUnavailable}</p>}<form onSubmit={(event) => void submit(event)}><label>{messages.auth.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>{messages.auth.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={8} required /></label>{error !== undefined && <p className="inline-error" role="alert">{error}</p>}<button className="primary-action" type="submit" disabled={busy}>{busy ? messages.auth.working : registering ? messages.auth.register : messages.auth.login}</button></form><div className="auth-switch"><button type="button" onClick={() => setRegistering((value) => !value)}>{registering ? messages.auth.switchToLogin : messages.auth.switchToRegister}</button><button type="button" onClick={onLocal}>{messages.auth.continueLocally}</button></div></section></main>;
};

interface MyBuildsProps { projects: ProjectMetadata[]; localIndex: LocalProjectIndexEntry[]; email: string; error?: string; onCreate: () => void; onOpen: (id: string) => void; onRename: (id: string, name: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onTogglePin: (id: string) => void; onLogout: () => void; }
const MyBuilds = ({ projects, localIndex, email, error, onCreate, onOpen, onRename, onDuplicate, onDelete, onTogglePin, onLogout }: MyBuildsProps): ReactElement => {
  const [renaming, setRenaming] = useState<string | undefined>(); const [name, setName] = useState(""); const [renameError, setRenameError] = useState<string | undefined>(); const [deleteProject, setDeleteProject] = useState<ProjectMetadata | undefined>();
  const saveRename = (projectId: string): void => { if (name.trim().length === 0) { setRenameError(messages.builds.nameRequired); return; } onRename(projectId, name.trim()); setRenaming(undefined); setRenameError(undefined); };
  return <main className="builds-shell"><header className="app-topbar builds-topbar"><BrandLockup compact /><div className="builds-account"><span className="account-email">{email}</span><button className="account-menu" type="button" onClick={onLogout}>{messages.builds.logout}</button></div></header><section className="builds-content" aria-labelledby="builds-list-title"><div className="builds-heading"><div><h1>{messages.builds.title}</h1><p className="builds-subtitle">{messages.builds.subtitle}</p></div><button className="primary-action" type="button" onClick={onCreate}>{messages.builds.newBuild}</button></div>{error !== undefined && <p className="inline-error builds-error" role="alert">{error}</p>}<div className="builds-toolbar"><h2 id="builds-list-title">{messages.builds.recentProjects}</h2><span className="builds-count">{projects.length}</span></div>{projects.length === 0 ? <div className="empty-builds"><div className="empty-builds-mark" aria-hidden="true"><span /><span /><span /></div><h2>{messages.builds.emptyTitle}</h2><p>{messages.builds.emptyDescription}</p><button className="primary-action" type="button" onClick={onCreate}>{messages.builds.startBuilding}</button></div> : <div className="project-list">{projects.map((project) => <ProjectCard key={project.id} project={project} localEntry={localIndex.find((entry) => entry.projectId === project.id)} renaming={renaming === project.id} name={renaming === project.id ? name : localizeProjectName(project.name)} {...(renameError === undefined ? {} : { renameError })} onOpen={() => onOpen(project.id)} onStartRename={() => { setRenaming(project.id); setName(localizeProjectName(project.name)); setRenameError(undefined); }} onNameChange={(value) => { setName(value); setRenameError(undefined); }} onSaveRename={() => saveRename(project.id)} onCancelRename={() => { setRenaming(undefined); setRenameError(undefined); }} onDuplicate={() => onDuplicate(project.id)} onDelete={() => setDeleteProject(project)} onTogglePin={() => onTogglePin(project.id)} />)}</div>}</section>{deleteProject !== undefined && <DeleteProjectDialog project={deleteProject} onCancel={() => setDeleteProject(undefined)} onConfirm={() => { onDelete(deleteProject.id); setDeleteProject(undefined); }} />}</main>;
};

interface ProjectCardProps { project: ProjectMetadata; localEntry: LocalProjectIndexEntry | undefined; renaming: boolean; name: string; renameError?: string; onOpen: () => void; onStartRename: () => void; onNameChange: (name: string) => void; onSaveRename: () => void; onCancelRename: () => void; onDuplicate: () => void; onDelete: () => void; onTogglePin: () => void; }
const ProjectCard = ({ project, localEntry, renaming, name, renameError, onOpen, onStartRename, onNameChange, onSaveRename, onCancelRename, onDuplicate, onDelete, onTogglePin }: ProjectCardProps): ReactElement => { const [thumbnailFailed, setThumbnailFailed] = useState(false); useEffect(() => setThumbnailFailed(false), [project.thumbnailUrl]); const displayName = localizeProjectName(project.name); const pinLabel = localEntry?.isPinned === true ? messages.builds.unpin : messages.builds.pin; const showThumbnailPlaceholder = project.thumbnailUrl === undefined || thumbnailFailed; return <article className="project-card"><div className="project-thumbnail" aria-label={messages.builds.thumbnail(displayName)}>{showThumbnailPlaceholder ? <div className="thumbnail-placeholder" aria-hidden="true"><span /><span /><span /></div> : <img src={project.thumbnailUrl} alt="" onError={() => setThumbnailFailed(true)} />}</div><div className="project-card-body"><div className="project-card-heading">{renaming ? <div className="rename-editor"><div className="rename-row"><input value={name} onChange={(event) => onNameChange(event.target.value)} aria-label={messages.builds.projectName} placeholder={messages.builds.projectNamePlaceholder} maxLength={80} autoFocus /><button type="button" onClick={onSaveRename}>{messages.common.save}</button><button type="button" onClick={onCancelRename}>{messages.common.cancel}</button></div>{renameError !== undefined && <p className="inline-error" role="alert">{renameError}</p>}</div> : <h3>{displayName}</h3>}{localEntry?.isPinned === true && <span className="pin-badge">{messages.builds.offlineReady}</span>}</div><p>{messages.builds.summary(project.brickCount, formatDateTimeZhCN(project.updatedAt))}</p>{localEntry?.offlineReady === true && <span className="offline-ready-badge">{messages.builds.offlineReady}</span>}<div className="project-card-actions"><button className="primary-action" type="button" onClick={onOpen}>{messages.builds.open}</button><button type="button" onClick={onTogglePin}>{pinLabel}</button><button type="button" onClick={onStartRename}>{messages.common.rename}</button><button type="button" onClick={onDuplicate}>{messages.common.duplicate}</button><button type="button" onClick={onDelete}>{messages.common.delete}</button></div></div></article>; };

interface DeleteProjectDialogProps { project: ProjectMetadata; onCancel: () => void; onConfirm: () => void; }
const DeleteProjectDialog = ({ project, onCancel, onConfirm }: DeleteProjectDialogProps): ReactElement => <div className="conflict-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-description"><h2 id="delete-project-title">{messages.builds.deleteTitle}</h2><p id="delete-project-description">{messages.builds.deleteDescription}</p><p className="conflict-note">{localizeProjectName(project.name)}</p><div className="conflict-actions"><button type="button" onClick={onCancel} autoFocus>{messages.common.cancel}</button><button className="primary-action" type="button" onClick={onConfirm}>{messages.builds.deleteAction}</button></div></section></div>;

interface ConflictDialogProps { conflict: ConflictState; onLoadCloud: () => void; onSaveCopy: () => void; }
const ConflictDialog = ({ conflict, onLoadCloud, onSaveCopy }: ConflictDialogProps): ReactElement => <div className="conflict-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><h2 id="conflict-title">{messages.builds.conflictTitle}</h2><p>{messages.builds.conflictDescription}</p><div className="conflict-versions"><div><span className="section-label">{messages.builds.cloudVersion}</span><strong>{localizeProjectName(conflict.cloud.name)}</strong><span>{messages.builds.conflictVersion(conflict.cloud.serverRevision, conflict.cloud.brickCount)}</span></div><div><span className="section-label">{messages.builds.localVersion}</span><strong>{messages.builds.brickCount(conflict.localSnapshot.bricks.length)}</strong><span>{messages.builds.localDraft}</span></div></div><div className="conflict-actions"><button className="primary-action" type="button" onClick={onLoadCloud}>{messages.builds.loadCloud}</button><button type="button" onClick={onSaveCopy}>{messages.builds.saveCopy}</button></div><p className="conflict-note">{messages.builds.conflictNote}</p></section></div>;

interface ReauthDialogProps { repository: ProjectRepository; email: string; onSuccess: (session: Session) => void; onCancel: () => void; }
const ReauthDialog = ({ repository, email, onSuccess, onCancel }: ReauthDialogProps): ReactElement => { const [password, setPassword] = useState(""); const [error, setError] = useState<string | undefined>(); const [busy, setBusy] = useState(false); const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => { event.preventDefault(); setBusy(true); setError(undefined); try { onSuccess(await repository.login(email, password)); } catch (error: unknown) { setError(error instanceof ApiRequestError && error.apiError.code === "AUTH_INVALID" ? messages.auth.reauthError : messages.auth.apiUnavailable); } finally { setBusy(false); } }; return <div className="conflict-backdrop"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="reauth-title"><p className="eyebrow">{messages.auth.sessionExpired}</p><h2 id="reauth-title">{messages.auth.sessionExpired}</h2><p>{messages.auth.reauthDescription}</p><form className="reauth-form" onSubmit={(event) => void submit(event)}><label>{messages.auth.email}<input value={email} readOnly /></label><label>{messages.auth.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error !== undefined && <p className="inline-error" role="alert">{error}</p>}<div className="conflict-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? messages.auth.working : messages.auth.login}</button><button type="button" onClick={onCancel}>{messages.auth.keepWorkingLocally}</button></div></form></section></div>; };

const BrickBuilderLogo = (): ReactElement => <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="7" width="15" height="15" rx="3" fill="currentColor" /><rect x="25" y="7" width="16" height="10" rx="3" fill="currentColor" /><rect x="25" y="20" width="12" height="10" rx="3" fill="currentColor" /><rect x="7" y="25" width="15" height="16" rx="3" fill="currentColor" /><rect x="25" y="33" width="16" height="8" rx="3" fill="currentColor" /></svg>;
const BrandLockup = ({ compact = false }: { compact?: boolean }): ReactElement => <div className={`brand-lockup${compact ? " is-compact" : ""}`}><span className="brand-mark" aria-hidden="true"><BrickBuilderLogo /></span><span className="brand-name">{messages.brand}</span></div>;
const readProjectId = (): string | null => { const match = /^\/projects\/([^/]+)$/.exec(window.location.pathname); return match?.[1] === undefined ? new URLSearchParams(window.location.search).get("project") : decodeURIComponent(match[1]); };
const readReturnTo = (): string | null => projectIdFromPath(new URLSearchParams(window.location.search).get("returnTo")) === null ? null : new URLSearchParams(window.location.search).get("returnTo");
const projectIdFromPath = (path: string | null): string | null => { if (path === null) return null; const match = /^\/projects\/([^/]+)$/.exec(path); return match?.[1] === undefined ? null : decodeURIComponent(match[1]); };
const readToolView = (): Exclude<View, "checking" | "auth" | "builds" | "editor" | "local"> | null => window.location.pathname === "/assets" ? "assets" : window.location.pathname === "/authoring" ? "authoring" : window.location.pathname === "/benchmark" && import.meta.env.DEV ? "benchmark" : null;
const recoverOfflineProject = async (userId: string, projectId: string, draftStore: LocalDraftStore, cachedStore: CachedProjectStore): Promise<EditorProject | null> => { const [draft, cached] = await Promise.all([withTimeout(draftStore.get(userId, projectId), null), withTimeout(cachedStore.get(userId, projectId), null)]); const snapshot = draft?.snapshot ?? cached?.snapshot; const revision = draft?.baseServerRevision ?? cached?.serverRevision; if (snapshot === undefined || revision === undefined) return null; return { id: projectId, name: messages.builds.offlineDraft, brickCount: snapshot.bricks.length, currentRevision: revision, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), snapshot, serverRevision: revision, recoveryNotice: draft === undefined ? messages.editor.offlineCachedNotice : messages.editor.draftRecoveredNotice, ...(draft === undefined ? {} : { recoveredDraft: true }) }; };

const metadataFromLocalIndex = (entry: LocalProjectIndexEntry): ProjectMetadata => ({ id: entry.projectId, name: entry.name, ...(entry.thumbnailUrl === undefined ? {} : { thumbnailUrl: entry.thumbnailUrl }), brickCount: 0, currentRevision: entry.serverRevision, createdAt: new Date(entry.lastOpenedAt).toISOString(), updatedAt: new Date(entry.lastOpenedAt).toISOString() });
