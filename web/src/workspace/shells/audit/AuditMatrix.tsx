import { useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TypeDot } from '../../../SecurityNode';
import { SeverityBadge } from '../../../SeverityBadge';
import { nodeAccent, presentNode, statusLabel, typeLabel } from '../../../presentation';
import { t } from '../../../i18n';
import { sourceLocation } from '../../../research-state';
import type { BoardNode } from '../../../types';
import {
  AUDIT_BATCH,
  isAuditCandidate,
  isAuditIssue,
  type AuditExpansionAction,
  type AuditIndex,
  type AuditPage,
  type AuditSelection,
} from '../../audit';
import {
  AuditPageControls,
  authoredScopeLabel,
  ChangeDeltaBadge,
  ConfidencePill,
  isRetiredNode,
  PostureBadge,
  StatusPill,
  type CssVars,
} from './shared';
import type { AuditProvenanceMode } from '../../use-workspace-chrome';
import type { NodeChange } from '../../use-workspace-presentation';

const ISSUE_PREVIEW_LIMIT = 6;

export type MatrixLens = 'reproduced' | 'static' | 'suspected' | 'dispute' | 'corroborated' | 'single' | 'retired';

function matchesMatrixLens(node: BoardNode, index: AuditIndex, lens: MatrixLens | null): boolean {
  if (!lens) return true;
  const prov = index.provenance.get(node.id);
  if (lens === 'reproduced') return node.confidence === 'reproduced';
  if (lens === 'static') return node.confidence === 'static-confirmed';
  if (lens === 'suspected') return node.confidence === 'suspected';
  if (lens === 'dispute') return Boolean(prov?.hasOpenDispute);
  if (lens === 'corroborated') return prov?.posture === 'corroborated';
  if (lens === 'single') return prov?.posture === 'single';
  if (lens === 'retired') return isRetiredNode(node);
  return true;
}

function candidateTallies(candidates: BoardNode[], index: AuditIndex) {
  let reproduced = 0;
  let staticConfirmed = 0;
  let suspected = 0;
  let dispute = 0;
  let corroborated = 0;
  let single = 0;
  let retired = 0;
  for (const node of candidates) {
    if (node.confidence === 'reproduced') reproduced++;
    else if (node.confidence === 'static-confirmed') staticConfirmed++;
    else if (node.confidence === 'suspected') suspected++;
    const prov = index.provenance.get(node.id);
    if (prov?.hasOpenDispute) dispute++;
    if (prov?.posture === 'corroborated') corroborated++;
    if (prov?.posture === 'single') single++;
    if (isRetiredNode(node)) retired++;
  }
  return { reproduced, staticConfirmed, suspected, dispute, corroborated, single, retired };
}

export function FactualTallyStrip({
  candidates,
  index,
  showProvenance = true,
  multiActor = index.multiActor,
  activeLens,
  onSelectLens,
}: {
  candidates: BoardNode[];
  index: AuditIndex;
  showProvenance?: boolean;
  multiActor?: boolean;
  activeLens?: MatrixLens | null;
  onSelectLens?: (next: MatrixLens | null) => void;
}) {
  if (!candidates.length) return null;
  const tally = candidateTallies(candidates, index);
  const pills: { key: MatrixLens; label: string; count: number; dot: string }[] = [
    { key: 'reproduced', label: t('audit.tallyReproduced'), count: tally.reproduced, dot: 'var(--live)' },
    { key: 'static', label: t('audit.tallyStatic'), count: tally.staticConfirmed, dot: 'var(--rel-derive)' },
    { key: 'suspected', label: t('audit.tallySuspected'), count: tally.suspected, dot: 'var(--ink-3)' },
    ...(showProvenance && tally.dispute > 0 ? [{ key: 'dispute' as const, label: t('audit.postureContested'), count: tally.dispute, dot: 'var(--rel-oppose)' }] : []),
    ...(showProvenance && multiActor && tally.corroborated > 0 ? [{ key: 'corroborated' as const, label: t('audit.postureCorroborated'), count: tally.corroborated, dot: 'var(--live)' }] : []),
    ...(showProvenance && multiActor && tally.single > 0 ? [{ key: 'single' as const, label: t('audit.postureSingle'), count: tally.single, dot: 'var(--ink-3)' }] : []),
    ...(tally.retired > 0 ? [{ key: 'retired' as const, label: t('audit.tallyRetired'), count: tally.retired, dot: 'var(--line-strong)' }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
      {pills.map((pill) => {
        const active = activeLens === pill.key;
        if (!onSelectLens) {
          return (
            <span key={pill.key} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary/45 px-2 py-0.5 text-muted-foreground">
              <i aria-hidden="true" className="size-1.5 rounded-full" style={{ background: pill.dot }} />
              <span>{pill.label}</span>
              <strong className="font-semibold text-foreground">{pill.count}</strong>
            </span>
          );
        }
        return (
          <button
            key={pill.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectLens(active ? null : pill.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-foreground bg-card font-medium text-foreground shadow-2xs'
                : 'bg-secondary/45 text-muted-foreground hover:border-strong hover:text-foreground',
            )}
          >
            <i aria-hidden="true" className="size-1.5 rounded-full" style={{ background: pill.dot }} />
            <span>{pill.label}</span>
            <strong className="font-semibold text-foreground">{pill.count}</strong>
          </button>
        );
      })}
      {activeLens && onSelectLens && (
        <button
          type="button"
          onClick={() => onSelectLens(null)}
          className="px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {t('audit.clearMatrixFilter')}
        </button>
      )}
    </div>
  );
}

export function MatrixCandidateRow({
  node,
  index,
  selected,
  showProvenance = true,
  multiActor = index.multiActor,
  change,
  isFresh,
  onOpen,
}: {
  node: BoardNode;
  index: AuditIndex;
  selected: boolean;
  showProvenance?: boolean;
  multiActor?: boolean;
  change?: NodeChange;
  isFresh?: boolean;
  onOpen: (node: BoardNode) => void;
}) {
  const { headline } = presentNode(node);
  const loc = sourceLocation(node);
  const retired = isRetiredNode(node);
  const args = index.arguments.get(node.id);
  const prov = index.provenance.get(node.id);
  const supports = args?.support.length ?? 0;
  const contradictions = args?.contradiction.length ?? 0;
  const conditions = args?.condition.length ?? 0;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onOpen(node)}
      style={{ '--c': nodeAccent(node.type) } as CssVars}
      className={cn(
        'group relative grid w-full grid-cols-1 items-center gap-2 px-3.5 py-2.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @xl:grid-cols-12',
        selected ? 'bg-accent' : 'hover:bg-accent/55',
        isFresh && 'fresh-pulse',
      )}
    >
      <i aria-hidden="true" className={cn('absolute bottom-2 left-0 top-2 w-[2.5px] rounded-r-full bg-(--c)', retired && 'opacity-35')} />
      <div className="min-w-0 pl-1 @xl:col-span-5">
        <div className="flex items-center gap-1.5">
          <TypeDot type={node.type} className={cn('size-1.5 shrink-0', retired && 'opacity-50')} />
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{node.id}</span>
          <ChangeDeltaBadge change={change} compact />
          <span className={cn('truncate font-medium text-foreground', retired && 'text-muted-foreground line-through')}>
            {headline}
          </span>
        </div>
        {loc && (
          <code className="mt-0.5 block truncate pl-3 font-mono text-[10.5px] text-muted-foreground">{loc}</code>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-1 @xl:col-span-4 @xl:pl-0">
        {node.severity
          ? <SeverityBadge severity={node.severity} />
          : <span className="rounded border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{t('severity.unset')}</span>}
        <ConfidencePill confidence={node.confidence} compact />
        <PostureBadge provenance={prov} multiActor={multiActor} show={showProvenance} />
        {node.status && <StatusPill status={node.status} compact />}
      </div>

      <div className="flex items-center gap-2.5 pl-1 font-mono text-[11px] tabular-nums text-muted-foreground @xl:col-span-3 @xl:justify-end @xl:pl-0">
        {showProvenance && multiActor && (prov?.participants.length ?? 0) > 1 && (
          <span className="rounded border bg-secondary/45 px-1.5 py-0 font-sans text-[10.5px] text-foreground">
            {t('audit.actorsCount', { n: prov!.participants.length })}
          </span>
        )}
        <span className={cn(supports > 0 && 'font-medium text-(--rel-support)')} title={t('audit.support')}>
          +{supports}
        </span>
        <span className={cn(contradictions > 0 && 'font-semibold text-(--rel-oppose)')} title={t('audit.contradiction')}>
          −{contradictions}
        </span>
        <span className={cn(conditions > 0 && 'text-(--rel-derive)')} title={t('audit.condition')}>
          {conditions} {t('audit.condition')}
        </span>
        <ArrowRight className="size-3.5 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
      </div>
    </button>
  );
}

export function IssueCandidateMatrixSection({
  page,
  index,
  selectedId,
  provenanceMode = 'auto',
  changes = null,
  fresh,
  onOpenCandidate,
  onExpand,
}: {
  page: AuditPage<BoardNode>;
  index: AuditIndex;
  selectedId: string | null;
  provenanceMode?: AuditProvenanceMode;
  changes?: ReadonlyMap<string, NodeChange> | null;
  fresh?: ReadonlySet<string>;
  onOpenCandidate: (node: BoardNode) => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
}) {
  const [lens, setLens] = useState<MatrixLens | null>(null);
  const showProvenance = provenanceMode !== 'off';
  const effectiveMultiActor = provenanceMode === 'off' ? false : provenanceMode === 'always' ? true : index.multiActor;
  const filteredItems = lens ? page.items.filter((item) => matchesMatrixLens(item, index, lens)) : page.items;

  return (
    <section aria-label={t('audit.candidates')} className="mb-4 rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/30 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          <h3 className="m-0 font-semibold text-foreground">{t('audit.matrix')}</h3>
          <span className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{page.total}</span>
        </div>
        <FactualTallyStrip
          candidates={page.items}
          index={index}
          showProvenance={showProvenance}
          multiActor={effectiveMultiActor}
          activeLens={lens}
          onSelectLens={setLens}
        />
      </header>
      {page.total > 0 ? (
        <>
          <div className="p-2 pb-0">
            <AuditPageControls page={page} label={t('audit.candidates')} onExpand={onExpand} />
          </div>
          {filteredItems.length > 0 ? (
            <div className="divide-y">
              {filteredItems.map((candidate) => (
                <MatrixCandidateRow
                  key={candidate.id}
                  node={candidate}
                  index={index}
                  selected={selectedId === candidate.id}
                  showProvenance={showProvenance}
                  multiActor={effectiveMultiActor}
                  change={changes?.get(candidate.id)}
                  isFresh={fresh?.has(candidate.id)}
                  onOpen={onOpenCandidate}
                />
              ))}
            </div>
          ) : (
            <p className="m-0 px-3.5 py-3 text-xs text-muted-foreground">{t('sidebar.noMatch')}</p>
          )}
        </>
      ) : (
        <p className="m-0 px-3.5 py-3 text-xs text-muted-foreground">{t('audit.noIssueCandidates')}</p>
      )}
    </section>
  );
}

type LandingProps = {
  audit: AuditSelection;
  selectedId: string | null;
  graphOpen: boolean;
  inspectorPadding?: string;
  provenanceMode?: AuditProvenanceMode;
  changes?: ReadonlyMap<string, NodeChange> | null;
  fresh?: ReadonlySet<string>;
  onToggleGraph: (next: boolean) => void;
  onSelect: (id: string) => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
  onOpenArgument: (node: BoardNode, parentIssueId?: string) => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};

/** Global audit landing: Issue × Candidate 3D orthogonal triage matrix, zero invented scores. */
export function AuditLandingMatrix({
  audit,
  selectedId,
  inspectorPadding,
  provenanceMode = 'auto',
  changes = null,
  fresh,
  onSelect,
  onIssue,
  onCandidate,
  onOpenArgument,
  onExpand,
}: LandingProps) {
  const [lens, setLens] = useState<MatrixLens | null>(null);
  const hasStructuredItems = audit.issues.length > 0 || audit.candidates.length > 0;
  const [recordsOpen, setRecordsOpen] = useState(!hasStructuredItems);
  const showProvenance = provenanceMode !== 'off';
  const effectiveMultiActor = provenanceMode === 'off' ? false : provenanceMode === 'always' ? true : audit.index.multiActor;
  const visibleIssues = audit.catalog.issues.items
    .map((issue) => {
      const allMembers = audit.index.membership.get(issue.id) ?? [];
      const members = lens ? allMembers.filter((item) => matchesMatrixLens(item, audit.index, lens)) : allMembers;
      return { issue, members };
    })
    .filter(({ members }) => !lens || members.length > 0);

  const pickRecord = (node: BoardNode) => {
    if (isAuditIssue(node)) onIssue(node.id);
    else if (isAuditCandidate(node)) onCandidate(node.id);
    else onSelect(node.id);
  };

  return (
    <section
      aria-label={t('audit.dossier')}
      style={inspectorPadding ? ({ '--audit-pad': inspectorPadding } as CssVars) : undefined}
      className={cn('flex h-full min-h-0 flex-col overflow-hidden', inspectorPadding && 'lg:pr-(--audit-pad)')}
    >
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-sm font-semibold text-foreground">{t('audit.dossier')}</h2>
            <span className="text-xs text-muted-foreground">· {t('audit.matrix')}</span>
          </div>
          <p className="m-0 text-xs leading-5 text-muted-foreground">{t('audit.chooseRoot')}</p>
          <FactualTallyStrip
            candidates={audit.candidates}
            index={audit.index}
            showProvenance={showProvenance}
            multiActor={effectiveMultiActor}
            activeLens={lens}
            onSelectLens={setLens}
          />
        </div>
      </header>

      <div className="@container min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        <section aria-label={t('audit.issues')} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-xs font-semibold text-foreground">{t('audit.issues')} · {audit.issues.length}</h3>
            <AuditPageControls page={audit.catalog.issues} label={t('audit.issues')} onExpand={onExpand} />
          </div>

          {audit.issues.length ? (
            visibleIssues.length ? (
            <div className="space-y-3">
              {visibleIssues.map(({ issue, members }) => {
                const preview = members.slice(0, ISSUE_PREVIEW_LIMIT);
                const scope = authoredScopeLabel(issue);
                return (
                  <article key={issue.id} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/35 px-3.5 py-2.5">
                      <button
                        type="button"
                        onClick={() => onIssue(issue.id)}
                        className="group flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <TypeDot type={issue.type} className="size-2 shrink-0" />
                        <span className="shrink-0 rounded border bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                          {issue.id}
                        </span>
                        <span className="truncate text-xs font-semibold text-foreground group-hover:underline">
                          {presentNode(issue).headline}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {scope && <span className="hidden max-w-64 truncate font-mono @2xl:inline">{scope}</span>}
                        <span className="rounded bg-card px-1.5 py-0.5 font-mono tabular-nums">
                          {members.length} {t('audit.candidates')}
                        </span>
                      </div>
                    </header>
                    {preview.length ? (
                      <div className="divide-y">
                        {preview.map((candidate) => (
                          <MatrixCandidateRow
                            key={candidate.id}
                            node={candidate}
                            index={audit.index}
                            selected={selectedId === candidate.id}
                            showProvenance={showProvenance}
                            multiActor={effectiveMultiActor}
                            change={changes?.get(candidate.id)}
                            isFresh={fresh?.has(candidate.id)}
                            onOpen={(picked) => onOpenArgument(picked, issue.id)}
                          />
                        ))}
                        {members.length > ISSUE_PREVIEW_LIMIT && (
                          <div className="bg-secondary/20 px-3.5 py-2">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onIssue(issue.id)}>
                              {t('audit.moreIssueCandidates', { n: members.length })}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="m-0 px-3.5 py-2.5 text-xs text-muted-foreground">{t('audit.noIssueCandidates')}</p>
                    )}
                  </article>
                );
              })}
            </div>
            ) : (
              <p className="m-0 rounded-lg border border-dashed px-3.5 py-3 text-xs text-muted-foreground">{t('sidebar.noMatch')}</p>
            )
          ) : (
            <p className="m-0 rounded-lg border border-dashed px-3.5 py-3 text-xs text-muted-foreground">{t('audit.noIssues')}</p>
          )}
        </section>

        {!audit.issues.length && (
          <section aria-label={t('audit.candidates')} className="space-y-2">
            <h3 className="m-0 text-xs font-semibold text-foreground">{t('audit.candidates')} · {audit.candidates.length}</h3>
            {audit.candidates.length ? (
              <div className="divide-y overflow-hidden rounded-xl border bg-card">
                {audit.catalog.members.items
                  .filter((item) => matchesMatrixLens(item, audit.index, lens))
                  .map((candidate) => (
                    <MatrixCandidateRow
                      key={candidate.id}
                      node={candidate}
                      index={audit.index}
                      selected={selectedId === candidate.id}
                      showProvenance={showProvenance}
                      multiActor={effectiveMultiActor}
                      change={changes?.get(candidate.id)}
                      isFresh={fresh?.has(candidate.id)}
                      onOpen={onOpenArgument}
                    />
                  ))}
              </div>
            ) : (
              <p className="m-0 text-xs text-muted-foreground">{t('audit.noCandidates')}</p>
            )}
            <AuditPageControls page={audit.catalog.members} label={t('audit.candidates')} onExpand={onExpand} />
          </section>
        )}

        {audit.unassigned.length > 0 && (
          <section aria-label={t('audit.unassigned')} className="space-y-2 rounded-xl border bg-card p-3.5 shadow-xs">
            <h3 className="m-0 text-xs font-semibold text-foreground">{t('audit.unassigned')} · {audit.unassigned.length}</h3>
            <AuditPageControls page={audit.catalog.unassigned} label={t('audit.unassigned')} defaultLimit={0} onExpand={onExpand} />
            {audit.catalog.unassigned.items.length > 0 && (
              <div className="divide-y overflow-hidden rounded-lg border">
                {audit.catalog.unassigned.items
                  .filter((item) => matchesMatrixLens(item, audit.index, lens))
                  .map((candidate) => (
                    <MatrixCandidateRow
                      key={candidate.id}
                      node={candidate}
                      index={audit.index}
                      selected={selectedId === candidate.id}
                      showProvenance={showProvenance}
                      multiActor={effectiveMultiActor}
                      change={changes?.get(candidate.id)}
                      isFresh={fresh?.has(candidate.id)}
                      onOpen={onOpenArgument}
                    />
                  ))}
              </div>
            )}
          </section>
        )}

        <section aria-label={t('audit.records')} className="rounded-xl border bg-card p-3 shadow-xs">
          <button
            type="button"
            aria-expanded={recordsOpen && audit.catalog.records.open}
            onClick={() => {
              const next = !(recordsOpen && audit.catalog.records.open);
              setRecordsOpen(next);
              if (next && !audit.catalog.records.open) onExpand('records', 'more', 0);
            }}
            className="flex w-full items-center gap-2 text-left text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', recordsOpen && audit.catalog.records.open && 'rotate-90')} />
            <span>{t('audit.records')} · {audit.records.length}</span>
          </button>
          {recordsOpen && audit.catalog.records.open && (
            <div className="mt-2.5 space-y-2">
              <AuditPageControls page={audit.catalog.records} label={t('audit.records')} onExpand={onExpand} />
              <div className="grid gap-1.5 @xl:grid-cols-2">
                {audit.catalog.records.items.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => pickRecord(record)}
                    className="flex items-start gap-2 rounded-lg border bg-background/60 px-2.5 py-2 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TypeDot type={record.type} className="mt-1.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{record.title || record.id}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{typeLabel(record.type)}</span>
                        <span className="font-mono text-[10.5px]">{record.id}</span>
                        {record.severity ? <SeverityBadge severity={record.severity} className="px-1.5 text-[10px]" /> : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
