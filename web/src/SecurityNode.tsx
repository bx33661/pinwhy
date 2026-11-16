import { memo, type CSSProperties } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import {
  Activity, AlertTriangle, CheckCircle2, CircleHelp, Crosshair, FileSearch,
  Flag, Lightbulb, ListChecks, MessageSquareText, Route, ShieldAlert, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CanvasNode } from './graph';
import { typeLabel } from './graph';
import { BaseNode } from './components/react-flow/base-node';
import { detailLevel } from './canvas-state';
import { confidenceLabel, nodeStateSummary, presentNode, statusLabel } from './presentation';
import { sourceLocation } from './research-state';
import { SeverityBadge } from './SeverityBadge';
import { t } from './i18n';

const ICONS = {
  goal: Flag,
  intent: Route,
  hypothesis: Lightbulb,
  question: CircleHelp,
  fact: FileSearch,
  observation: FileSearch,
  action: Crosshair,
  result: CheckCircle2,
  finding: AlertTriangle,
  vuln: ShieldAlert,
  hint: Sparkles,
  summary: ListChecks,
  note: MessageSquareText,
} as const;

export function NodeTypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  const Icon = ICONS[type as keyof typeof ICONS] || Activity;
  return <Icon size={size} strokeWidth={1.7} />;
}

/** The single colour cue for a node kind; everything else stays neutral. */
const DOT_CLASS: Record<string, string> = {
  start: 'bg-node-start', goal: 'bg-node-goal', intent: 'bg-node-intent', hypothesis: 'bg-node-hypothesis',
  question: 'bg-node-question', fact: 'bg-node-fact', observation: 'bg-node-observation', action: 'bg-node-action',
  result: 'bg-node-result', finding: 'bg-node-finding', vuln: 'bg-node-vuln', hint: 'bg-node-hint',
  summary: 'bg-node-summary', note: 'bg-node-note',
};
export function TypeDot({ type, className }: { type: string; className?: string }) {
  return <i className={cn('inline-block size-2 shrink-0 rounded-full', DOT_CLASS[type] || 'bg-node-note', className)} />;
}

const handleClass = 'size-1! min-h-0! min-w-0! border-0! bg-transparent! opacity-0! pointer-events-none!';

export const SecurityNode = memo(function SecurityNode({ data, selected }: NodeProps<CanvasNode>) {
  const { item, current, dimmed, direction, compact, muted, hoverMuted, hoverPeer, entering, enterOrder, fresh, agents, change, changeFields } = data;
  const level = useStore((state) => detailLevel(state.transform[2]));
  const vertical = direction === 'DOWN';
  const text = presentNode(item);
  const loc = sourceLocation(item);
  const severe = item.severity === 'critical' || item.severity === 'high';
  const state = nodeStateSummary(item);
  const progress = nodeStateSummary({ status: item.status, confidence: item.confidence });
  const overview = level === 'overview';
  // The header that names severity is gone in the overview, so it moves to a badge that survives zooming out.
  const rated = item.severity && item.severity !== 'info';
  const retired = ['dead', 'refuted', 'superseded'].includes(item.status || '');

  return (
    <BaseNode
      tabIndex={-1}
      style={{ '--c': `var(--node-${item.type in DOT_CLASS ? item.type : 'note'})`, '--enter-order': enterOrder ?? 0 } as CSSProperties}
      data-detail-level={level}
      data-entering={entering ? 'true' : undefined}
      data-severe={severe && !retired ? 'true' : undefined}
      title={change === 'added' ? `${t('node.changeAdded')}\n${t('node.previewHint')}` : change === 'updated' ? `${t('node.changeUpdated', { fields: (changeFields || []).join(', ') })}\n${t('node.previewHint')}` : t('node.previewHint')}
      aria-label={`${typeLabel(item.type)}：${item.title}${state ? ` · ${state}` : ''}`}
      className={cn(
        'pinwhy-card flex flex-col gap-1.5 py-3 pl-4 pr-3.5 text-left transition-[opacity,box-shadow,border-color,background-color] duration-150',
        current && 'current-halo',
        current && !selected && 'border-live ring-2 ring-live/60',
        selected && 'ring-1 ring-foreground',
        hoverPeer && !selected && 'border-strong ring-1 ring-strong',
        overview && severe && 'border-destructive/60',
        retired && 'border-dashed saturate-[.55]',
        retired && !selected && !hoverPeer && !muted && !hoverMuted && 'opacity-80',
        retired && !selected && 'border-strong/80 bg-secondary/45',
        dimmed && 'opacity-25',
        muted && 'opacity-35',
        hoverMuted && !muted && 'opacity-55',
        fresh && 'fresh-pulse',
        change === 'added' && 'change-added',
        change === 'updated' && 'change-updated',
      )}
    >
      <i aria-hidden className={cn('pinwhy-card-bar absolute', retired && 'opacity-35')} />
      <i aria-hidden className={cn('pinwhy-card-wash pointer-events-none', retired && 'opacity-30')} />
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className={handleClass} />
      {overview && change && (
        <span className="zoom-chip at-left inline-flex items-center gap-1 rounded-md border border-strong bg-card px-2 font-mono text-[11px] text-foreground">
          {change === 'added' ? '+' : '~'} {change === 'added' ? t('node.changeAdded') : t('node.changeUpdated', { fields: (changeFields || []).join(', ') })}
        </span>
      )}
      {overview && current && !change && (
        <span className="zoom-chip at-left inline-flex items-center gap-1 rounded-md bg-live px-2 text-[11px] text-white">
          <i className="size-1.5 rounded-full bg-white" />{t('node.current')}
        </span>
      )}
      {overview && (rated || retired || item.confidence) && (
        <span className="zoom-chip at-right inline-flex items-center gap-1 text-[11px]">
          {retired && <span className="rounded-md border bg-card px-2 text-muted-foreground">{statusLabel(item.status)}</span>}
          {item.confidence && <span className="rounded-md border bg-card px-2 text-foreground">{confidenceLabel(item.confidence)}</span>}
          {rated && <SeverityBadge severity={item.severity} className="px-2 text-[11px]" />}
        </span>
      )}
      {!overview && (
        <header className="relative flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <span className="pinwhy-type-pill inline-flex shrink-0 items-center gap-1 font-medium">
            <NodeTypeIcon type={item.type} size={12} />{typeLabel(item.type)}
          </span>
          {current && (
            <span className="ml-1 inline-flex items-center gap-1 text-live">
              <i className="live-dot size-1.5 rounded-full bg-live" />{t('node.current')}
            </span>
          )}
          {agents?.map((agent) => (
            <span key={agent} className="ml-1 inline-flex max-w-24 items-center gap-1 truncate text-subtle" title={t('node.agentHere', { agent })}>
              <i className="size-1.5 shrink-0 rounded-full bg-strong" />{agent}
            </span>
          ))}
          {change && (
            <span className="ml-1 inline-flex items-center rounded-md border border-strong px-1 font-mono text-[10px] leading-4 text-foreground" title={change === 'added' ? t('node.changeAdded') : t('node.changeUpdated', { fields: (changeFields || []).join(', ') })}>
              {change === 'added' ? '+' : '~'}
            </span>
          )}
          {retired ? (
            <span className="ml-auto flex min-w-0 items-center gap-1">
              <span className="shrink-0 rounded border border-dashed border-strong bg-background/70 px-1 text-[10px] leading-4 text-muted-foreground">{statusLabel(item.status)}</span>
              {item.confidence && <span title={confidenceLabel(item.confidence)} className="min-w-0 truncate">{confidenceLabel(item.confidence)}</span>}
            </span>
          ) : (
            <span title={progress} className="ml-auto min-w-0 truncate">{progress}</span>
          )}
          {item.severity && <SeverityBadge severity={item.severity} />}
        </header>
      )}
      {data.auditRoles && <p className="relative m-0 truncate text-[11px] font-medium leading-4 text-muted-foreground" title={data.auditRoles.map((role) => t(`audit.${role}`)).join(' · ')}>{data.auditRoles.map((role) => t(`audit.${role}`)).join(' · ')}</p>}
      {data.auditCounts && (data.auditCounts.contradiction > 0 || data.auditCounts.condition > 0) && <div className="relative flex flex-wrap gap-1 text-[11px] font-medium leading-4">
        {data.auditCounts.contradiction > 0 && <button type="button" data-audit-detail="contradiction" aria-label={`${item.title || item.id} · ${t('audit.hasContradictions')} · ${data.auditCounts.contradiction}`} className="nodrag nopan rounded border border-foreground/40 bg-background px-1.5 py-0.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{t('audit.hasContradictions')} · {data.auditCounts.contradiction}</button>}
        {data.auditCounts.condition > 0 && <button type="button" data-audit-detail="condition" aria-label={`${item.title || item.id} · ${t('audit.hasConditions')} · ${data.auditCounts.condition}`} className="nodrag nopan rounded border border-foreground/40 bg-background px-1.5 py-0.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{t('audit.hasConditions')} · {data.auditCounts.condition}</button>}
      </div>}
      <h3
        title={item.title}
        className={cn(
          'relative m-0 font-medium text-foreground',
          overview ? (compact ? 'text-[18px] leading-[1.3] line-clamp-3' : 'text-[22px] leading-[1.3] line-clamp-2') : 'text-sm leading-5 line-clamp-2',
          retired && 'text-muted-foreground line-through decoration-muted-foreground/60 decoration-1',
        )}
      >
        {overview && <TypeDot type={item.type} className="mr-2 mb-0.5 size-2.5 align-middle" />}
        {text.headline}
      </h3>
      {level === 'detail' && !compact && text.summary && (
        <p className={cn('relative m-0 text-xs leading-[18px] text-muted-foreground', loc ? 'line-clamp-1' : 'line-clamp-2')}>{text.summary}</p>
      )}
      {level === 'detail' && !compact && loc && (
        <p className="relative m-0 mt-auto truncate font-mono text-[10.5px] leading-4 text-muted-foreground/90" title={loc}>{loc}</p>
      )}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className={handleClass} />
    </BaseNode>
  );
});
