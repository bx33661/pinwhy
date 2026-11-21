import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  GitCommitVertical,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/icon-button';
import { RelationBadge } from '@/components/relation-badge';
import { cn } from '@/lib/utils';
import { TypeDot } from '../../../SecurityNode';
import { SeverityBadge } from '../../../SeverityBadge';
import { relationTone } from '../../../graph';
import { nodeAccent, presentNode, typeLabel } from '../../../presentation';
import { t } from '../../../i18n';
import type { BoardEdge, BoardNode } from '../../../types';
import {
  AUDIT_BATCH,
  edgeActor,
  edgePeer,
  isAuditCandidate,
  isAuditIssue,
  recordActor,
  sharedAuditReferences,
  type ArgumentRole,
  type AuditExpansionAction,
  type AuditLocalContext,
  type AuditPage,
  type AuditProvenance,
  type AuditSelection,
} from '../../audit';
import { AuditLandingMatrix, IssueCandidateMatrixSection } from './AuditMatrix';
import {
  ActorProvenanceBadge,
  AuditPageControls,
  AuditSurfaceSwitch,
  ChangeDeltaBadge,
  ConfidencePill,
  formatActorName,
  isRetiredNode,
  LocationChip,
  OrthogonalReadout,
  PostureBadge,
  renderInlineCode,
  ROLE_TONE,
  StatusPill,
  type CssVars,
} from './shared';
import type { AuditProvenanceMode } from '../../use-workspace-chrome';
import type { NodeChange } from '../../use-workspace-presentation';

type Props = {
  audit: AuditSelection;
  selected: BoardNode | null;
  graphOpen: boolean;
  inspectorPadding?: string;
  provenanceMode?: AuditProvenanceMode;
  changes?: ReadonlyMap<string, NodeChange> | null;
  fresh?: ReadonlySet<string>;
  onToggleGraph: (next?: boolean) => void;
  onSelect: (id: string) => void;
  onClearSelection?: () => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
  onOpenArgument: (node: BoardNode, parentIssueId?: string) => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};

const LOCAL_ROLES: readonly ArgumentRole[] = ['contradiction', 'condition', 'support', 'related'];

function ClaimSpecimen({
  node,
  selected,
  provenance,
  showProvenance = true,
  multiActor = false,
  actors = [],
  spotlightActor = null,
  change,
  isFresh,
  onSpotlightActor,
  onSelect,
  onClearSelection,
}: {
  node: BoardNode;
  selected: boolean;
  provenance?: AuditProvenance;
  showProvenance?: boolean;
  multiActor?: boolean;
  actors?: string[];
  spotlightActor?: string | null;
  change?: NodeChange;
  isFresh?: boolean;
  onSpotlightActor?: (actor: string | null) => void;
  onSelect: (id: string) => void;
  onClearSelection?: () => void;
}) {
  const { headline, summary, detail } = presentNode(node);
  const retired = isRetiredNode(node);
  const proposer = recordActor(node);
  const showSpotlightBar = showProvenance && Boolean(onSpotlightActor) && multiActor && actors.length > 1;

  const toggleInspect = () => {
    if (selected && onClearSelection) onClearSelection();
    else onSelect(node.id);
  };

  return (
    <div
      style={{ '--c': nodeAccent(node.type) } as CssVars}
      className={cn(
        'relative rounded-xl border bg-card p-4 transition-all',
        selected ? 'border-foreground/35 shadow-sm' : 'shadow-xs',
        isFresh && 'fresh-pulse',
      )}
    >
      <i aria-hidden="true" className={cn('absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-(--c)', retired && 'opacity-45')} />
      <div className="flex flex-col gap-3.5 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="min-w-0 flex-1 pl-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <TypeDot type={node.type} className="size-1.5" />
              {typeLabel(node.type)}
            </span>
            <span className="rounded border bg-secondary/70 px-1.5 py-0 font-mono text-[10.5px]">{node.id}</span>
            <ChangeDeltaBadge change={change} compact />
            {retired && <StatusPill status={node.status} compact />}
            <PostureBadge provenance={provenance} multiActor={multiActor} show={showProvenance} />
            {showProvenance && multiActor && proposer && !showSpotlightBar && (
              <span className="rounded border bg-secondary/50 px-1.5 py-0 font-mono text-[10px]">
                {formatActorName(proposer)}
              </span>
            )}
          </div>

          <h3 className={cn(
            'm-0 mt-1.5 text-base font-semibold leading-6 tracking-[-0.01em]',
            retired ? 'text-foreground/80' : 'text-foreground',
          )}>
            {headline}
          </h3>

          {summary && (
            <p className="m-0 mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-subtle [overflow-wrap:anywhere]">
              {renderInlineCode(summary)}
            </p>
          )}
          {detail && (
            <p className="m-0 mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              {renderInlineCode(detail)}
            </p>
          )}

          <LocationChip node={node} />
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2 @2xl:flex-col @2xl:items-end">
          <OrthogonalReadout node={node} />
          <Button
            type="button"
            size="sm"
            variant={selected ? 'outline' : 'ghost'}
            aria-pressed={selected}
            onClick={toggleInspect}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {selected ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
            {t('audit.inspectRoot')}
          </Button>
        </div>
      </div>

      {showSpotlightBar && onSpotlightActor && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5 pl-1.5 text-[11px]">
          <span className="font-medium text-muted-foreground">{t('audit.spotlightLabel')}：</span>
          <button
            type="button"
            aria-pressed={spotlightActor === null}
            onClick={() => onSpotlightActor(null)}
            className={cn(
              'rounded-md border px-2 py-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              spotlightActor === null
                ? 'border-foreground bg-secondary font-semibold text-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t('audit.spotlightAll', { n: actors.length })}
          </button>
          {actors.map((actor) => {
            const active = spotlightActor === actor;
            const isProposer = actor === proposer;
            return (
              <button
                key={actor}
                type="button"
                aria-pressed={active}
                onClick={() => onSpotlightActor(active ? null : actor)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-foreground bg-secondary font-semibold text-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-mono">{formatActorName(actor)}</span>
                {isProposer && <span className="text-[10px] opacity-75">({t('audit.proposerTag')})</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Security-specialized reading surface: claim specimen + adaptive dialectical balance, blueprint one click away. */
export function AuditDossier({
  audit,
  selected,
  graphOpen,
  inspectorPadding,
  provenanceMode = 'auto',
  changes = null,
  fresh,
  onToggleGraph,
  onSelect,
  onClearSelection,
  onIssue,
  onCandidate,
  onOpenArgument,
  onExpand,
}: Props) {
  const byId = audit.index.byId;
  const local = selected && audit.root && selected.id !== audit.root.id ? audit.contexts.get(selected.id) : null;
  const [spotlightActor, setSpotlightActor] = useState<string | null>(null);
  const [openedEmptyGroups, setOpenedEmptyGroups] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleToggleGraph = (next?: boolean) => onToggleGraph(typeof next === 'boolean' ? next : !graphOpen);

  useEffect(() => {
    setSpotlightActor(null);
    setOpenedEmptyGroups({});
    scrollRef.current?.scrollTo({ top: 0 });
  }, [audit.root?.id, provenanceMode]);

  // Open authored local rebuttals/conditions inline when a reader inspects an evidence or condition record.
  useEffect(() => {
    if (!local) return;
    for (const role of ['contradiction', 'condition'] as const) {
      if (local.groups[role].length > 0 && !local.pages[role].open) onExpand(local.pages[role].key, 'more', 0);
    }
  }, [local?.node.id]);

  // General boards often only author related-to. Keep that group readable instead of an empty dossier.
  useEffect(() => {
    if (!audit.root) return;
    const structural = audit.pages.support.total + audit.pages.contradiction.total + audit.pages.condition.total;
    if (structural === 0 && audit.pages.related.total > 0 && !audit.pages.related.open) onExpand('related', 'more', 0);
  }, [audit.root?.id, audit.pages.support.total, audit.pages.contradiction.total, audit.pages.condition.total, audit.pages.related.total, audit.pages.related.open]);

  if (!audit.records.length) {
    return (
      <section aria-label={t('audit.dossier')} className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="m-0 text-sm font-medium text-foreground">{t('audit.empty')}</p>
        <p className="m-0 max-w-md text-xs leading-5 text-muted-foreground">{t('audit.emptyHint')}</p>
      </section>
    );
  }

  if (!audit.root) {
    return (
      <AuditLandingMatrix
        audit={audit}
        selectedId={selected?.id ?? null}
        graphOpen={graphOpen}
        inspectorPadding={inspectorPadding}
        provenanceMode={provenanceMode}
        changes={changes}
        fresh={fresh}
        onToggleGraph={handleToggleGraph}
        onSelect={onSelect}
        onIssue={onIssue}
        onCandidate={onCandidate}
        onOpenArgument={onOpenArgument}
        onExpand={onExpand}
      />
    );
  }

  const root = audit.root;
  const showProvenance = provenanceMode !== 'off';
  const multiActor = provenanceMode === 'off' ? false : provenanceMode === 'always' ? true : audit.index.multiActor;
  const rootProposer = recordActor(root);
  const rootProvenance = audit.index.provenance.get(root.id);
  const dossierActorSet = new Set<string>();
  if (rootProposer) dossierActorSet.add(rootProposer);
  const renderedLocalIds = new Set<string>();
  const renderedPremiseIds = new Set<string>();
  const actorSpotlightClass = (actor: string | null) => {
    if (!spotlightActor) return undefined;
    return actor === spotlightActor ? 'ring-1 ring-foreground/45' : 'opacity-40';
  };

  // Map visible 2nd-hop premises directly to the direct support record they back.
  const premisesBySupport = new Map<string, BoardEdge[]>();
  for (const edge of audit.premises.items) {
    const owner = audit.premiseOwners.get(edge.id);
    if (!owner) continue;
    const list = premisesBySupport.get(owner) ?? [];
    list.push(edge);
    premisesBySupport.set(owner, list);
  }

  const renderCompactLocalCard = (edge: BoardEdge, ownerId: string, role: ArgumentRole) => {
    const peerId = edgePeer(edge, ownerId);
    const peer = byId.get(peerId);
    const peerText = peer ? presentNode(peer) : null;
    const isSelected = selected?.id === peerId;
    const actor = edgeActor(edge, byId, ownerId);
    if (actor) dossierActorSet.add(actor);
    return (
      <article
        key={edge.id}
        className={cn(
          'rounded-lg border px-3 py-2.5 text-xs leading-5 transition-all',
          isSelected ? 'border-foreground/40 bg-accent/55 shadow-2xs' : 'bg-card hover:border-strong',
          actorSpotlightClass(actor),
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <RelationBadge kind={edge.kind} />
          {peer && <span className="text-muted-foreground">{typeLabel(peer.type)}</span>}
          {peer?.confidence && <ConfidencePill confidence={peer.confidence} compact />}
          <span className="ml-auto inline-flex items-center gap-1.5">
            <ActorProvenanceBadge actor={actor} rootProposer={rootProposer} role={role} multiActor={multiActor} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{peerId}</span>
          </span>
        </div>
        <button
          type="button"
          aria-label={`${peer?.title || peerId} · ${peerId}`}
          onClick={() => onSelect(peerId)}
          className="mt-1.5 block w-full rounded text-left text-[12.5px] font-medium leading-5 text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {peerText ? peerText.headline : peerId}
        </button>
        {peerText?.summary && (
          <p className="m-0 mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {renderInlineCode(peerText.summary)}
          </p>
        )}
        {edge.label && (
          <p className="m-0 mt-1.5 border-l-2 border-strong pl-2.5 text-xs leading-4 text-subtle">
            {renderInlineCode(edge.label)}
          </p>
        )}
        {peer && <LocationChip node={peer} />}
      </article>
    );
  };

  const renderInlineLocalBranch = (context: AuditLocalContext, allowExtraRoles = false) => {
    const owner = context.node;
    const nonRootEdges = (edges: BoardEdge[]) => edges.filter((edge) => edgePeer(edge, owner.id) !== root.id);
    const activeRoles = LOCAL_ROLES.filter((role) => (
      role === 'contradiction' || role === 'condition'
        ? context.groups[role].length > 0
        : allowExtraRoles && nonRootEdges(context.groups[role]).length > 0
    ));
    if (!activeRoles.length) return null;
    renderedLocalIds.add(owner.id);

    return (
      <section
        aria-label={`${t('audit.localDetails')}: ${owner.id}`}
        className="mt-2.5 space-y-2 rounded-lg border border-dashed bg-secondary/20 p-2.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {activeRoles.map((role) => {
            const page = context.pages[role];
            const roleName = role === 'contradiction'
              ? t('audit.hasContradictions')
              : role === 'condition'
                ? t('audit.hasConditions')
                : t(`audit.${role}`);
            const fullLabel = `${owner.title || owner.id} · ${roleName}`;
            const isWarning = role === 'contradiction';
            return (
              <button
                key={page.key}
                type="button"
                aria-label={`${fullLabel} · ${page.total}`}
                aria-expanded={page.open}
                onClick={() => onExpand(page.key, 'toggle', 0)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  isWarning
                    ? 'border-[color-mix(in_srgb,var(--rel-oppose)_45%,var(--line))] bg-[color-mix(in_srgb,var(--rel-oppose)_9%,var(--surface))] text-[color-mix(in_srgb,var(--rel-oppose)_88%,var(--ink))]'
                    : 'border-border bg-card text-foreground hover:border-strong',
                )}
              >
                {isWarning && <ShieldAlert aria-hidden="true" className="size-3 shrink-0" />}
                <span>{roleName}</span>
                <span className="font-mono tabular-nums">{page.total}</span>
                <ChevronRight aria-hidden="true" className={cn('size-3 transition-transform', page.open && 'rotate-90')} />
              </button>
            );
          })}
        </div>

        {activeRoles.some((role) => context.pages[role].open) && (
          <div className="anim-disclosure-in space-y-2 pt-0.5">
            <p className="m-0 text-[11px] leading-4 text-muted-foreground">{t('audit.localScopeHint')}</p>
            {activeRoles.map((role) => {
              const page = context.pages[role];
              if (!page.open) return null;
              const roleName = role === 'contradiction'
                ? t('audit.hasContradictions')
                : role === 'condition'
                  ? t('audit.hasConditions')
                  : t(`audit.${role}`);
              const fullLabel = `${owner.title || owner.id} · ${roleName}`;
              return (
                <div key={page.key} className="space-y-1.5">
                  <AuditPageControls page={page} label={fullLabel} defaultLimit={0} onExpand={onExpand} />
                  {page.items.map((edge) => renderCompactLocalCard(edge, owner.id, role))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderTetheredPremises = (supportNodeId: string) => {
    const attached = premisesBySupport.get(supportNodeId);
    if (!attached?.length) return null;
    for (const edge of attached) renderedPremiseIds.add(edge.id);

    return (
      <div className="mt-2.5 ml-1 space-y-1.5 border-l-2 border-(--rel-support)/55 pl-3">
        {attached.map((edge) => {
          const premiseId = edgePeer(edge, supportNodeId);
          const premise = byId.get(premiseId);
          const premiseText = premise ? presentNode(premise) : null;
          const premiseActor = edgeActor(edge, byId, supportNodeId);
          if (premiseActor) dossierActorSet.add(premiseActor);
          const premiseLocal = !renderedLocalIds.has(premiseId) ? audit.contexts.get(premiseId) : undefined;
          return (
            <div key={edge.id} className={cn('rounded-lg border bg-secondary/20 px-2.5 py-2 text-xs transition-all', actorSpotlightClass(premiseActor))}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <GitCommitVertical aria-hidden="true" className="size-3 text-(--rel-support)" />
                <span className="font-medium text-(--rel-support)">{t('audit.tetheredPremise')}</span>
                <RelationBadge kind={edge.kind} />
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <ActorProvenanceBadge actor={premiseActor} rootProposer={rootProposer} role="premise" multiActor={multiActor} />
                  <span className="font-mono text-[10.5px]">{premiseId}</span>
                </span>
              </div>
              <button
                type="button"
                aria-label={`${premise?.title || premiseId} · ${premiseId}`}
                onClick={() => onSelect(premiseId)}
                className="mt-1 block w-full rounded text-left font-medium text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {premiseText ? premiseText.headline : premiseId}
              </button>
              {premiseText?.summary && (
                <p className="m-0 mt-0.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  {renderInlineCode(premiseText.summary)}
                </p>
              )}
              {edge.label && (
                <p className="m-0 mt-1 border-l-2 border-(--rel-support)/45 pl-2 text-xs leading-4 text-subtle">
                  {renderInlineCode(edge.label)}
                </p>
              )}
              {premise && <LocationChip node={premise} />}
              {premiseLocal && renderInlineLocalBranch(premiseLocal, selected?.id === premiseId)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRelationCard = (edge: BoardEdge, ownerId: string, role: ArgumentRole | 'premise') => {
    const otherId = edgePeer(edge, ownerId);
    const other = byId.get(otherId);
    const otherText = other ? presentNode(other) : null;
    const selectedHere = selected?.id === otherId;
    const relTone = relationTone(edge.kind) || ROLE_TONE[role];
    const isCounter = role === 'contradiction';
    const cardActor = edgeActor(edge, byId, ownerId);
    if (role !== 'related' && cardActor) dossierActorSet.add(cardActor);
    const localContext = role !== 'related' && !renderedLocalIds.has(otherId) ? audit.contexts.get(otherId) : undefined;
    const shared = role !== 'related' ? sharedAuditReferences(audit.index, otherId, root.id, 2) : { items: [], remaining: 0 };

    return (
      <article
        key={edge.id}
        style={{ '--r': relTone } as CssVars}
        className={cn(
          'relative rounded-xl border p-3.5 text-xs leading-5 transition-all',
          isCounter && 'border-dashed',
          selectedHere ? 'border-foreground/40 bg-accent/40 shadow-xs' : 'bg-card shadow-2xs hover:border-strong',
          actorSpotlightClass(cardActor),
          fresh?.has(otherId) && 'fresh-pulse',
        )}
      >
        <i aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[2.5px] rounded-r-full bg-(--r)" />
        <div className="pl-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <RelationBadge kind={edge.kind} />
            {other && <span className="text-muted-foreground">{typeLabel(other.type)}</span>}
            {other?.status && <StatusPill status={other.status} compact />}
            {other?.confidence && <ConfidencePill confidence={other.confidence} compact />}
            {other?.severity && <SeverityBadge severity={other.severity} className="px-1.5 text-[10px]" />}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <ChangeDeltaBadge change={changes?.get(otherId)} compact />
              {showProvenance && role !== 'related' && (
                <ActorProvenanceBadge actor={cardActor} rootProposer={rootProposer} role={role} multiActor={multiActor} />
              )}
              <span className="font-mono text-[10.5px] text-muted-foreground">{otherId}</span>
            </span>
          </div>

          <button
            type="button"
            aria-label={`${other?.title || otherId} · ${otherId}`}
            onClick={() => onSelect(otherId)}
            className={cn(
              'mt-1.5 block w-full rounded text-left text-[13.5px] font-semibold leading-5 text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring',
              other && isRetiredNode(other) && 'text-muted-foreground',
            )}
          >
            {otherText ? otherText.headline : otherId}
          </button>

          {otherText?.summary && (
            <p className="m-0 mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              {renderInlineCode(otherText.summary)}
            </p>
          )}

          {edge.label && (
            <p className="m-0 mt-2 border-l-2 border-(--r)/60 pl-2.5 py-0.5 text-xs leading-4 text-subtle">
              {renderInlineCode(edge.label)}
            </p>
          )}

          {other && <LocationChip node={other} />}

          {(shared.items.length > 0 || (other && (isAuditCandidate(other) || isAuditIssue(other)))) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {shared.items.map((peer) => (
                <button
                  key={peer.id}
                  type="button"
                  onClick={() => onOpenArgument(peer)}
                  className="inline-flex items-center gap-1 rounded-md border bg-secondary/45 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-strong hover:text-foreground"
                  title={`${t('audit.sharedWith')}: ${peer.title || peer.id}`}
                >
                  <ArrowLeftRight aria-hidden="true" className="size-2.5 shrink-0" />
                  <span>{t('audit.sharedWith')}</span>
                  <span className="font-mono text-foreground">{peer.id}</span>
                </button>
              ))}
              {shared.remaining > 0 && (
                <span className="rounded bg-secondary/45 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  +{shared.remaining}
                </span>
              )}
              {other && (isAuditCandidate(other) || isAuditIssue(other)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 max-w-full px-2 text-left text-[11px]"
                  onClick={() => onOpenArgument(other)}
                >
                  {t('audit.openArgument')}: {other.id}
                </Button>
              )}
            </div>
          )}

          {role === 'support' && renderTetheredPremises(otherId)}
          {localContext && renderInlineLocalBranch(localContext, selectedHere)}
        </div>
      </article>
    );
  };

  const renderWingSection = (
    page: AuditPage<BoardEdge>,
    label: string,
    role: ArgumentRole | 'premise',
    emptyText?: string,
    defaultLimit = AUDIT_BATCH,
    itemsOverride?: BoardEdge[],
  ) => {
    const items = itemsOverride ?? page.items;
    const isEmpty = page.total === 0;
    const isExpanded = isEmpty ? Boolean(openedEmptyGroups[page.key]) : page.open;

    return (
      <section
        key={page.key}
        aria-label={label}
        className={cn(
          'overflow-hidden rounded-xl border transition-colors',
          isEmpty ? 'border-dashed border-border/80 bg-secondary/20' : 'bg-card/65 shadow-2xs',
        )}
      >
        <button
          type="button"
          aria-label={`${label} · ${page.total}`}
          aria-expanded={isExpanded}
          onClick={() => {
            if (isEmpty) setOpenedEmptyGroups((prev) => ({ ...prev, [page.key]: !prev[page.key] }));
            else onExpand(page.key, 'toggle', defaultLimit);
          }}
          className={cn(
            'flex w-full items-center gap-2 px-3.5 text-left text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            isEmpty
              ? 'py-2 text-muted-foreground hover:bg-secondary/45 hover:text-foreground'
              : 'bg-secondary/35 py-2.5 text-foreground hover:bg-secondary/55',
          )}
        >
          <i
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', isEmpty && 'opacity-55')}
            style={{ background: ROLE_TONE[role] }}
          />
          <span className="flex-1">{label}</span>
          <span className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[11px] font-normal tabular-nums',
            isEmpty ? 'text-muted-foreground/75' : 'bg-card text-muted-foreground',
          )}>
            {page.total}
          </span>
          <ChevronRight aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
        </button>

        {isExpanded && (
          <div className="anim-disclosure-in space-y-2.5 border-t border-border/60 p-3">
            <AuditPageControls page={page} label={label} defaultLimit={defaultLimit} onExpand={onExpand} />
            {items.length > 0 ? (
              <div className={cn('space-y-2.5', role === 'related' && 'grid gap-2.5 space-y-0 @2xl:grid-cols-2')}>
                {items.map((edge) => renderRelationCard(edge, root.id, role))}
              </div>
            ) : (
              emptyText && <p className="m-0 py-0.5 text-xs text-muted-foreground">{emptyText}</p>
            )}
          </div>
        )}
      </section>
    );
  };

  const memberIndex = audit.candidate ? audit.members.findIndex((item) => item.id === audit.candidate?.id) : -1;
  const prevCandidate = memberIndex > 0 ? audit.members[memberIndex - 1] : null;
  const nextCandidate = memberIndex >= 0 && memberIndex < audit.members.length - 1 ? audit.members[memberIndex + 1] : null;

  // Render Left Wing first so `renderedPremiseIds` and `renderedLocalIds` populate deterministically.
  const supportWing = renderWingSection(audit.pages.support, t('audit.support'), 'support', t('audit.noDirectSupport'));
  const unattachedPremises = audit.premises.items.filter((edge) => !renderedPremiseIds.has(edge.id));
  const showPremiseOverflow = audit.premises.total > 0 && (!audit.premises.open || audit.premises.hidden > 0 || unattachedPremises.length > 0);
  const premiseSection = showPremiseOverflow
    ? renderWingSection(audit.premises, t('audit.premise'), 'premise', undefined, AUDIT_BATCH, unattachedPremises)
    : null;

  const counterWing = renderWingSection(audit.pages.contradiction, t('audit.contradiction'), 'contradiction', t('audit.noDirectCounter'));
  const conditionWing = renderWingSection(audit.pages.condition, t('audit.condition'), 'condition', t('audit.noDirectCondition'));
  const relatedDrawer = audit.pages.related.total > 0
    ? renderWingSection(audit.pages.related, t('audit.related'), 'related', undefined, 0)
    : null;

  const fallbackLocal = local && !renderedLocalIds.has(local.node.id) ? local : null;
  const fallbackLocalBranch = fallbackLocal ? renderInlineLocalBranch(fallbackLocal, true) : null;

  const leftHasRecords = audit.pages.support.total > 0 || Boolean(premiseSection);
  const rightHasRecords = audit.pages.contradiction.total > 0 || audit.pages.condition.total > 0;

  return (
    <section
      aria-label={t('audit.dossier')}
      style={inspectorPadding ? ({ '--audit-pad': inspectorPadding } as CssVars) : undefined}
      className={cn('flex h-full min-h-0 flex-col overflow-hidden', inspectorPadding && 'lg:pr-(--audit-pad)')}
    >
      <header className="shrink-0 border-b bg-card px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => onIssue(null)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              {t('audit.allIssues')}
            </button>
            {audit.issue && (
              <>
                <span className="text-muted-foreground">/</span>
                {audit.candidate ? (
                  <button
                    type="button"
                    onClick={() => onCandidate(null)}
                    className="max-w-72 truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
                    title={audit.issue.title}
                  >
                    {presentNode(audit.issue).headline}
                  </button>
                ) : (
                  <span className="truncate font-semibold text-foreground">{audit.issue.id}</span>
                )}
              </>
            )}
            {audit.candidate && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="font-mono font-semibold text-foreground">{audit.candidate.id}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden text-[11px] text-muted-foreground @4xl:inline">{t('audit.authoredOnly')}</span>
            {memberIndex >= 0 && audit.members.length > 1 && (
              <div className="inline-flex items-center gap-0.5 rounded-md border bg-secondary/40 px-1 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                <IconButton
                  label={t('audit.prevCandidate')}
                  disabled={!prevCandidate}
                  onClick={() => prevCandidate && onCandidate(prevCandidate.id)}
                  className="size-6"
                >
                  <ChevronLeft className="size-3.5" />
                </IconButton>
                <span className="px-1 font-mono">{memberIndex + 1}/{audit.members.length}</span>
                <IconButton
                  label={t('audit.nextCandidate')}
                  disabled={!nextCandidate}
                  onClick={() => nextCandidate && onCandidate(nextCandidate.id)}
                  className="size-6"
                >
                  <ChevronRight className="size-3.5" />
                </IconButton>
              </div>
            )}
            <AuditSurfaceSwitch graphOpen={graphOpen} onToggleGraph={handleToggleGraph} />
          </div>
        </div>

        {audit.outsideIssue && <p role="status" className="m-0 mt-1.5 text-xs font-medium text-foreground">{t('audit.outsideIssue')}</p>}
        {(audit.missingIssue || audit.missingCandidate) && <p role="status" className="m-0 mt-1.5 text-xs text-muted-foreground">{t('audit.missingRoot')}</p>}
      </header>

      <div ref={scrollRef} className="@container min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <div key={root.id} className="anim-dossier-swap space-y-3.5">
        <ClaimSpecimen
          node={root}
          selected={selected?.id === root.id}
          provenance={rootProvenance}
          showProvenance={showProvenance}
          multiActor={multiActor}
          actors={[...dossierActorSet]}
          spotlightActor={spotlightActor}
          change={changes?.get(root.id)}
          isFresh={fresh?.has(root.id)}
          onSpotlightActor={setSpotlightActor}
          onSelect={onSelect}
          onClearSelection={onClearSelection}
        />

        {audit.issue && !audit.candidate && (
          <IssueCandidateMatrixSection
            page={audit.catalog.members}
            index={audit.index}
            selectedId={selected?.id ?? null}
            provenanceMode={provenanceMode}
            changes={changes}
            fresh={fresh}
            onOpenCandidate={onOpenArgument}
            onExpand={onExpand}
          />
        )}

        {/* Adaptive Dialectical Balance: symmetric 50/50 when both wings carry records; Asymmetric 8/4 when one side is empty */}
        <div className="grid grid-cols-1 items-start gap-3.5 @2xl:grid-cols-12">
          <div className={cn(
            'space-y-3',
            leftHasRecords && rightHasRecords
              ? '@2xl:col-span-6'
              : leftHasRecords
                ? '@2xl:col-span-8'
                : rightHasRecords
                  ? '@2xl:col-span-4'
                  : '@2xl:col-span-6',
          )}>
            {supportWing}
            {premiseSection}
          </div>
          <div className={cn(
            'space-y-3',
            leftHasRecords && rightHasRecords
              ? '@2xl:col-span-6'
              : rightHasRecords
                ? '@2xl:col-span-8'
                : leftHasRecords
                  ? '@2xl:col-span-4'
                  : '@2xl:col-span-6',
          )}>
            {counterWing}
            {conditionWing}
          </div>
        </div>

        {relatedDrawer}

        {fallbackLocal && (
          <div className="rounded-xl border bg-card p-3 shadow-2xs">
            <ClaimSpecimen
              node={fallbackLocal.node}
              selected={selected?.id === fallbackLocal.node.id}
              showProvenance={showProvenance}
              change={changes?.get(fallbackLocal.node.id)}
              isFresh={fresh?.has(fallbackLocal.node.id)}
              onSelect={onSelect}
              onClearSelection={onClearSelection}
            />
            {fallbackLocalBranch}
          </div>
        )}

        {selected && selected.id !== root.id && (isAuditCandidate(selected) || isAuditIssue(selected)) && (
          <div>
            <Button size="sm" variant="outline" onClick={() => onOpenArgument(selected)}>
              {t('audit.openArgument')}: {selected.title || selected.id}
            </Button>
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
