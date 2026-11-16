import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { History } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CardTheme } from './card-themes';
import { BoardGroup } from './BoardGroup';
import { BrandMark } from './BrandMark';
import { SecurityNode } from './SecurityNode';
import { RoutedEdge } from './RoutedEdge';
import { formatTime, project, typeLabel as typeLabelOf, type CanvasNode } from './graph';
import { EMPTY_FILTER, type NodeFilter } from './presentation';
import { useGraphStream } from './use-graph-stream';
import { CanvasPeekCard } from './panels/CanvasPeekCard';
import { CanvasToolbar } from './panels/CanvasToolbar';
import { CommandPalette } from './panels/CommandPalette';
import { DigestDialog } from './panels/DigestDialog';
import { EmptyBoard } from './panels/EmptyBoard';
import { Legend } from './panels/Legend';
import { ShortcutsDialog } from './panels/ShortcutsDialog';
import { Inspector } from './panels/Inspector';
import { NewNodeDialog } from './panels/EditPanel';
import { Sidebar } from './panels/Sidebar';
import { Topbar } from './panels/Topbar';
import { TimelineBar } from './panels/TimelineBar';
import { locale, t } from './i18n';
import { SessionDrafts, WriteRecovery } from './session-drafts';
import { useWorkspaceData } from './workspace/use-workspace-data';
import { useWorkspaceLocation } from './workspace/use-workspace-location';
import { useWorkspaceLayout } from './workspace/use-workspace-layout';
import { useWorkspaceViewport } from './workspace/use-workspace-viewport';
import { useWorkspaceSelection } from './workspace/use-workspace-selection';
import { useWorkspacePresentation } from './workspace/use-workspace-presentation';
import { useWorkspaceFeedback } from './workspace/use-workspace-feedback';
import { useWorkspaceScene } from './workspace/use-workspace-scene';
import { useWorkspaceTimeline } from './workspace/use-workspace-timeline';
import { useWorkspaceChrome, useWorkspaceShortcuts } from './workspace/use-workspace-chrome';
import { useEmbedHost } from './workspace/use-embed-host';
import { AuditCatalog, AuditDossier } from './workspace/shells/audit';
import { isAuditIssue } from './workspace/audit';
import type { BoardNode } from './types';
import type { Scene3DProps } from './scene3d/shared';
import { readPresentation } from './embedded';
import { usePref } from './use-pref';
import { runViewTransition } from './view-transition';

const KNOWN_NODE_TYPES = new Set(['start', 'goal', 'intent', 'hypothesis', 'question', 'fact', 'observation', 'action', 'result', 'finding', 'vuln', 'hint', 'summary', 'note']);

const nodeTypes = { security: SecurityNode, boardGroup: BoardGroup };
const edgeTypes = { routed: RoutedEdge };
// three.js and the post-processing stack load only when the reader opens the sandbox. An offline HTML
// export has no server for that chunk; the board then announces it and stays on the flat canvas.
const Scene3D = lazy(() => import('./scene3d/Scene3D').catch(() => ({
  default: function Unavailable({ onExit, onNotice }: Scene3DProps) {
    useEffect(() => { onNotice(t('scene3d.failed')); onExit(); }, []);
    return <></>;
  },
})));

function Workspace() {
  const [presentation] = useState(() => readPresentation(location.search));
  const { snapshot: live, connection, syncedAt, isStatic, reload } = useGraphStream();
  const { workspace, navigateWorkspace, issueId, candidateId, agentId, setAgentId, mode, setMode, selectedId, setSelectedId, asOf, setAsOf, deepLink, pendingFocus } = useWorkspaceLocation();
  // A checkpoint view replaces what every panel reads; the live stream keeps running underneath.
  const timeline = useWorkspaceTimeline(live, asOf, setAsOf, isStatic);
  const snapshot = timeline.snapshot;
  const [timelineOpen, setTimelineOpen] = useState(() => Boolean(asOf) && !isStatic);
  const {
    theme, setTheme, cardTheme, setCardTheme, direction, setDirection, sidebarOpen, setSidebarOpen, closeSidebar,
    showMap, setShowMap, showLegend, setShowLegend, edgeStyle, setEdgeStyle, follow, setFollow,
    showChanges, setShowChanges, paletteOpen, setPaletteOpen, digestOpen, setDigestOpen,
    newOpen, setNewOpen, shortcutsOpen, setShortcutsOpen, setFonts: setHostFonts,
  } = useWorkspaceChrome({ embedded: presentation.embedded, appearance: presentation.appearance, fonts: presentation.fonts });
  const [filter, setFilter] = useState<NodeFilter>(EMPTY_FILTER);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [auditGraphOpen, setAuditGraphOpen] = usePref('audit-graph', false);
  const [auditSplit, setAuditSplit] = usePref('audit-split', 54);
  const clampSplit = (value: number) => Math.max(28, Math.min(76, Math.round(value)));
  const digestTrigger = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const auditMode = workspace === 'audit';
  const showAuditGraph = auditMode && auditGraphOpen;
  const canvasMode = auditMode ? 'logic' : mode;
  const { board, agent, audit, expandAudit, projection, results, legend } = useWorkspaceData(snapshot, mode, agentId, filter, auditMode ? { issueId, candidateId, selectedId: selectedId ?? deepLink.current } : undefined);
  const { allNodes, allEdges, activities, byId, inbox, paletteNodes, filterOptions, counts } = board;
  const { agentIds, digest, currentId, current, findings, openItems } = agent;
  // Stepping through checkpoints is not the Agent writing: only the live board pulses.
  const { fresh, notice, flash, linkCopied, copyNodeLink, copied, copyDigest, offlineShown } = useWorkspaceFeedback(timeline.active ? null : snapshot, allNodes, digest, agentId, connection, isStatic);
  const { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying, layoutTransition } = useWorkspaceLayout(projection, canvasMode, direction);
  const { centerOnNode, fitCanvas, focusNeighborhood, motion } = useWorkspaceViewport({ viewportRef, pendingFocus, layoutRevision, mode: canvasMode, follow: follow && !auditMode, currentId, selectedId });
  const { scene3d, sceneRef, openScene, closeScene, occlusion, exporting, exportImage } = useWorkspaceScene({ viewportRef, flatRef, inspectorRef, selectedId, mode: canvasMode, flash, enabled: !auditMode });
  // Resolve selection against the requested checkpoint, never its loading fallback.
  const { selected, focusNode, clearSelection, switchMode, handleNodesChange, onNodeClick } = useWorkspaceSelection({
    snapshot: timeline.active && !timeline.point ? null : snapshot,
    byId, projection, nodes, edges, mode, setMode, selectedId, setSelectedId,
    deepLink, pendingFocus, centerOnNode, onNodesChange, closeSidebar, scene3d, revealInGeneral: !auditMode,
  });
  // A bare host can navigate and restyle; only `reference=1` offers the explicit reference action,
  // and never over a checkpoint or a static export, where the canonical node may differ.
  const referenceEnabled = presentation.embedded && presentation.reference && window.parent !== window && !isStatic && !timeline.active;
  const reference = useEmbedHost({
    embedded: presentation.embedded,
    enabled: referenceEnabled,
    onAppearance: setTheme,
    onFonts: setHostFonts,
    onNavigate: (id) => {
      // A host can navigate before the first snapshot or a requested checkpoint has loaded.
      if (!snapshot || (timeline.active && !timeline.point)) {
        deepLink.current = id;
        pendingFocus.current = id;
      } else if (byId.has(id)) {
        deepLink.current = null;
        focusNode(id);
      }
    },
  });
  const activeHoverId = hoveredNodeId && byId.has(hoveredNodeId) ? hoveredNodeId : null;
  const { highlighted, displayNodes, displayEdges } = useWorkspacePresentation(
    nodes,
    edges,
    selectedId,
    fresh,
    canvasMode,
    edgeStyle,
    showChanges && timeline.active ? timeline.changeMap : null,
    activeHoverId,
  );
  useEffect(() => { setHoveredNodeId(null); }, [workspace, canvasMode]);
  const hidden = projection?.hidden || 0;
  const visibleIds = useMemo(
    () => (hidden > 0 ? new Set((projection?.nodes || []).map((node) => node.id)) : undefined),
    [hidden, projection],
  );

  const neighborhoodTarget = selectedId ?? (!auditMode ? currentId : null);
  const triggerNeighborhood = neighborhoodTarget ? () => {
    focusNode(neighborhoodTarget, false);
    if (projection?.nodes.some((node) => node.id === neighborhoodTarget)) {
      requestAnimationFrame(() => focusNeighborhood(neighborhoodTarget, edges));
    }
  } : undefined;

  useWorkspaceShortcuts(clearSelection, setPaletteOpen, setShortcutsOpen, setSidebarOpen, {
    enabled: Boolean(snapshot) && !scene3d && (!auditMode || showAuditGraph),
    onFit: fitCanvas,
    onLocate: !auditMode && currentId ? () => focusNode(currentId) : undefined,
    onNeighborhood: (!auditMode || showAuditGraph) ? triggerNeighborhood : undefined,
    onToggleMap: () => setShowMap((open) => !open),
  });

  const toggleTheme = (origin?: { x: number; y: number }) => {
    runViewTransition(() => setTheme(theme === 'light' ? 'dark' : 'light'), origin);
  };
  const changeCardTheme = (next: CardTheme) => {
    if (next !== cardTheme) runViewTransition(() => setCardTheme(next));
  };
  const openAuditArgument = (node: BoardNode) => {
    navigateWorkspace(isAuditIssue(node) ? { issueId: node.id, candidateId: null, node: node.id } : { candidateId: node.id, node: node.id });
    focusNode(node.id);
    pendingFocus.current = node.id;
  };
  const chooseIssue = (id: string | null) => {
    navigateWorkspace({ issueId: id, candidateId: null, node: id });
    if (id) focusNode(id); else clearSelection();
    pendingFocus.current = id;
  };
  const chooseCandidate = (id: string | null) => {
    navigateWorkspace({ candidateId: id, node: id ?? issueId });
    if (id ?? issueId) focusNode((id ?? issueId)!); else clearSelection();
    pendingFocus.current = id ?? issueId;
  };

  // A single authored issue should open immediately so the dossier is not an empty shell.
  useEffect(() => {
    if (!auditMode || !audit || issueId || candidateId || audit.issues.length !== 1) return;
    const sole = audit.issues[0];
    navigateWorkspace({ issueId: sole.id, candidateId: null, node: sole.id });
    pendingFocus.current = sole.id;
  }, [auditMode, audit, issueId, candidateId]);

  if (!snapshot) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <BrandMark size={32} />
        <strong className="text-sm font-semibold text-foreground">Pinwhy</strong>
        <span className="text-xs">{connection === 'offline' ? t('app.waitingService') : t('app.restoring')}</span>
      </main>
    );
  }

  // While a checkpoint is shown (or still loading over the live picture) nothing can be written.
  const writable = !isStatic && !timeline.active && snapshot.meta.writable === true;
  const pastPoint = snapshot.meta.asOf;
  const stats = snapshot.stats || {};

  return (
    <div className="flex h-full flex-col">
      <Topbar
        compact={presentation.embedded}
        title={snapshot.meta.title || t('app.untitledTask')}
        build={snapshot.meta.build}
        workspace={workspace}
        onWorkspace={(next) => {
          navigateWorkspace({ workspace: next });
          if (selectedId) pendingFocus.current = selectedId;
          if (next === 'general' && snapshot && selectedId && !project(snapshot, mode, '', agentId).nodes.some((node) => node.id === selectedId)) setMode('all');
        }}
        mode={mode}
        onMode={switchMode}
        agentId={agentId}
        agentIds={agentIds}
        onAgent={setAgentId}
        theme={theme}
        onTheme={toggleTheme}
        connection={connection}
        isStatic={isStatic}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onSearch={() => setPaletteOpen(true)}
        onDigest={() => setDigestOpen(true)}
        onNew={writable ? () => setNewOpen(true) : undefined}
        digestRef={digestTrigger}
        activities={activities}
        activityTotal={stats.activities || activities.length}
        timelineOpen={timelineOpen}
        onTimeline={isStatic ? undefined : () => {
          if (timelineOpen) { timeline.pause(); setAsOf(null); }
          setTimelineOpen(!timelineOpen);
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <button className="absolute inset-0 z-20 bg-black/20 lg:hidden" aria-label={t('app.closeNav')} onClick={() => setSidebarOpen(false)} />
            <aside className="anim-sidebar-in z-30 w-64 shrink-0 border-r bg-background max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-float">
              {audit ? <AuditCatalog audit={audit} selectedId={selectedId} onSelect={focusNode} onIssue={chooseIssue} onCandidate={chooseCandidate} onCandidateIssue={(id) => navigateWorkspace({ issueId: id })} onOpenArgument={openAuditArgument} onExpand={expandAudit} onSearch={() => { setPaletteOpen(true); closeSidebar(); }} /> :
              <Sidebar
                current={current}
                goals={agent.goals}
                openItems={openItems}
                findings={findings}
                inbox={inbox}
                selectedId={selectedId}
                visibleIds={visibleIds}
                counts={counts}
                onSelect={focusNode}
                onSearch={() => { setPaletteOpen(true); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                onShortcuts={() => setShortcutsOpen(true)}
                filter={filter}
                onFilter={setFilter}
                filterOptions={filterOptions}
                results={results}
              />}
            </aside>
          </>
        )}

        <main ref={viewportRef} className="relative flex min-w-0 flex-1 flex-col" aria-label={auditMode ? t('audit.dossier') : t('app.canvas')}>
          <div className="relative flex min-h-0 flex-1 flex-col">
          {audit && (
            <div
              className={cn('min-h-0', showAuditGraph ? 'shrink-0 border-b' : 'flex-1')}
              style={showAuditGraph ? { height: `${clampSplit(auditSplit)}%` } : undefined}
            >
              <AuditDossier
                audit={audit}
                selected={selected}
                graphOpen={auditGraphOpen}
                onToggleGraph={() => setAuditGraphOpen((open) => !open)}
                onSelect={focusNode}
                onIssue={chooseIssue}
                onCandidate={chooseCandidate}
                onOpenArgument={openAuditArgument}
                onExpand={expandAudit}
              />
            </div>
          )}
          {showAuditGraph && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('audit.resizeSplit')}
              aria-valuemin={28}
              aria-valuemax={76}
              aria-valuenow={clampSplit(auditSplit)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') { event.preventDefault(); setAuditSplit((value) => clampSplit(value - 4)); }
                if (event.key === 'ArrowDown') { event.preventDefault(); setAuditSplit((value) => clampSplit(value + 4)); }
              }}
              onPointerDown={(event) => {
                const container = event.currentTarget.parentElement;
                if (!container) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const startY = event.clientY;
                const startSplit = clampSplit(auditSplit);
                const totalHeight = Math.max(160, container.getBoundingClientRect().height);
                const onMove = (moveEvent: PointerEvent) => {
                  const pct = startSplit + ((moveEvent.clientY - startY) / totalHeight) * 100;
                  setAuditSplit(clampSplit(pct));
                };
                const onUp = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
              className="group relative z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-b bg-background/80 transition-colors hover:bg-accent"
            >
              <span className="h-0.5 w-10 rounded-full bg-border transition-colors group-hover:bg-strong" />
            </div>
          )}
          {(!auditMode || showAuditGraph) && (
          <div ref={flatRef} data-layout-transition={layoutTransition ? 'true' : undefined} className={cn('relative min-h-0', auditMode ? 'flex-1' : 'absolute inset-0')} inert={scene3d} aria-hidden={scene3d}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={(event, node) => {
              onNodeClick(event, node);
              const detail = (event.target as Element).closest<HTMLButtonElement>('button[data-audit-detail]')?.dataset.auditDetail;
              if (audit && (detail === 'contradiction' || detail === 'condition')) {
                const context = audit.contexts.get(node.id);
                if (context && !context.pages[detail].open) expandAudit(context.pages[detail].key, 'more', 0);
              }
            }}
            onNodeDoubleClick={(_event, node) => {
              if (!node.data.group) {
                focusNode(node.id, false);
                requestAnimationFrame(() => focusNeighborhood(node.id, edges));
              }
            }}
            onPaneClick={clearSelection}
            onNodeMouseEnter={(_event, node) => { if (!node.data.group) setHoveredNodeId(node.id); }}
            onNodeMouseLeave={(_event, node) => { setHoveredNodeId((prev) => (prev === node.id ? null : prev)); }}
            nodesConnectable={false}
            deleteKeyCode={null}
            autoPanOnNodeFocus={false}
            minZoom={0.08}
            maxZoom={1.8}
            colorMode={theme}
            fitView
            fitViewOptions={{ padding: .14, minZoom: .08, maxZoom: 1 }}
            onMove={(_, viewport) => {
              viewportRef.current?.style.setProperty('--zoom', String(viewport.zoom));
              setCanvasZoom((prev) => Math.abs(prev - viewport.zoom) > 0.04 ? viewport.zoom : prev);
            }}
            proOptions={{ hideAttribution: true }}
            onlyRenderVisibleElements
          >
            <Background id="minor" variant={BackgroundVariant.Dots} gap={20} size={1.05} />
            <Background id="major" variant={BackgroundVariant.Dots} gap={100} size={1.75} color="var(--line-strong)" />
            <CanvasToolbar
              hasCurrent={!auditMode && Boolean(currentId)}
              canFollow={!isStatic && !auditMode}
              canExport={Boolean(projection?.nodes.length) && nodes.length > 0 && !exporting}
              onExport={exportImage}
              grouped={auditMode || canvasMode === 'all'}
              direction={direction}
              showMap={showMap}
              follow={follow}
              onToggleFollow={() => setFollow((value) => !value)}
              motion={motion}
              onLocate={() => currentId && focusNode(currentId)}
              canFocusNeighborhood={Boolean(triggerNeighborhood)}
              onFocusNeighborhood={triggerNeighborhood}
              onDirection={() => setDirection(direction === 'RIGHT' ? 'DOWN' : 'RIGHT')}
              onToggleMap={() => setShowMap((open) => !open)}
              showLegend={showLegend}
              onToggleLegend={() => setShowLegend((open) => !open)}
              edgeStyle={edgeStyle}
              onEdgeStyle={setEdgeStyle}
              cardTheme={cardTheme}
              onCardTheme={changeCardTheme}
              onScene3d={auditMode ? undefined : openScene}
            />
            {showMap && (
              <MiniMap
                position="bottom-left"
                style={{ marginBottom: 64 }}
                pannable
                zoomable
                nodeBorderRadius={4}
                nodeStrokeWidth={3}
                nodeColor={(node) => {
                  const d = node.data as CanvasNode['data'];
                  if (d.group) return 'transparent';
                  if (d.current) return 'var(--live)';
                  if (['dead', 'refuted', 'superseded'].includes(d.item?.status || '')) return 'var(--line-strong)';
                  if (d.item?.severity === 'critical' || d.item?.severity === 'high') return 'var(--danger)';
                  return KNOWN_NODE_TYPES.has(d.item?.type) ? `var(--node-${d.item.type})` : 'var(--ink-3)';
                }}
                nodeStrokeColor={(node) => {
                  const d = node.data as CanvasNode['data'];
                  if (d.group) return 'var(--line-strong)';
                  if (node.id === selectedId) return 'var(--ink)';
                  if (d.current) return 'var(--live)';
                  return 'transparent';
                }}
              />
            )}
          </ReactFlow>
          </div>
          )}

          {!auditMode && scene3d && (
            <Suspense fallback={<div role="status" className="absolute inset-0 z-[5] flex items-center justify-center bg-background text-xs text-muted-foreground">{t('scene3d.loading')}</div>}>
              <Scene3D
                ref={sceneRef}
                nodes={nodes}
                edges={edges}
                mode={canvasMode}
                layoutMode={layoutMode}
                direction={direction}
                theme={theme}
                selectedId={selectedId}
                highlighted={highlighted}
                currentId={currentId}
                canFollow={!isStatic && !auditMode}
                follow={follow && !isStatic}
                showLegend={showLegend}
                fresh={fresh}
                motion={motion > 0}
                occlusion={occlusion}
                exporting={exporting}
                onExport={exportImage}
                onDirection={() => setDirection(direction === 'RIGHT' ? 'DOWN' : 'RIGHT')}
                onToggleFollow={() => setFollow((value) => !value)}
                onToggleLegend={() => setShowLegend((open) => !open)}
                onSelect={(id) => id ? focusNode(id) : clearSelection()}
                onExit={closeScene}
                onNotice={flash}
              />
            </Suspense>
          )}

          {!auditMode && showLegend && nodes.length > 0 && <Legend types={legend.types} groups={legend.groups} onClose={() => setShowLegend(false)} />}

          {!auditMode && projection && projection.nodes.length === 0 && (
            <EmptyBoard viewEmpty={allNodes.length > 0} isStatic={isStatic} onShowAll={() => switchMode('all')} />
          )}

          <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
            {offlineShown && (
              <div role="alert" className="whitespace-nowrap rounded-full border border-destructive/40 bg-danger-soft px-3 py-1 text-xs text-destructive shadow-xs">
                {t('app.disconnected')}{syncedAt ? t('app.frozenAt', { time: new Date(syncedAt).toLocaleTimeString(locale, { hour12: false }) }) : ''}
              </div>
            )}
            {timeline.active && (
              <div role="status" className="anim-pill-in pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card/90 px-3 py-1 text-xs text-foreground shadow-float backdrop-blur-md">
                <History className="size-3.5" />
                {t('timeline.banner', { id: timeline.point?.id ?? asOf ?? '', time: formatTime(timeline.point?.at ?? undefined) })}
                <button type="button" className="rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { timeline.pause(); setAsOf(null); }}>
                  {t('timeline.backToNow')}
                </button>
              </div>
            )}
            {isStatic && pastPoint && (
              <div role="status" className="flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card/90 px-3 py-1 text-xs text-foreground shadow-xs backdrop-blur-md">
                <History className="size-3.5" />
                {t('timeline.staticBadge', { id: pastPoint.id, time: formatTime(pastPoint.at ?? undefined) })}
              </div>
            )}
            {hidden > 0 && (
              <button
                className="anim-pill-in pointer-events-auto whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md transition-colors hover:border-strong hover:text-foreground"
                onClick={() => switchMode('all')}
              >
                {t('app.hiddenNodes', { n: hidden })}
              </button>
            )}
            {laying > 0 && <div role="status" className="anim-pill-in whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md">{t('app.laying', { n: laying })}</div>}
            {notice && <div role="status" className="anim-pill-in whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs shadow-float backdrop-blur-md">{notice}</div>}
          </div>

          <p className="sr-only" role="status" aria-live="polite">{selected ? t('app.selected', { type: typeLabelOf(selected.type), title: selected.title }) : ''}</p>

          <CanvasPeekCard
            node={activeHoverId && activeHoverId !== selectedId ? byId.get(activeHoverId) ?? null : null}
            degree={activeHoverId ? (nodes.find((node) => node.id === activeHoverId)?.data.degree ?? 0) : 0}
            visible={!scene3d && (!auditMode || showAuditGraph) && canvasZoom < 0.85 && Boolean(activeHoverId && activeHoverId !== selectedId)}
            inspectorOpen={Boolean(selected)}
          />

          {selected && <Inspector panelRef={inspectorRef} node={selected} edges={allEdges} byId={byId} onClose={clearSelection} onFocus={focusNode} onFocusNeighborhood={(!auditMode || showAuditGraph) ? () => focusNeighborhood(selected.id, edges) : undefined} onCopyLink={copyNodeLink} linkCopied={linkCopied} reference={referenceEnabled ? { status: reference.status, message: reference.message, nodeId: reference.nodeId, onRequest: reference.request } : undefined} writable={writable} onReload={reload} isStatic={isStatic} connected={connection === 'live'} revision={syncedAt} />}
          </div>
        </main>
      </div>

      {timelineOpen && !isStatic && (
        <TimelineBar
          points={timeline.points}
          position={timeline.position}
          active={timeline.active}
          loading={timeline.loading}
          error={timeline.error}
          previousId={timeline.previousId}
          changes={timeline.changes}
          showChanges={showChanges}
          onShowChanges={setShowChanges}
          playing={timeline.playing}
          onPlay={timeline.play}
          onPause={timeline.pause}
          onGoTo={timeline.goTo}
          onClose={() => { timeline.pause(); setAsOf(null); setTimelineOpen(false); }}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        nodes={paletteNodes}
        theme={theme}
        cardTheme={cardTheme}
        copied={copied}
        onSelect={focusNode}
        onMode={auditMode ? undefined : switchMode}
        onTheme={toggleTheme}
        onCardTheme={changeCardTheme}
        onCopyDigest={copyDigest}
        onExport={projection?.nodes.length && nodes.length > 0 && !exporting ? exportImage : null}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <WriteRecovery writable={writable} />
      {writable && <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />}
      <DigestDialog open={digestOpen} onOpenChange={setDigestOpen} digest={digest} copied={copied} onCopy={copyDigest} returnFocus={digestTrigger} byId={byId} onFocus={focusNode} agentId={agentId} checkpoints={snapshot?.checkpoints} isStatic={isStatic} connected={connection === 'live'} revision={syncedAt} />
    </div>
  );
}

export function App() {
  return <TooltipProvider delayDuration={300}><ReactFlowProvider><SessionDrafts><Workspace /></SessionDrafts></ReactFlowProvider></TooltipProvider>;
}
