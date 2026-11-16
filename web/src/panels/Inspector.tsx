import { useEffect, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Collapsible } from 'radix-ui';
import { Check, ArrowDownLeft, ArrowUpRight, ChevronRight, Copy, Link2, Loader2, MessageSquareQuote, ScanSearch, Unlink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { NodeTypeIcon, TypeDot } from '../SecurityNode';
import { formatTime, relationGroup, relationLabel, typeLabel } from '../graph';
import { confidenceLabel, presentNode, severityLabel, statusLabel } from '../presentation';
import { SeverityBadge } from '../SeverityBadge';
import { useEdgeRemoval } from './use-node-forms';
import { AddSection, ConnectSection, EditSection } from './EditPanel';
import type { BoardEdge, BoardNode } from '../types';
import { t } from '../i18n';
import { sourceLocation } from '../research-state';
import { usePref } from '../use-pref';
import { NodeHistorySection, type HistoryAvailability } from './HistoryPanel';

/** The framed host's explicit reference affordance; absent on standalone, historical and static pages. */
export type ReferenceAction = {
  status: 'idle' | 'pending' | 'done' | 'error';
  /** Host explanation for a failure; `null` means the host did not answer in time. */
  message: string | null;
  /** Feedback belongs to the node it was requested for; another node starts from rest. */
  nodeId: string | null;
  onRequest: (id: string) => void;
};

type Props = HistoryAvailability & {
  node: BoardNode;
  edges: BoardEdge[];
  byId: Map<string, BoardNode>;
  onClose: () => void;
  onFocus: (id: string) => void;
  onFocusNeighborhood?: () => void;
  onCopyLink?: () => void;
  linkCopied?: boolean;
  /** Only a framed host configured with `reference=1` offers this. */
  reference?: ReferenceAction;
  /** The server accepts edits from this page. */
  writable?: boolean;
  onReload: () => Promise<void>;
  panelRef?: Ref<HTMLElement>;
};

const clampWidth = (value: number) => Math.max(340, Math.min(560, Math.round(value)));

function renderInlineCode(text: string): ReactNode {
  if (!text.includes('`')) return text;
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    part.length >= 3 && part.startsWith('`') && part.endsWith('`')
      ? <code key={index} className="rounded border border-border/80 bg-secondary/65 px-1 py-0.5 font-mono text-[12px] text-foreground">{part.slice(1, -1)}</code>
      : part
  ));
}

export function Inspector({ node, edges, byId, onClose, onFocus, onFocusNeighborhood, onCopyLink, linkCopied, reference, writable, onReload, isStatic, connected, revision, panelRef }: Props) {
  const [width, setWidth] = usePref('inspector-width', 380);
  const [idCopied, setIdCopied] = useState(false);
  useEffect(() => { setIdCopied(false); }, [node.id]);
  useEffect(() => { if (!idCopied) return; const timer = setTimeout(() => setIdCopied(false), 1800); return () => clearTimeout(timer); }, [idCopied]);
  const panelWidth = clampWidth(Number.isFinite(width) ? width : 380);
  const relations = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const incoming = relations.filter((edge) => edge.to === node.id);
  const outgoing = relations.filter((edge) => edge.from === node.id);
  const splitRelations = incoming.length > 0 && outgoing.length > 0;
  const referenceStatus = reference && reference.nodeId === node.id ? reference.status : 'idle';
  const referenceLabel = referenceStatus === 'pending' ? t('inspector.referencePending')
    : referenceStatus === 'done' ? t('inspector.referenceDone')
      : referenceStatus === 'error' ? t('inspector.referenceRetry') : t('inspector.reference');

  const renderRelation = (edge: BoardEdge) => {
    const isIncoming = edge.to === node.id;
    const peer = byId.get(isIncoming ? edge.from : edge.to);
    const Arrow = isIncoming ? ArrowDownLeft : ArrowUpRight;
    const group = relationGroup(edge.kind);
    const relTone = group !== 'link' ? `var(--rel-${group})` : null;
    return (
      <li key={edge.id} className="group/row relative">
        <button
          onClick={() => peer && onFocus(peer.id)}
          className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
        >
          <Arrow className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label={isIncoming ? t('inspector.from') : t('inspector.to')} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <span
                className={cn('inline-flex items-center rounded border px-1.5 py-0 text-[10.5px] font-medium leading-4', !relTone && 'bg-secondary/60 text-subtle')}
                style={relTone ? {
                  color: `color-mix(in srgb, ${relTone} 85%, var(--ink))`,
                  borderColor: `color-mix(in srgb, ${relTone} 30%, var(--line))`,
                  background: `color-mix(in srgb, ${relTone} 10%, var(--surface))`,
                } : undefined}
              >
                {relationLabel(edge.kind)}
              </span>
              {peer && <><TypeDot type={peer.type} className="size-1.5" /><span>{typeLabel(peer.type)}</span></>}
            </span>
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-5">{peer ? presentNode(peer).headline : isIncoming ? edge.from : edge.to}</span>
          </span>
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
        {edge.label && <p className="m-0 ml-7 pb-1.5 whitespace-pre-wrap text-xs leading-5 text-subtle [overflow-wrap:anywhere]">{edge.label}</p>}
        {edge.inputTruncation && <div className="ml-7"><InputIntegrityNotice record={edge} /></div>}
        {writable && (
          <span className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
            <RemoveRelation id={edge.id} />
          </span>
        )}
      </li>
    );
  };

  return (
    <aside
      ref={panelRef}
      aria-label={t('inspector.label')}
      style={{ '--inspector-w': `${panelWidth}px` } as CSSProperties}
      className="anim-slide-in absolute inset-x-3 bottom-3 top-auto z-20 flex max-h-[62%] flex-col rounded-xl border bg-card/92 shadow-float backdrop-blur-md sm:inset-x-auto sm:right-3 sm:top-3 sm:max-h-none sm:w-[min(var(--inspector-w),calc(100%-24px))]"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('inspector.resize')}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = panelWidth;
          const target = event.currentTarget;
          target.setPointerCapture(event.pointerId);
          const onMove = (moveEvent: PointerEvent) => setWidth(clampWidth(startWidth + (startX - moveEvent.clientX)));
          const onUp = () => {
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onUp);
            target.removeEventListener('pointercancel', onUp);
          };
          target.addEventListener('pointermove', onMove);
          target.addEventListener('pointerup', onUp);
          target.addEventListener('pointercancel', onUp);
        }}
        className="absolute inset-y-3 -left-1.5 hidden w-3 cursor-col-resize items-center justify-center sm:flex"
      >
        <span className="h-8 w-1 rounded-full bg-border/0 transition-colors hover:bg-strong" />
      </div>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3.5">
        <span className="text-muted-foreground"><NodeTypeIcon type={node.type} size={14} /></span>
        <span className="text-[13px] font-medium">{typeLabel(node.type)}</span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(node.id);
                setIdCopied(true);
              } catch { /* clipboard can be denied in sandboxed contexts */ }
            }}
            aria-label={idCopied ? `${node.id} · ${t('common.copied')}` : `${t('inspector.copyId')} · ${node.id}`}
            title={idCopied ? t('common.copied') : `${t('inspector.copyId')}: ${node.id}`}
            className="group inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="truncate">{node.id}</span>
            {idCopied
              ? <><Check className="size-3 shrink-0 text-live" /><span className="shrink-0 font-sans text-[10px] font-medium text-live">{t('common.copied')}</span></>
              : <Copy className="size-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" aria-hidden="true" />}
          </button>
        </div>
        {reference && (
          <IconButton
            label={referenceLabel}
            onClick={() => reference.onRequest(node.id)}
            disabled={reference.status === 'pending'}
          >
            {referenceStatus === 'pending' ? <Loader2 className="animate-spin" /> : referenceStatus === 'done' ? <Check /> : <MessageSquareQuote />}
          </IconButton>
        )}
        {onFocusNeighborhood && <IconButton label={t('toolbar.focusNeighborhood')} shortcut="Z" onClick={onFocusNeighborhood}><ScanSearch /></IconButton>}
        {onCopyLink && <IconButton label={linkCopied ? t('inspector.linkCopied') : t('inspector.copyLink')} onClick={onCopyLink}>{linkCopied ? <Check /> : <Link2 />}</IconButton>}
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
        <IconButton label={t('inspector.close')} onClick={onClose}><X /></IconButton>
      </header>

      {reference && referenceStatus !== 'idle' && (
        <p
          role="status"
          className={cn('m-0 shrink-0 border-b px-3.5 py-1.5 text-[11px] leading-4', referenceStatus === 'error' ? 'text-destructive' : 'text-muted-foreground')}
        >
          {referenceStatus === 'pending' ? t('inspector.referencePending')
            : referenceStatus === 'done' ? t('inspector.referenceDone')
              : t('inspector.referenceFailed', { error: reference.message || t('inspector.referenceTimeout') })}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div key={node.id} className="anim-node-swap">
        <InputIntegrityNotice record={node} />
        <h2 className="m-0 whitespace-pre-wrap text-[17px] font-semibold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">{node.title.trim() ? node.title : t('node.untitled')}</h2>
        {node.detail && <p className="mt-2 mb-0 whitespace-pre-wrap text-[13px] leading-[22px] text-subtle [overflow-wrap:anywhere]">{renderInlineCode(node.detail)}</p>}

        <dl className="mt-4 mb-0 grid grid-cols-3 divide-x rounded-lg border bg-secondary/25 text-xs">
          <div className="min-w-0 px-2.5 py-2">
            <dt className="text-[11px] text-muted-foreground">{t('inspector.status')}</dt>
            <dd className="m-0 mt-1 font-medium text-foreground tabular-nums [overflow-wrap:anywhere]">{statusLabel(node.status)}</dd>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <dt className="text-[11px] text-muted-foreground">{t('inspector.risk')}</dt>
            <dd className="m-0 mt-1 font-medium tabular-nums [overflow-wrap:anywhere]">{node.severity ? <SeverityBadge severity={node.severity} /> : severityLabel(node.severity)}</dd>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <dt className="text-[11px] text-muted-foreground">{t('inspector.confidence')}</dt>
            <dd className="m-0 mt-1 font-medium text-foreground tabular-nums [overflow-wrap:anywhere]">{confidenceLabel(node.confidence)}</dd>
          </div>
        </dl>
        <dl className="mt-2.5 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {typeof node.author === 'string' && node.author && (
            <div className="inline-flex min-w-0 items-center gap-1">
              <dt>{t('inspector.author')}</dt>
              <dd className="m-0 truncate text-subtle">{node.author === 'human' ? t('inspector.human') : node.author}</dd>
            </div>
          )}
          <div className="inline-flex items-center gap-1">
            <dt>{t('inspector.created')}</dt>
            <dd className="m-0 tabular-nums text-subtle">{formatTime(Number(node.ts || 0))}</dd>
          </div>
          <div className="inline-flex items-center gap-1">
            <dt>{t('inspector.updated')}</dt>
            <dd className="m-0 tabular-nums text-subtle">{formatTime(Number(node.updated || node.ts || 0))}</dd>
          </div>
        </dl>

        <SourceSection key={`source-${node.id}`} node={node} />

        <section className="mt-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {t('inspector.relations')}<span className="tabular-nums font-normal">{relations.length}</span>
          </h3>
          {relations.length ? (
            splitRelations ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="m-0 mb-1 px-1 text-[11px] font-medium text-muted-foreground">{t('inspector.incoming')} · {incoming.length}</p>
                  <ul className="m-0 flex list-none flex-col gap-px p-0">{incoming.map(renderRelation)}</ul>
                </div>
                <div>
                  <p className="m-0 mb-1 px-1 text-[11px] font-medium text-muted-foreground">{t('inspector.outgoing')} · {outgoing.length}</p>
                  <ul className="m-0 flex list-none flex-col gap-px p-0">{outgoing.map(renderRelation)}</ul>
                </div>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-px p-0">{relations.map(renderRelation)}</ul>
            )
          ) : (
            <p className="m-0 text-xs text-muted-foreground">{t('inspector.noRelations')}</p>
          )}
        </section>

        {writable && <ConnectSection key={`connect-${node.id}`} node={node} byId={byId} onReload={onReload} />}
        <NodeHistorySection key={`history-${node.id}`} nodeId={node.id} isStatic={isStatic} connected={connected} revision={revision} />

        {writable && <AddSection key={`add-${node.id}`} node={node} />}
        {writable && <EditSection key={`edit-${node.id}`} node={node} onReload={onReload} />}

        <Collapsible.Root key={node.id} className="mt-6">
          <Collapsible.Trigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />{t('inspector.raw')}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <pre className="mt-2 mb-0 max-h-64 overflow-auto rounded-lg border bg-secondary p-3 font-mono text-[11px] leading-[18px] text-subtle">{JSON.stringify(node, null, 2)}</pre>
          </Collapsible.Content>
        </Collapsible.Root>
        </div>
      </div>
    </aside>
  );
}

function RemoveRelation({ id }: { id: string }) {
  const { busy, locked, error, remove } = useEdgeRemoval(id);
  return <>
    <IconButton label={t('inspector.unlink')} disabled={busy || locked} onClick={remove}><Unlink /></IconButton>
    {error && <span role="alert" className="block max-w-64 text-xs text-destructive">{error}</span>}
  </>;
}

/** Describe recorded input loss, without judging the claim or reconstructing missing text. */
function InputIntegrityNotice({ record }: { record: Pick<BoardNode, 'inputTruncation'> }) {
  const entries = Object.entries(record.inputTruncation || {}).filter(([, value]) => value && Number.isSafeInteger(value.originalLength) && Number.isSafeInteger(value.storedLength) && value.originalLength > value.storedLength && value.storedLength >= 0);
  if (!entries.length) return null;
  const fieldLabels: Record<string, string> = { title: t('edit.title'), detail: t('edit.detail'), label: t('inspector.relationLabel') };
  return <section role="note" aria-label={t('inspector.inputTruncated')} className="mb-3 rounded-lg border bg-secondary/50 p-3 text-xs leading-5 text-foreground">
    <p className="m-0">{t('inspector.inputTruncated')}</p>
    <ul className="m-0 mt-1 list-inside list-disc p-0">{entries.map(([field, value]) => <li key={field}>{t('inspector.inputLengths', { field: fieldLabels[field] || field, original: value.originalLength, stored: value.storedLength })}</li>)}</ul>
  </section>;
}


function SourceSection({ node }: { node: BoardNode }) {
  const location = sourceLocation(node);
  const tags = Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  if (!location && !tags.length && !node.session && !node.updatedBy) return null;
  const copyLocation = async () => {
    try {
      await navigator.clipboard.writeText(location);
      setCopied(true);
      setError('');
    } catch {
      setError(t('app.clipboardFailed'));
    }
  };
  return <section className="mt-5 flex flex-col gap-2" aria-label={t('source.heading')}>
    <h3 className="m-0 text-xs font-medium text-muted-foreground">{t('source.heading')}</h3>
    {location && <div className="flex items-start gap-2 rounded-md border bg-secondary/30 p-2">
      <code
        className="min-w-0 flex-1 cursor-pointer whitespace-pre-wrap break-all text-[11px] transition-colors hover:text-foreground"
        aria-label={t('source.location')}
        onClick={() => { if (!window.getSelection()?.toString()) void copyLocation(); }}
      >{location}</code>
      <button
        type="button"
        aria-label={copied ? t('common.copied') : t('source.copy')}
        title={copied ? t('common.copied') : t('source.copy')}
        onClick={() => { void copyLocation(); }}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied
          ? <><Check className="size-3.5 text-live" /><span className="text-[11px] font-medium text-live">{t('common.copied')}</span></>
          : <Copy className="size-3.5" />}
      </button>
    </div>}
    {tags.length > 0 && <div aria-label={t('source.tags')} className="flex flex-wrap gap-1">{tags.map((tag, i) => <span key={`${tag}-${i}`} className="max-w-full rounded border px-1.5 py-0.5 text-[11px] text-subtle [overflow-wrap:anywhere]">{tag}</span>)}</div>}
    {typeof node.session === 'string' && node.session && <p className="m-0 break-all text-[11px] text-muted-foreground">{t('source.session')} · {node.session}</p>}
    {typeof node.updatedBy === 'string' && node.updatedBy && <p className="m-0 break-all text-[11px] text-muted-foreground">{t('source.updatedBy')} · {node.updatedBy}</p>}
    {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
  </section>;
}
