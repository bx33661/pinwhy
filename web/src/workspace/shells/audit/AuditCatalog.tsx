import type { ReactNode } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { TypeDot } from '../../../SecurityNode';
import { SeverityBadge } from '../../../SeverityBadge';
import { confidenceLabel, typeLabel } from '../../../presentation';
import { t } from '../../../i18n';
import type { BoardNode } from '../../../types';
import {
  AUDIT_BATCH,
  isAuditCandidate,
  isAuditIssue,
  type AuditExpansionAction,
  type AuditPage,
  type AuditSelection,
} from '../../audit';

type Props = {
  audit: AuditSelection;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
  onCandidateIssue: (id: string) => void;
  onOpenArgument: (node: BoardNode) => void;
  onSearch: () => void;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
};

/** Catalog-only navigation for the security audit shell. Argument reading lives in the dossier. */
export function AuditCatalog({
  audit, selectedId, onSelect, onIssue, onCandidate, onCandidateIssue, onOpenArgument, onSearch, onExpand,
}: Props) {
  const control = 'w-full min-w-0 rounded-md border bg-card px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const openOrSelect = (node: BoardNode) => {
    if (isAuditIssue(node) || isAuditCandidate(node)) onOpenArgument(node);
    else onSelect(node.id);
  };
  const record = (node: BoardNode) => (
    <button
      key={node.id}
      type="button"
      aria-pressed={selectedId === node.id}
      onClick={() => openOrSelect(node)}
      className={cn(
        'my-1 flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selectedId === node.id ? 'border-foreground/40 bg-accent' : 'bg-card hover:border-strong hover:bg-accent/50',
      )}
    >
      <TypeDot type={node.type} className="mt-[6px]" />
      <span className="min-w-0 flex-1">
        <span className="block break-words leading-5 text-foreground">{node.title || node.id}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{typeLabel(node.type)}</span>
          <span className="font-mono text-[10.5px]">{node.id}</span>
          {node.confidence ? <span className="rounded bg-secondary/70 px-1 py-0 text-foreground">{confidenceLabel(node.confidence)}</span> : null}
          {node.severity ? <SeverityBadge severity={node.severity} className="px-1.5 text-[10px]" /> : null}
        </span>
      </span>
    </button>
  );
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
  const section = (page: AuditPage<unknown>, label: string, content: () => ReactNode, defaultLimit = AUDIT_BATCH) => (
    <section key={page.key} aria-label={label} className="border-t py-2">
      <button type="button" aria-label={`${label} · ${page.total}`} aria-expanded={page.open} onClick={() => onExpand(page.key, 'toggle', defaultLimit)} className="flex w-full items-center gap-1.5 rounded py-0.5 text-left text-xs font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight aria-hidden="true" className={cn('size-3 text-muted-foreground transition-transform', page.open && 'rotate-90')} />
        <span className="flex-1">{label}</span>
        <span className="tabular-nums font-normal text-muted-foreground">{page.total}</span>
      </button>
      {page.open ? <>{controls(page, label, defaultLimit)}{content()}</> : (
        page.total > 0 && (
          <p className="m-0 text-[11px] leading-5 text-muted-foreground">
            {t('audit.pageCount', { total: page.total, shown: 0, hidden: page.total })}
          </p>
        )
      )}
    </section>
  );

  return (
    <nav aria-label={t('audit.navigation')} className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <button
        type="button"
        onClick={onSearch}
        aria-label={t('topbar.search')}
        className="flex h-8 w-full items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] text-muted-foreground shadow-xs transition-colors hover:border-strong hover:text-foreground"
      >
        <Search className="size-3.5" />{t('sidebar.search')}<Kbd className="ml-auto">⌘K</Kbd>
      </button>
      <label className="flex flex-col gap-1 text-xs font-medium">{t('audit.issues')}
        <select className={control} value={audit.issue?.id ?? ''} onChange={(event) => onIssue(event.target.value || null)}>
          <option value="">{t('audit.allIssues')}</option>
          {audit.catalog.issues.items.map((node) => <option key={node.id} value={node.id}>{node.title || node.id}</option>)}
        </select>
      </label>
      {controls(audit.catalog.issues, t('audit.issues'))}
      <div className="space-y-1">{audit.catalog.issues.items.map(record)}</div>
      <label className="flex flex-col gap-1 text-xs font-medium">{t('audit.candidates')}
        <select className={control} value={audit.candidate?.id ?? ''} onChange={(event) => onCandidate(event.target.value || null)}>
          <option value="">{t('audit.issueOverview')}</option>
          {audit.outsideIssue && audit.candidate && (
            <option value={audit.candidate.id}>{audit.candidate.title || audit.candidate.id} · {t('audit.outsideIssue')}</option>
          )}
          {audit.catalog.members.items.map((node) => <option key={node.id} value={node.id}>{node.title || node.id}</option>)}
        </select>
      </label>
      {controls(audit.catalog.members, t('audit.candidates'))}
      <div className="space-y-1">{audit.catalog.members.items.map(record)}</div>
      {audit.issue && audit.catalog.members.total === 0 && (
        <div role="status" className="space-y-1.5 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          <p className="m-0">{t('audit.noIssueCandidates')}</p>
          {audit.catalog.unassigned.total > 0 && (
            <p className="m-0">{t('audit.unassignedNotice', { count: audit.catalog.unassigned.total })}</p>
          )}
          {audit.catalog.unassigned.total > 0 && !audit.catalog.unassigned.open && (
            <Button
              size="sm"
              variant="outline"
              aria-label={`${t('audit.unassigned')} · ${t('audit.showMore')}`}
              onClick={() => onExpand('unassigned', 'more', 0)}
            >
              {t('audit.showMore')}
            </Button>
          )}
        </div>
      )}
      {audit.outsideIssue && (
        <div role="status" className="rounded-md border p-2 text-xs">
          <p className="m-0 mb-1 font-medium">{t('audit.outsideIssue')}</p>
          {controls(audit.catalog.candidateIssues, t('audit.openIssue'))}
          {audit.catalog.candidateIssues.items.map((issue) => (
            <Button key={issue.id} variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal text-left text-xs" onClick={() => onCandidateIssue(issue.id)}>
              {t('audit.openIssue')}: {issue.title || issue.id}
            </Button>
          ))}
        </div>
      )}
      {(audit.missingIssue || audit.missingCandidate) && (
        <p role="status" className="m-0 text-xs text-muted-foreground">{t('audit.missingRoot')}</p>
      )}
      <p className="m-0 text-[11px] leading-5 text-muted-foreground">{t('audit.membershipHint')}</p>
      {section(audit.catalog.unassigned, t('audit.unassigned'), () => audit.catalog.unassigned.items.map(record), 0)}
      {section(audit.catalog.records, t('audit.records'), () => audit.catalog.records.items.map(record), audit.root ? 0 : AUDIT_BATCH)}
      {!audit.records.length && <p role="status" className="text-xs text-muted-foreground">{t('audit.empty')}</p>}
    </nav>
  );
}
