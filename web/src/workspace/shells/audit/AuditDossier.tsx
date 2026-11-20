import { Check, ChevronRight, Link2, Network } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { RelationBadge } from '@/components/relation-badge';
import { useCopyFeedback } from '@/components/use-copy-feedback';
import { cn } from '@/lib/utils';
import { TypeDot } from '../../../SecurityNode';
import { SeverityBadge } from '../../../SeverityBadge';
import { relationTone } from '../../../graph';
import { confidenceLabel, nodeAccent, presentNode, statusLabel, typeLabel } from '../../../presentation';
import { t } from '../../../i18n';
import { sourceLocation } from '../../../research-state';
import type { BoardEdge, BoardNode } from '../../../types';
import {
  AUDIT_BATCH,
  edgePeer,
  isAuditCandidate,
  isAuditIssue,
  type ArgumentRole,
  type AuditExpansionAction,
  type AuditPage,
  type AuditSelection,
} from '../../audit';

type Props = {
  audit: AuditSelection;
  selected: BoardNode | null;
  graphOpen: boolean;
  onToggleGraph: () => void;
  onSelect: (id: string) => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
  onOpenArgument: (node: BoardNode) => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};

function LocationChip({ node }: { node: BoardNode }) {
  const location = sourceLocation(node);
  const { copied, copy } = useCopyFeedback(2000, node.id);
  if (!location) return null;
  return (
    <div className="mt-1.5 flex items-start gap-1.5 rounded border bg-secondary/30 px-2 py-1.5">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[11px] leading-4" aria-label={t('source.location')}>{location}</code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 px-1.5"
        aria-label={copied ? t('common.copied') : t('source.copy')}
        onClick={() => { void copy(location); }}
      >
        {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}
      </Button>
    </div>
  );
}

const DOSSIER_ROLES: readonly ArgumentRole[] = ['support', 'contradiction', 'condition', 'related'];
const LOCAL_ROLES: readonly ArgumentRole[] = ['contradiction', 'condition', 'support', 'related'];
const ROLE_TONE: Record<ArgumentRole | 'premise', string> = {
  support: 'var(--rel-support)',
  premise: 'var(--rel-support)',
  contradiction: 'var(--rel-oppose)',
  condition: 'var(--rel-derive)',
  related: 'var(--ink-3)',
};

function ClaimCard({ node, selected, onSelect }: { node: BoardNode; selected: boolean; onSelect: (id: string) => void }) {
  const { headline, summary } = presentNode(node);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      style={{ '--c': nodeAccent(node.type) } as CSSProperties}
      className={cn(
        'relative w-full rounded-lg border py-3 pl-4 pr-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-foreground/40 bg-accent' : 'bg-card hover:border-strong hover:bg-accent/50',
      )}
    >
      <i aria-hidden="true" className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-full bg-(--c)" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <TypeDot type={node.type} className="size-1.5" />{typeLabel(node.type)}
        </span>
        <span className="rounded bg-secondary/80 px-1.5 py-0 font-mono text-[10.5px]">{node.id}</span>
        {node.status ? <span>{statusLabel(node.status)}</span> : null}
        {node.confidence ? <span className="rounded border bg-secondary/50 px-1.5 py-0 font-medium text-foreground">{confidenceLabel(node.confidence)}</span> : null}
        {node.severity ? <SeverityBadge severity={node.severity} /> : null}
      </div>
      <p className="m-0 mt-2 text-sm font-medium leading-6 text-foreground">{headline}</p>
      {summary ? <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{summary}</p> : null}
      <LocationChip node={node} />
    </button>
  );
}

/** Security-specialized reading surface: claim dossier first, graph optional. */
export function AuditDossier({
  audit, selected, graphOpen, onToggleGraph, onSelect, onIssue, onCandidate, onOpenArgument, onExpand,
}: Props) {
  const byId = audit.index.byId;
  const local = selected && audit.root && selected.id !== audit.root.id ? audit.contexts.get(selected.id) : null;

  // Open authored local rebuttals/conditions when a reader inspects an evidence record.
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

  const controls = (page: AuditPage<unknown>, label: string, defaultLimit = AUDIT_BATCH) => {
    if (page.hidden === 0 && page.limit <= defaultLimit) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 py-1">
        <p className="m-0 w-full text-[11px] leading-5 text-muted-foreground">
          {t('audit.pageCount', { total: page.total, shown: page.shown, hidden: page.hidden })}
        </p>
        {page.hidden > 0 && (
          <Button size="sm" variant="outline" aria-label={`${label} · ${t('audit.showMore')}`} onClick={() => onExpand(page.key, 'more', defaultLimit)}>
            {t('audit.showMore')}
          </Button>
        )}
        {page.limit > defaultLimit && (
          <Button size="sm" variant="ghost" aria-label={`${label} · ${t('audit.collapse')}`} onClick={() => onExpand(page.key, 'collapse', defaultLimit)}>
            {t('audit.collapse')}
          </Button>
        )}
      </div>
    );
  };

  const relationCard = (edge: BoardEdge, ownerId: string) => {
    const otherId = edgePeer(edge, ownerId);
    const other = byId.get(otherId);
    const selectedHere = selected?.id === otherId || selected?.id === edge.from || selected?.id === edge.to;
    const relTone = relationTone(edge.kind);
    return (
      <article
        key={edge.id}
        style={{ '--r': relTone || 'var(--line-strong)' } as CSSProperties}
        className={cn(
          'relative my-1.5 rounded-lg border py-2.5 pl-3.5 pr-3 text-xs leading-5 transition-colors',
          selectedHere ? 'border-foreground/35 bg-accent/55' : 'bg-card hover:border-strong',
        )}
      >
        <i aria-hidden="true" className="absolute bottom-2.5 left-0 top-2.5 w-[2.5px] rounded-r-full bg-(--r)" />
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <RelationBadge kind={edge.kind} />
          <span className="font-mono text-[10.5px] text-muted-foreground">{edge.kind}</span>
          <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{edge.id}</span>
        </div>
        <button
          type="button"
          aria-label={`${other?.title || otherId} · ${otherId}`}
          className="mt-1.5 flex w-full items-start gap-2 rounded text-left font-medium text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelect(otherId)}
        >
          {other && <TypeDot type={other.type} className="mt-[6px]" />}
          <span className="min-w-0 flex-1 break-words">{other?.title || otherId}</span>
          <span className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground">{otherId}</span>
        </button>
        {edge.label && (
          <p className="m-0 mt-1 break-words text-xs leading-5 text-subtle">{edge.label}</p>
        )}
        {other ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{typeLabel(other.type)}</span>
            {other.confidence ? <span className="rounded bg-secondary/70 px-1.5 py-0 text-foreground">{confidenceLabel(other.confidence)}</span> : null}
            {other.severity ? <SeverityBadge severity={other.severity} className="px-1.5 text-[10px]" /> : null}
            {other.status ? <span>{statusLabel(other.status)}</span> : null}
          </div>
        ) : null}
        {other ? <LocationChip node={other} /> : null}
        {other && (isAuditCandidate(other) || isAuditIssue(other)) && (
          <Button variant="ghost" size="sm" className="mt-1.5 h-auto max-w-full whitespace-normal text-left text-[11px]" onClick={() => onOpenArgument(other)}>
            {t('audit.openArgument')}: {other.title || other.id}
          </Button>
        )}
      </article>
    );
  };

  const groupSection = (page: AuditPage<BoardEdge>, label: string, ownerId: string, role: ArgumentRole | 'premise', defaultLimit = AUDIT_BATCH) => (
    <section key={page.key} aria-label={label} className="border-t py-3">
      <button
        type="button"
        aria-label={`${label} · ${page.total}`}
        aria-expanded={page.open}
        onClick={() => onExpand(page.key, 'toggle', defaultLimit)}
        className={cn(
          'group flex w-full items-center gap-2 rounded py-0.5 text-left text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
          page.total === 0 && 'text-muted-foreground',
        )}
      >
        <i aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: ROLE_TONE[role] }} />
        <span className="flex-1">{label}</span>
        <span className="tabular-nums font-normal text-muted-foreground">{page.total}</span>
        <ChevronRight aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', page.open && 'rotate-90')} />
      </button>
      {page.open ? (
        <div className="mt-1.5">
          {controls(page, label, defaultLimit)}
          {page.items.map((edge) => relationCard(edge, ownerId))}
        </div>
      ) : (
        page.total > 0 && (
          <p className="m-0 mt-1 text-[11px] leading-5 text-muted-foreground">
            {t('audit.pageCount', { total: page.total, shown: 0, hidden: page.total })}
          </p>
        )
      )}
    </section>
  );

  if (!audit.records.length) {
    return (
      <section aria-label={t('audit.dossier')} className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="m-0 text-sm font-medium text-foreground">{t('audit.empty')}</p>
        <p className="m-0 max-w-md text-xs leading-5 text-muted-foreground">{t('audit.emptyHint')}</p>
      </section>
    );
  }

  if (!audit.root) {
    const pick = (node: BoardNode) => {
      if (isAuditIssue(node)) onIssue(node.id);
      else if (isAuditCandidate(node)) onCandidate(node.id);
      else onSelect(node.id);
    };
    const overviewCard = (node: BoardNode) => (
      <button
        key={node.id}
        type="button"
        onClick={() => pick(node)}
        className="w-full rounded-md border bg-card px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block text-xs font-medium leading-5">{node.title || node.id}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{typeLabel(node.type)} · {node.id}</span>
          {node.confidence ? <span>{confidenceLabel(node.confidence)}</span> : null}
          {node.severity ? <SeverityBadge severity={node.severity} className="px-1.5 text-[10px]" /> : null}
        </span>
      </button>
    );
    return (
      <section aria-label={t('audit.dossier')} className="flex h-full flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="m-0 text-sm font-semibold">{t('audit.dossier')}</h2>
            <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{t('audit.chooseRoot')}</p>
          </div>
          <Button size="sm" variant={graphOpen ? 'default' : 'outline'} aria-pressed={graphOpen} onClick={onToggleGraph}>
            <Network className="size-3.5" />{t('audit.showGraph')}
          </Button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <section aria-label={t('audit.issues')}>
            <h3 className="m-0 mb-2 text-xs font-semibold">{t('audit.issues')} · {audit.issues.length}</h3>
            {audit.issues.length ? <div className="grid gap-2">{audit.catalog.issues.items.map(overviewCard)}</div> : <p className="m-0 text-xs text-muted-foreground">{t('audit.noIssues')}</p>}
            {audit.catalog.issues.hidden > 0 && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => onExpand('issues', 'more')}>{t('audit.showMore')}</Button>
            )}
          </section>
          <section aria-label={t('audit.candidates')}>
            <h3 className="m-0 mb-2 text-xs font-semibold">{t('audit.candidates')} · {audit.candidates.length}</h3>
            {audit.candidates.length ? <div className="grid gap-2">{audit.catalog.members.items.map(overviewCard)}</div> : <p className="m-0 text-xs text-muted-foreground">{t('audit.noCandidates')}</p>}
            {audit.catalog.members.hidden > 0 && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => onExpand('members', 'more')}>{t('audit.showMore')}</Button>
            )}
          </section>
          {audit.unassigned.length > 0 && (
            <section aria-label={t('audit.unassigned')}>
              <h3 className="m-0 mb-2 text-xs font-semibold">{t('audit.unassigned')} · {audit.unassigned.length}</h3>
              {controls(audit.catalog.unassigned, t('audit.unassigned'), 0)}
              <div className="grid gap-2">{audit.catalog.unassigned.items.map(overviewCard)}</div>
            </section>
          )}
          <section aria-label={t('audit.records')}>
            <h3 className="m-0 mb-2 text-xs font-semibold">{t('audit.records')} · {audit.records.length}</h3>
            <div className="grid gap-2">{audit.catalog.records.items.map(overviewCard)}</div>
            {audit.catalog.records.hidden > 0 && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => onExpand('records', 'more')}>{t('audit.showMore')}</Button>
            )}
          </section>
        </div>
      </section>
    );
  }

  const root = audit.root;

  return (
    <section aria-label={t('audit.dossier')} className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-sm font-semibold">{t('audit.dossier')}</h2>
          <p className="m-0 mt-1 text-[11px] leading-5 text-muted-foreground">{t('audit.dossierHint')}</p>
          <div className="m-0 mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {DOSSIER_ROLES.map((role) => (
              <span key={role} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary/40 px-2 py-0.5 tabular-nums">
                <i aria-hidden="true" className="size-1.5 rounded-full" style={{ background: ROLE_TONE[role] }} />
                <span>{t(`audit.${role}`)}</span>
                <strong className="font-medium text-foreground">{audit.pages[role].total}</strong>
              </span>
            ))}
          </div>
          {audit.outsideIssue && <p role="status" className="m-0 mt-1 text-xs font-medium">{t('audit.outsideIssue')}</p>}
          {(audit.missingIssue || audit.missingCandidate) && <p role="status" className="m-0 mt-1 text-xs">{t('audit.missingRoot')}</p>}
        </div>
        <Button size="sm" variant={graphOpen ? 'default' : 'outline'} aria-pressed={graphOpen} onClick={onToggleGraph}>
          <Network className="size-3.5" />{t('audit.showGraph')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ClaimCard node={root} selected={selected?.id === root.id} onSelect={onSelect} />
        <p className="m-0 mt-2 text-[11px] leading-5 text-muted-foreground">{t('audit.boundaryHint')}</p>

        {DOSSIER_ROLES.map((role) =>
          groupSection(audit.pages[role], t(`audit.${role}`), root.id, role, role === 'related' ? 0 : AUDIT_BATCH))}
        {groupSection(audit.premises, t('audit.premise'), root.id, 'premise')}

        {local && (
          <section aria-label={`${t('audit.localDetails')}: ${local.node.id}`} className="mt-3 rounded-lg border p-3">
            <h3 className="m-0 text-xs font-semibold">{t('audit.localDetails')}</h3>
            <p className="m-0 mt-1 text-[11px] leading-5 text-muted-foreground">{t('audit.localHint')}</p>
            <div className="mt-2">
              <ClaimCard node={local.node} selected={selected?.id === local.node.id} onSelect={onSelect} />
            </div>
            {LOCAL_ROLES
              .filter((role) => local.groups[role].length > 0)
              .map((role) => {
                const label = `${local.node.title || local.node.id} · ${t(role === 'contradiction' ? 'audit.hasContradictions' : role === 'condition' ? 'audit.hasConditions' : `audit.${role}`)}`;
                return groupSection(local.pages[role], label, local.node.id, role, 0);
              })}
          </section>
        )}

        {selected && selected.id !== root.id && (isAuditCandidate(selected) || isAuditIssue(selected)) && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => onOpenArgument(selected)}>
              {t('audit.openArgument')}: {selected.title || selected.id}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
