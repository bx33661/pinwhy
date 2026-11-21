import type { CSSProperties, ReactNode } from 'react';
import { Check, Copy, FileCode2, FileText, Network, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { useCopyFeedback } from '@/components/use-copy-feedback';
import { cn } from '@/lib/utils';
import { SeverityBadge } from '../../../SeverityBadge';
import { confidenceLabel, presentNode, statusLabel } from '../../../presentation';
import { t } from '../../../i18n';
import { sourceLocation } from '../../../research-state';
import type { BoardNode } from '../../../types';
import type { NodeChange } from '../../use-workspace-presentation';
import {
  AUDIT_BATCH,
  type ArgumentRole,
  type AuditExpansionAction,
  type AuditPage,
  type AuditProvenance,
} from '../../audit';

export type CssVars = CSSProperties & Record<`--${string}`, string | number>;

const RETIRED = new Set(['dead', 'refuted', 'superseded']);
export const isRetiredNode = (node: Pick<BoardNode, 'status'>) => Boolean(node.status && RETIRED.has(node.status));

export const ROLE_TONE: Record<ArgumentRole | 'premise', string> = {
  support: 'var(--rel-support)',
  premise: 'var(--rel-support)',
  contradiction: 'var(--rel-oppose)',
  condition: 'var(--rel-derive)',
  related: 'var(--ink-3)',
};

export function renderInlineCode(text: string): ReactNode {
  if (!text.includes('`')) return text;
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    part.length >= 3 && part.startsWith('`') && part.endsWith('`')
      ? <code key={index} className="rounded border border-border/80 bg-secondary/65 px-1 py-0.5 font-mono text-[11.5px] text-foreground">{part.slice(1, -1)}</code>
      : part
  ));
}

/** Keeps recorded certainty visually distinct from severity at every reading density. */
export function ConfidencePill({ confidence, compact = false }: { confidence?: string | null; compact?: boolean }) {
  const pad = compact ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-0.5 text-[11px]';
  if (!confidence) {
    if (compact) return null;
    return (
      <span className={cn('inline-flex items-center rounded border border-border/70 bg-secondary/40 leading-4 text-muted-foreground', pad)}>
        {confidenceLabel(confidence)}
      </span>
    );
  }
  const label = confidenceLabel(confidence);
  if (confidence === 'reproduced') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border font-medium leading-4',
        'border-[color-mix(in_srgb,var(--live)_42%,var(--line))] bg-[color-mix(in_srgb,var(--live)_10%,var(--surface))] text-[color-mix(in_srgb,var(--live)_88%,var(--ink))]',
        pad,
      )}>
        <i aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-live" />
        {label}
      </span>
    );
  }
  if (confidence === 'static-confirmed') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border font-medium leading-4',
        'border-[color-mix(in_srgb,var(--rel-derive)_42%,var(--line))] bg-[color-mix(in_srgb,var(--rel-derive)_10%,var(--surface))] text-[color-mix(in_srgb,var(--rel-derive)_88%,var(--ink))]',
        pad,
      )}>
        <i aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--rel-derive)" />
        {label}
      </span>
    );
  }
  if (confidence === 'suspected') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border border-dashed border-strong bg-secondary/45 font-medium leading-4 text-muted-foreground',
        pad,
      )}>
        <i aria-hidden="true" className="size-1.5 shrink-0 rounded-full border border-current" />
        {label}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center rounded border bg-secondary/55 font-medium leading-4 text-foreground', pad)}>
      {label}
    </span>
  );
}

/** Status badge: retired states use a dashed border instead of crossing out the status word itself. */
export function StatusPill({ status, compact = false }: { status?: string | null; compact?: boolean }) {
  const pad = compact ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-0.5 text-[11px]';
  if (!status) {
    if (compact) return null;
    return (
      <span className={cn('inline-flex items-center rounded border border-border/70 bg-secondary/40 leading-4 text-muted-foreground', pad)}>
        {statusLabel(status)}
      </span>
    );
  }
  const retired = RETIRED.has(status);
  return (
    <span className={cn(
      'inline-flex items-center rounded border font-medium leading-4',
      retired
        ? 'border-dashed border-strong bg-secondary/50 text-muted-foreground'
        : status === 'confirmed' || status === 'done'
          ? 'border-border bg-secondary/65 text-foreground'
          : 'border-border/80 bg-secondary/40 text-subtle',
      pad,
    )}>
      {statusLabel(status)}
    </span>
  );
}

/** Orthogonal 3-axis readout: severity, confidence, and status share uniform badge geometry. */
export function OrthogonalReadout({ node }: { node: BoardNode }) {
  return (
    <dl className="m-0 grid shrink-0 grid-cols-3 divide-x rounded-lg border bg-background/60 text-xs">
      <div className="min-w-[84px] px-2.5 py-1.5">
        <dt className="text-[10.5px] text-muted-foreground">{t('inspector.risk')}</dt>
        <dd className="m-0 mt-1 flex min-h-5 items-center">
          {node.severity
            ? <SeverityBadge severity={node.severity} />
            : <span className="inline-flex items-center rounded border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10.5px] leading-4 text-muted-foreground">{t('severity.unset')}</span>}
        </dd>
      </div>
      <div className="min-w-[94px] px-2.5 py-1.5">
        <dt className="text-[10.5px] text-muted-foreground">{t('inspector.confidence')}</dt>
        <dd className="m-0 mt-1 flex min-h-5 items-center">
          {node.confidence ? (
            <ConfidencePill confidence={node.confidence} compact />
          ) : (
            <span className="inline-flex items-center rounded border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10.5px] leading-4 text-muted-foreground">
              {confidenceLabel(node.confidence)}
            </span>
          )}
        </dd>
      </div>
      <div className="min-w-[82px] px-2.5 py-1.5">
        <dt className="text-[10.5px] text-muted-foreground">{t('inspector.status')}</dt>
        <dd className="m-0 mt-1 flex min-h-5 items-center">
          {node.status ? (
            <StatusPill status={node.status} compact />
          ) : (
            <span className="inline-flex items-center rounded border border-border/70 bg-secondary/40 px-1.5 py-0.5 text-[10.5px] leading-4 text-muted-foreground">
              {statusLabel(node.status)}
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

export function LocationChip({ node, className }: { node: BoardNode; className?: string }) {
  const location = sourceLocation(node);
  const { copied, copy } = useCopyFeedback(2000, node.id);
  if (!location) return null;
  return (
    <div className={cn('mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border bg-secondary/35 py-0.5 pl-2 pr-1', className)}>
      <FileCode2 aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-4 text-foreground/90" aria-label={t('source.location')}>
        {location}
      </code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="size-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label={copied ? t('common.copied') : t('source.copy')}
        onClick={(event) => {
          event.stopPropagation();
          void copy(location);
        }}
      >
        {copied ? <Check className="size-3 text-live" /> : <Copy className="size-2.5" />}
      </Button>
    </div>
  );
}

export function AuditPageControls({
  page,
  label,
  defaultLimit = AUDIT_BATCH,
  onExpand,
}: {
  page: AuditPage<unknown>;
  label: string;
  defaultLimit?: number;
  onExpand: (key: string, action: AuditExpansionAction, defaultLimit?: number) => void;
}) {
  const collapseThreshold = defaultLimit > 0 ? defaultLimit : AUDIT_BATCH;
  if (page.hidden === 0 && page.limit <= collapseThreshold) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-1.5 text-[11px]">
      <p className="m-0 tabular-nums leading-4 text-muted-foreground">
        {t('audit.pageCount', { total: page.total, shown: page.shown, hidden: page.hidden })}
      </p>
      <div className="flex items-center gap-1">
        {page.hidden > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            aria-label={`${label} · ${t('audit.showMore')}`}
            onClick={() => onExpand(page.key, 'more', defaultLimit)}
          >
            {t('audit.showMore')}
          </Button>
        )}
        {page.limit > collapseThreshold && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            aria-label={`${label} · ${t('audit.collapse')}`}
            onClick={() => onExpand(page.key, 'collapse', defaultLimit)}
          >
            {t('audit.collapse')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fluid switcher between the full-height dialectical dossier and the full-stage argument blueprint. */
export function AuditSurfaceSwitch({ graphOpen, onToggleGraph }: { graphOpen: boolean; onToggleGraph: (next: boolean) => void }) {
  return (
    <Segmented
      aria-label={t('audit.surfaceLabel')}
      value={graphOpen ? 'graph' : 'dossier'}
      onValueChange={(next) => onToggleGraph(next === 'graph')}
      className="shrink-0"
    >
      <SegmentedItem value="dossier" className="h-7 px-2.5 text-xs">
        <FileText className="size-3.5" />
        {t('audit.dossierShort')}
      </SegmentedItem>
      <SegmentedItem value="graph" className="h-7 px-2.5 text-xs">
        <Network className="size-3.5" />
        {t('audit.showGraph')}
      </SegmentedItem>
    </Segmented>
  );
}

/** Extract recorded `source=...` or scope tags without inferring relationships from prose. */
export function authoredScopeLabel(node: BoardNode): string {
  const loc = sourceLocation(node);
  const sourceTags = Array.isArray(node.tags)
    ? node.tags.filter((tag): tag is string => typeof tag === 'string' && !tag.startsWith('issue='))
    : [];
  const parts = [loc, ...sourceTags.slice(0, 2)].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  const { summary } = presentNode(node);
  return summary.length <= 72 ? summary : `${summary.slice(0, 72)}…`;
}

export function formatActorName(actor: string): string {
  return actor === 'human' ? t('inspector.human') : actor.replace(/^agent:/, '');
}

/** Monochrome solid/dashed checkpoint delta badge matching canvas time-travel semantics. */
export function ChangeDeltaBadge({ change, compact = false }: { change?: NodeChange; compact?: boolean }) {
  if (!change) return null;
  const title = change.kind === 'added'
    ? t('node.changeAdded')
    : t('node.changeUpdated', { fields: change.fields.join(', ') });
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded font-mono font-medium leading-4 text-foreground',
        change.kind === 'added'
          ? 'border border-foreground bg-secondary/75'
          : 'border border-dashed border-strong bg-secondary/50',
        compact ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-[10.5px]',
      )}
    >
      {change.kind === 'added' ? '+' : '~'}
    </span>
  );
}

/** Purely factual adversarial posture badge (zero scoring; single-source only shown on multi-actor boards). */
export function PostureBadge({
  provenance,
  multiActor,
  show = true,
  compact = false,
}: {
  provenance?: AuditProvenance;
  multiActor: boolean;
  show?: boolean;
  compact?: boolean;
}) {
  if (!show || !provenance) return null;
  const sizeClass = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[10.5px]';

  if (provenance.posture === 'contested') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border font-medium leading-4',
        'border-[color-mix(in_srgb,var(--rel-oppose)_45%,var(--line))] bg-[color-mix(in_srgb,var(--rel-oppose)_10%,var(--surface))] text-[color-mix(in_srgb,var(--rel-oppose)_88%,var(--ink))]',
        sizeClass,
      )}>
        <ShieldAlert aria-hidden="true" className="size-2.5 shrink-0" />
        {t('audit.postureContested')}
      </span>
    );
  }
  if (multiActor && provenance.posture === 'corroborated') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border font-medium leading-4',
        'border-[color-mix(in_srgb,var(--live)_42%,var(--line))] bg-[color-mix(in_srgb,var(--live)_10%,var(--surface))] text-[color-mix(in_srgb,var(--live)_88%,var(--ink))]',
        sizeClass,
      )}>
        <ShieldCheck aria-hidden="true" className="size-2.5 shrink-0" />
        {t('audit.postureCorroborated')}
      </span>
    );
  }
  if (multiActor && provenance.posture === 'single') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded border border-dashed border-strong bg-secondary/45 font-medium leading-4 text-muted-foreground',
        sizeClass,
      )}>
        {t('audit.postureSingle')}
      </span>
    );
  }
  return null;
}

/** Displays author attribution and highlights cross-actor corroboration or challenges when >1 actor exists. */
export function ActorProvenanceBadge({
  actor,
  rootProposer,
  role,
  multiActor,
}: {
  actor: string | null;
  rootProposer: string | null;
  role: ArgumentRole | 'premise';
  multiActor: boolean;
}) {
  if (!multiActor || !actor) return null;
  const short = formatActorName(actor);
  const isCross = Boolean(rootProposer && actor !== rootProposer);

  if (actor === 'human') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--rel-derive)_42%,var(--line))] bg-[color-mix(in_srgb,var(--rel-derive)_10%,var(--surface))] px-1.5 py-0.5 text-[10.5px] font-medium leading-4 text-[color-mix(in_srgb,var(--rel-derive)_90%,var(--ink))]">
        <UserRound aria-hidden="true" className="size-2.5 shrink-0" />
        {short}
      </span>
    );
  }

  if (isCross && (role === 'support' || role === 'premise')) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--live)_42%,var(--line))] bg-[color-mix(in_srgb,var(--live)_10%,var(--surface))] px-1.5 py-0.5 text-[10.5px] font-medium leading-4 text-[color-mix(in_srgb,var(--live)_88%,var(--ink))]">
        <ShieldCheck aria-hidden="true" className="size-2.5 shrink-0" />
        <span className="font-mono">{short}</span>
        <span>· {t('audit.crossSupport')}</span>
      </span>
    );
  }

  if (isCross && role === 'contradiction') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--rel-oppose)_45%,var(--line))] bg-[color-mix(in_srgb,var(--rel-oppose)_10%,var(--surface))] px-1.5 py-0.5 text-[10.5px] font-medium leading-4 text-[color-mix(in_srgb,var(--rel-oppose)_88%,var(--ink))]">
        <ShieldAlert aria-hidden="true" className="size-2.5 shrink-0" />
        <span className="font-mono">{short}</span>
        <span>· {t('audit.crossChallenge')}</span>
      </span>
    );
  }

  if (isCross && role === 'condition') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--rel-derive)_42%,var(--line))] bg-[color-mix(in_srgb,var(--rel-derive)_10%,var(--surface))] px-1.5 py-0.5 text-[10.5px] font-medium leading-4 text-[color-mix(in_srgb,var(--rel-derive)_88%,var(--ink))]">
        <span className="font-mono">{short}</span>
        <span>· {t('audit.crossCondition')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded border bg-secondary/55 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground">
      {short}
    </span>
  );
}
