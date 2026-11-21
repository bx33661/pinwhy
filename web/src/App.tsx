import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CardTheme } from './card-themes';
import { BoardGroup } from './BoardGroup';
import { BrandMark } from './BrandMark';
import { SecurityNode } from './SecurityNode';
import { RoutedEdge } from './RoutedEdge';
import { project, typeLabel as typeLabelOf, type CanvasNode } from './graph';
import { EMPTY_FILTER, miniMapNodeColor, type NodeFilter } from './presentation';
import { useGraphStream } from './use-graph-stream';
import { CanvasPeekCard } from './panels/CanvasPeekCard';
import { CanvasToolbar } from './panels/CanvasToolbar';
import { CommandPalette } from './panels/CommandPalette';
import { DigestDialog } from './panels/DigestDialog';
import { EmptyBoard } from './panels/EmptyBoard';
import { Legend } from './panels/Legend';
import { SettingsDialog } from './panels/SettingsDialog';
import { ShortcutsDialog } from './panels/ShortcutsDialog';
import { Inspector } from './panels/Inspector';
import { NewNodeDialog } from './panels/EditPanel';
import { Sidebar } from './panels/Sidebar';
import { Topbar } from './panels/Topbar';
import { TimelineBar } from './panels/TimelineBar';
import { t } from './i18n';
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
import { WorkspaceBanners } from './workspace/WorkspaceBanners';
import { AuditBlueprintBar, AuditCatalog, AuditDossier } from './workspace/shells/audit';
import { isAuditIssue } from './workspace/audit';
import { useSceneOcclusion } from './scene3d/use-scene-occlusion';
import type { BoardNode } from './types';
import type { Scene3DProps } from './scene3d/shared';
import { readPresentation } from './embedded';
import { ExportingContext } from './export-context';
import { runViewTransition } from './view-transition';

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
    showChanges, setShowChanges, motionMode, setMotionMode, showCardLoc, setShowCardLoc,
    showPeekHud, setShowPeekHud, showZoomSlider, setShowZoomSlider,
    auditProvenanceMode, setAuditProvenanceMode, showEmptyActivity, setShowEmptyActivity, resetPreferences,
    paletteOpen, setPaletteOpen, digestOpen, setDigestOpen,
    newOpen, setNewOpen, shortcutsOpen, setShortcutsOpen, settingsOpen, setSettingsOpen, setFonts: setHostFonts,
  } = useWorkspaceChrome({ embedded: presentation.embedded, appearance: presentation.appearance, fonts: presentation.fonts });
  const [filter, setFilter] = useState<NodeFilter>(EMPTY_FILTER);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [farZoom, setFarZoom] = useState(false);
  const lastZoomRef = useRef(1);
  const [auditGraphOpen, setAuditGraphOpen] = useState(false);
  const digestTrigger = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const auditMode = workspace === 'audit';
  const canvasMode = auditMode ? 'logic' : mode;
  const { board, agent, audit, expandAudit, projection, results, legend } = useWorkspaceData(snapshot, mode, agentId, filter, auditMode ? { issueId, candidateId, selectedId: selectedId ?? deepLink.current } : undefined);
  const canShowAuditGraph = Boolean(audit && (audit.root || selectedId || audit.records.length === 1));
  const showAuditGraph = auditMode && auditGraphOpen && canShowAuditGraph;
  const { allNodes, allEdges, activities, byId, inbox, paletteNodes, filterOptions, counts } = board;
  const { agentIds, digest, currentId, current, findings, openItems } = agent;
  // Stepping through checkpoints is not the Agent writing: only the live board pulses.
  const { fresh, notice, flash, linkCopied, copyNodeLink, copied, copyDigest, offlineShown } = useWorkspaceFeedback(timeline.active ? null : snapshot, allNodes, digest, agentId, connection, isStatic);
  const { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying, layoutTransition } = useWorkspaceLayout(projection, canvasMode, direction);
  const { centerOnNode, fitCanvas, focusNeighborhood, motion } = useWorkspaceViewport({ viewportRef, pendingFocus, layoutRevision, mode: canvasMode, follow: follow && !auditMode, currentId, selectedId, motionMode });
  const { scene3d, sceneRef, openScene, closeScene, occlusion, exporting, exportImage } = useWorkspaceScene({ viewportRef, flatRef, inspectorRef, selectedId, mode: canvasMode, audit: auditMode, flash, enabled: !auditMode });
  // Resolve selection against the requested checkpoint, never its loading fallback.
  const { selected, focusNode, clearSelection, switchMode, handleNodesChange, onNodeClick } = useWorkspaceSelection({
    snapshot: timeline.active && !timeline.point ? null : snapshot,
    byId, projection, nodes, edges, mode, setMode, selectedId, setSelectedId,
    deepLink, pendingFocus, centerOnNode, onNodesChange, closeSidebar, scene3d,
    revealInGeneral: !auditMode,
    canvasActive: !auditMode || showAuditGraph,
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
  const activeChanges = showChanges && timeline.active ? timeline.changeMap : null;
  const { highlighted, displayNodes, displayEdges } = useWorkspacePresentation(
    nodes,
    edges,
    selectedId,
    fresh,
    canvasMode,
    edgeStyle,
    activeChanges,
    exporting ? null : activeHoverId,
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

  const toggleTheme = (origin?: { x: number; y: number }) => {
    runViewTransition(() => setTheme(theme === 'light' ? 'dark' : 'light'), origin);
  };
  const changeThemeTo = (next: 'light' | 'dark', origin?: { x: number; y: number }) => {
    if (next !== theme) runViewTransition(() => setTheme(next), origin);
  };
  const changeCardTheme = (next: CardTheme) => {
    if (next !== cardTheme) runViewTransition(() => setCardTheme(next));
  };
  const switchAuditSurface = (next?: boolean) => {
    const target = typeof next === 'boolean' ? next : !auditGraphOpen;
    if (target !== auditGraphOpen) runViewTransition(() => setAuditGraphOpen(target));
  };
  const auditOcclusion = useSceneOcclusion(viewportRef, inspectorRef, auditMode && Boolean(selected));
  const auditInspectorPad = selected
    ? (auditOcclusion.right > 0 ? `${Math.round(auditOcclusion.right + 8)}px` : '400px')
    : undefined;
  const openAuditArgument = (node: BoardNode, parentIssueId?: string) => {
    if (isAuditIssue(node)) {
      navigateWorkspace({ issueId: node.id, candidateId: null, node: null });
    } else if (parentIssueId !== undefined) {
      navigateWorkspace({ issueId: parentIssueId, candidateId: node.id, node: null });
    } else {
      navigateWorkspace({ candidateId: node.id, node: null });
    }
    clearSelection();
    if (window.innerWidth < 1024) closeSidebar();
    pendingFocus.current = node.id;
  };
  const chooseIssue = (id: string | null) => {
    if (id === null) setAuditGraphOpen(false);
    navigateWorkspace({ issueId: id, candidateId: null, node: null });
    clearSelection();
    pendingFocus.current = id;
  };
  const chooseCandidate = (id: string | null) => {
    const target = id ?? issueId;
    navigateWorkspace({ candidateId: id, node: null });
    clearSelection();
    pendingFocus.current = target;
  };
  const auditCandidateList = audit ? (audit.issue ? audit.members : audit.candidates) : [];
  const auditCandidateIdx = audit?.candidate ? auditCandidateList.findIndex((item) => item.id === audit.candidate?.id) : -1;
  const stepAuditCandidate = (delta: 1 | -1) => {
    if (!auditCandidateList.length) return;
    if (auditCandidateIdx < 0) {
      const target = delta > 0 ? auditCandidateList[0] : auditCandidateList[auditCandidateList.length - 1];
      if (target) chooseCandidate(target.id);
      return;
    }
    const next = auditCandidateList[auditCandidateIdx + delta];
    if (next) chooseCandidate(next.id);
  };

  useWorkspaceShortcuts(clearSelection, setPaletteOpen, setShortcutsOpen, setSidebarOpen, {
    enabled: Boolean(snapshot) && !scene3d && (!auditMode || showAuditGraph),
    onFit: fitCanvas,
    onLocate: !auditMode && currentId ? () => focusNode(currentId) : undefined,
    onNeighborhood: (!auditMode || showAuditGraph) ? triggerNeighborhood : undefined,
    onToggleMap: () => setShowMap((open) => !open),
    auditEnabled: Boolean(snapshot && audit && auditMode),
    onNextCandidate: () => stepAuditCandidate(1),
    onPrevCandidate: () => stepAuditCandidate(-1),
    onToggleAuditSurface: canShowAuditGraph ? () => switchAuditSurface() : undefined,
    onToggleSettings: () => setSettingsOpen((open) => !open),
  });

  // A single authored issue should open immediately so the dossier is not an empty shell.
  useEffect(() => {
    if (!auditMode || !audit || issueId || candidateId || audit.issues.length !== 1) return;
    const sole = audit.issues[0];
    navigateWorkspace({ issueId: sole.id, candidateId: null, node: selectedId ?? deepLink.current });
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
        showEmptyActivity={showEmptyActivity}
        timelineOpen={timelineOpen}
        onTimeline={isStatic ? undefined : () => {
          if (timelineOpen) { timeline.pause(); setAsOf(null); }
          setTimelineOpen(!timelineOpen);
        }}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <button className="absolute inset-0 z-20 bg-black/20 lg:hidden" aria-label={t('app.closeNav')} onClick={() => setSidebarOpen(false)} />
            <aside className="anim-sidebar-in z-30 w-64 shrink-0 border-r bg-background max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-float">
              {audit ? (
                <AuditCatalog
                  audit={audit}
                  selectedId={selectedId}
                  onSelect={focusNode}
                  onIssue={chooseIssue}
                  onCandidate={chooseCandidate}
                  onCandidateIssue={(id) => navigateWorkspace({ issueId: id })}
                  onOpenArgument={openAuditArgument}
                  onExpand={expandAudit}
                  onSearch={() => { setPaletteOpen(true); closeSidebar(); }}
                  filter={filter}
                  onFilter={setFilter}
                  filterOptions={filterOptions}
                  results={results}
                  counts={counts}
                  onShortcuts={() => setShortcutsOpen(true)}
                  provenanceMode={auditProvenanceMode}
                  changes={activeChanges}
                  fresh={fresh}
                />
              ) :
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

        <main ref={viewportRef} className="relative flex min-w-0 flex-1 flex-col" aria-label={showAuditGraph ? t('audit.showGraph') : auditMode ? t('audit.dossier') : t('app.canvas')}>
          <div className="relative flex min-h-0 flex-1 flex-col">
          {audit && !showAuditGraph && (
            <div className="min-h-0 flex-1">
              <AuditDossier
                audit={audit}
                selected={selected}
                graphOpen={auditGraphOpen}
                inspectorPadding={auditInspectorPad}
                provenanceMode={auditProvenanceMode}
                changes={activeChanges}
                fresh={fresh}
                onToggleGraph={switchAuditSurface}
                onSelect={focusNode}
                onClearSelection={clearSelection}
                onIssue={chooseIssue}
                onCandidate={chooseCandidate}
                onOpenArgument={openAuditArgument}
                onExpand={expandAudit}
              />
            </div>
          )}
          {audit && showAuditGraph && (
            <AuditBlueprintBar
              audit={audit}
              graphOpen={auditGraphOpen}
              inspectorPadding={auditInspectorPad}
              onToggleGraph={switchAuditSurface}
              onIssue={chooseIssue}
              onCandidate={chooseCandidate}
            />
          )}
          {(!auditMode || showAuditGraph) && (
          <div ref={flatRef} data-layout-transition={layoutTransition ? 'true' : undefined} className={cn('relative min-h-0', auditMode ? 'flex-1' : 'absolute inset-0')} inert={scene3d} aria-hidden={scene3d}>
          <ExportingContext.Provider value={exporting}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={(event, node) => {
              onNodeClick(event, node);
              const detail = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-audit-detail]')?.dataset.auditDetail : undefined;
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
              if (viewport.zoom !== lastZoomRef.current) {
                lastZoomRef.current = viewport.zoom;
                viewportRef.current?.style.setProperty('--zoom', String(viewport.zoom));
                const nextFar = viewport.zoom < 0.85;
                setFarZoom((prev) => (prev === nextFar ? prev : nextFar));
              }
            }}
            proOptions={{ hideAttribution: true }}
            onlyRenderVisibleElements={!exporting}
          >
            <Background id="minor" variant={BackgroundVariant.Dots} gap={20} size={1.05} />
            <Background id="major" variant={BackgroundVariant.Dots} gap={100} size={1.75} color="var(--line-strong)" />
            <CanvasToolbar
              hasCurrent={!auditMode && Boolean(currentId)}
              canFollow={!isStatic && !auditMode}
              canExport={Boolean(projection?.nodes.length) && nodes.length > 0 && !exporting}
              onExport={exportImage}
              grouped={canvasMode === 'all'}
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
              showZoomSlider={showZoomSlider}
              onSettings={() => setSettingsOpen(true)}
              onScene3d={auditMode ? undefined : openScene}
            />
            {showMap && (
              <MiniMap<CanvasNode>
                position="bottom-left"
                className="mb-16! max-sm:mb-26!"
                pannable
                zoomable
                nodeBorderRadius={4}
                nodeStrokeWidth={3}
                nodeColor={(node) => miniMapNodeColor(node.data)}
                nodeStrokeColor={(node) => {
                  if (node.data.group) return 'var(--line-strong)';
                  if (node.id === selectedId) return 'var(--ink)';
                  if (node.data.current) return 'var(--live)';
                  return 'transparent';
                }}
              />
            )}
          </ReactFlow>
          </ExportingContext.Provider>
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

          {(!auditMode || showAuditGraph) && showLegend && nodes.length > 0 && <Legend types={legend.types} groups={legend.groups} onClose={() => setShowLegend(false)} />}

          {!auditMode && projection && projection.nodes.length === 0 && (
            <EmptyBoard viewEmpty={allNodes.length > 0} isStatic={isStatic} onShowAll={() => switchMode('all')} />
          )}

          <WorkspaceBanners
            offlineShown={offlineShown}
            syncedAt={syncedAt}
            timelineActive={timeline.active}
            timelinePoint={timeline.point}
            asOf={asOf}
            onBackToNow={() => { timeline.pause(); setAsOf(null); }}
            isStatic={isStatic}
            pastPoint={pastPoint}
            hidden={hidden}
            onShowAll={() => switchMode('all')}
            laying={laying}
            notice={notice}
            offsetTop={auditMode}
          />

          <p className="sr-only" role="status" aria-live="polite">{selected ? t('app.selected', { type: typeLabelOf(selected.type), title: selected.title }) : ''}</p>

          <CanvasPeekCard
            node={activeHoverId && activeHoverId !== selectedId ? byId.get(activeHoverId) ?? null : null}
            degree={activeHoverId ? (nodes.find((node) => node.id === activeHoverId)?.data.degree ?? 0) : 0}
            visible={showPeekHud && !scene3d && (!auditMode || showAuditGraph) && farZoom && Boolean(activeHoverId && activeHoverId !== selectedId)}
            inspectorOpen={Boolean(selected)}
            inspectorOffset={auditMode ? auditOcclusion.right : occlusion.right}
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
        onExport={(!auditMode || showAuditGraph) && projection?.nodes.length && nodes.length > 0 && !exporting ? exportImage : null}
        onShortcuts={() => setShortcutsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        embedded={presentation.embedded}
        theme={theme}
        onTheme={changeThemeTo}
        cardTheme={cardTheme}
        onCardTheme={changeCardTheme}
        edgeStyle={edgeStyle}
        onEdgeStyle={setEdgeStyle}
        showCardLoc={showCardLoc}
        onShowCardLoc={setShowCardLoc}
        showPeekHud={showPeekHud}
        onShowPeekHud={setShowPeekHud}
        showZoomSlider={showZoomSlider}
        onShowZoomSlider={setShowZoomSlider}
        auditProvenanceMode={auditProvenanceMode}
        onAuditProvenanceMode={setAuditProvenanceMode}
        showEmptyActivity={showEmptyActivity}
        onShowEmptyActivity={setShowEmptyActivity}
        motionMode={motionMode}
        onMotionMode={setMotionMode}
        onReset={resetPreferences}
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
