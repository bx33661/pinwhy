import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, ExternalLink, Send, X } from 'lucide-react';
import * as api from '../../../api';
import { formatTime, relationLabel, typeLabel } from '../../../graph';
import { confidenceLabel, severityLabel, statusLabel } from '../../../presentation';
import { sourceLocation } from '../../../research-state';
import { useSessionWrite } from '../../../session-drafts';
import type { BoardNode, UltraSlice } from '../../../types';
import { t } from '../../../i18n';
import type { UltraModel, UltraOrbitalBar, UltraSectorView } from '../../ultra';

type Props = {
  open: boolean;
  viewMode: 'sector' | 'node' | 'gaps' | null;
  sector: UltraSectorView | null;
  selectedBarId: string | null;
  selectedNode: BoardNode | null;
  model: UltraModel;
  writable: boolean;
  onClose: () => void;
  onBackToSector: () => void;
  onSelectSector: (sector: string) => void;
  onSelectBar: (bar: UltraOrbitalBar) => void;
  onSelectNode: (nodeId: string, sector?: string) => void;
  onInspectFullNode: (nodeId: string) => void;
  onReload: () => Promise<void>;
};

const SLICE_DOT_TONE: Record<string, string> = {
  pending: 'border-[var(--u-tick)] bg-transparent',
  stale: 'border-[var(--u-crimson)] bg-[var(--u-crimson)]/25',
  shallow: 'border-[var(--u-amber)] bg-[var(--u-amber)]/35',
  cleared: 'border-[var(--u-mint)] bg-[var(--u-mint)]',
  flagged: 'border-[var(--u-crimson)] bg-[var(--u-crimson)]',
};

const WAFER_SEG_TONE: Record<string, string> = {
  pending: 'var(--u-tick)',
  stale: 'var(--u-crimson)',
  shallow: 'var(--u-amber)',
  cleared: 'var(--u-mint)',
  flagged: 'var(--u-crimson)',
};

function renderInlineCode(text: string): ReactNode {
  if (!text.includes('`')) return text;
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    part.length >= 3 && part.startsWith('`') && part.endsWith('`')
      ? <code key={index} className="ultra-mono rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-1 py-0.5 text-[11.5px] text-[var(--u-ink)]">{part.slice(1, -1)}</code>
      : part
  ));
}

function shallowReasonText(reason: string | null | undefined, unverifiedDeps?: string[], humanFollowups?: string[]): string {
  if (reason === 'unverified-dependency') {
    return `${t('ultra.drawer.reasonUnverifiedDep')} (${(unverifiedDeps || []).join(', ')})`;
  }
  if (reason === 'human-followup') {
    const suffix = humanFollowups?.length ? ` (${humanFollowups.join(', ')})` : '';
    return `${t('ultra.drawer.reasonHumanFollowup')}${suffix}`;
  }
  return t('ultra.drawer.reasonInsufficient');
}

function HumanInjectionForm({
  targetNode,
  sector,
  sectorSlices,
  selectedBarId,
  goalId,
  writable,
  onReload,
  onSelectNode,
}: {
  targetNode?: BoardNode;
  sector?: UltraSectorView;
  sectorSlices?: UltraSlice[];
  selectedBarId?: string | null;
  goalId?: string | null;
  writable: boolean;
  onReload: () => Promise<void>;
  onSelectNode: (nodeId: string, sectorName?: string) => void;
}) {
  const [nodeType, setNodeType] = useState<'question' | 'observation' | 'hint'>('question');
  const [relation, setRelation] = useState<'related-to' | 'contradicts' | 'supports'>('related-to');
  const [sliceTargetId, setSliceTargetId] = useState<string>(() => {
    const matched = sectorSlices?.find((s) => s.id === selectedBarId);
    return matched?.id || sectorSlices?.[0]?.id || '__sector__';
  });
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetNode && sectorSlices) {
      const matched = sectorSlices.find((s) => s.id === selectedBarId);
      setSliceTargetId(matched?.id || sectorSlices[0]?.id || '__sector__');
    }
  }, [targetNode, selectedBarId, sector?.sector, sectorSlices]);

  const activeSlice = !targetNode && sliceTargetId !== '__sector__'
    ? sectorSlices?.find((s) => s.id === sliceTargetId) ?? null
    : null;
  const scopeKey = targetNode
    ? `node:${targetNode.id}`
    : activeSlice
      ? `slice:${activeSlice.id}`
      : `sector:${sector?.sector || 'unscoped'}`;
  const operation = useSessionWrite(`ultra-inject:${scopeKey}`);

  useEffect(() => {
    setSentId(null);
    setLocalError(null);
  }, [scopeKey]);

  if (!writable) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || operation.locked || operation.busy) return;
    setLocalError(null);
    setSentId(null);
    try {
      const result = targetNode
        ? await api.addNode({
            type: nodeType,
            title: title.trim(),
            ...(detail.trim() ? { detail: detail.trim() } : {}),
            target: targetNode.id,
            relation,
            status: 'open',
          }, operation)
        : activeSlice
          ? await api.addNode({
              type: nodeType,
              title: title.trim(),
              ...(detail.trim() ? { detail: detail.trim() } : {}),
              status: 'open',
              at: `${activeSlice.path}:${activeSlice.startLine}`,
              tags: [`component=${activeSlice.sector}`, `slice=${activeSlice.id}`],
              ...(goalId ? { target: goalId, relation: 'related-to' } : {}),
            }, operation)
          : await api.addNode({
              type: nodeType,
              title: title.trim(),
              ...(detail.trim() ? { detail: detail.trim() } : {}),
              status: 'open',
              tags: sector ? [`component=${sector.sector}`] : undefined,
              ...(goalId ? { target: goalId, relation: 'related-to' } : {}),
            }, operation);
      setTitle('');
      setDetail('');
      setSentId(result.node.id);
      void onReload().catch(() => {});
    } catch (error) {
      setLocalError(operation.error ? null : error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 border-t border-[var(--u-line)] pt-4" data-ultra-inject-form>
      <div className="ultra-section-title mb-3">{t('ultra.inject.title')}</div>

      {!targetNode && sector && (
        <div className="mb-2.5 flex flex-col gap-1 text-[11px] text-[var(--u-dim)]">
          <span>{t('ultra.inject.targetLabel')}</span>
          {sectorSlices && sectorSlices.length > 0 ? (
            <select
              value={sliceTargetId}
              onChange={(e) => setSliceTargetId(e.target.value)}
              disabled={operation.locked || operation.busy}
              aria-label={t('ultra.inject.targetLabel')}
              className="ultra-mono h-8 rounded border border-[var(--u-cyan)]/40 bg-[var(--u-raise)] px-2 text-xs text-[var(--u-cyan)] outline-none focus:border-[var(--u-cyan)]"
            >
              {sectorSlices.map((sl) => (
                <option key={sl.id} value={sl.id}>
                  {t('ultra.inject.sliceTarget', { id: sl.id, range: `${sl.path}:${sl.startLine}-${sl.endLine}` })}
                </option>
              ))}
              <option value="__sector__">
                {t('ultra.inject.wholeSector', { sector: sector.sector })}
              </option>
            </select>
          ) : (
            <div className="ultra-mono rounded border border-[var(--u-cyan)]/35 bg-[var(--u-cyan)]/8 px-2 py-1 text-xs text-[var(--u-cyan)]">
              {t('ultra.inject.wholeSector', { sector: sector.sector })}
            </div>
          )}
        </div>
      )}

      <div className={`mb-2.5 grid gap-2 ${targetNode ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <label className="flex flex-col gap-1 text-[11px] text-[var(--u-dim)]">
          <span>{t('ultra.inject.type')}</span>
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as 'question' | 'observation' | 'hint')}
            disabled={operation.locked || operation.busy}
            className="h-8 rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-2 text-xs text-[var(--u-ink)] outline-none focus:border-[var(--u-mint)]"
          >
            <option value="question">question · {typeLabel('question')}</option>
            <option value="observation">observation · {typeLabel('observation')}</option>
            <option value="hint">hint · {typeLabel('hint')}</option>
          </select>
        </label>
        {targetNode && (
          <label className="flex flex-col gap-1 text-[11px] text-[var(--u-dim)]">
            <span>{t('ultra.inject.rel')}</span>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as 'related-to' | 'contradicts' | 'supports')}
              disabled={operation.locked || operation.busy}
              className="h-8 rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-2 text-xs text-[var(--u-ink)] outline-none focus:border-[var(--u-mint)]"
            >
              <option value="related-to">related-to</option>
              <option value="contradicts">contradicts</option>
              <option value="supports">supports</option>
            </select>
          </label>
        )}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('ultra.inject.placeholder')}
        disabled={operation.locked || operation.busy}
        className="mb-2 w-full rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-2.5 py-2 text-xs text-[var(--u-ink)] placeholder:text-[var(--u-dim)] outline-none focus:border-[var(--u-mint)]"
      />
      <textarea
        rows={2}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={t('ultra.inject.detailPlaceholder')}
        disabled={operation.locked || operation.busy}
        className="mb-2.5 w-full resize-y rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-2.5 py-2 text-xs text-[var(--u-ink)] placeholder:text-[var(--u-dim)] outline-none focus:border-[var(--u-mint)]"
      />
      {(operation.error || localError) && (
        <p role="alert" className="mb-2 text-xs text-[var(--u-crimson)]">{operation.error || localError}</p>
      )}
      {sentId && (
        <p role="status" className="mb-2 flex items-center justify-between text-xs text-[var(--u-mint)]">
          <span>{t('ultra.inject.sent')}</span>
          <button type="button" onClick={() => onSelectNode(sentId, sector?.sector)} className="ultra-mono underline hover:text-[var(--u-ink)]">
            {sentId}
          </button>
        </p>
      )}
      <button
        type="submit"
        disabled={!title.trim() || operation.busy || operation.locked}
        className="ultra-btn ultra-btn-mint w-full justify-center disabled:opacity-45"
      >
        <Send className="size-3.5" />
        <span>{t('ultra.inject.submit')}</span>
      </button>
    </form>
  );
}

export function UltraDrawer({
  open,
  viewMode,
  sector,
  selectedBarId,
  selectedNode,
  model,
  writable,
  onClose,
  onBackToSector,
  onSelectSector,
  onSelectBar,
  onSelectNode,
  onInspectFullNode,
  onReload,
}: Props) {
  const sectorSlices: UltraSlice[] = sector
    ? sector.bars.map((b) => b.slice).filter((s): s is UltraSlice => Boolean(s))
    : [];
  const sectorNodes: BoardNode[] = sector
    ? sector.nodeIds.map((id) => model.byId.get(id)).filter((n): n is BoardNode => Boolean(n))
    : [];
  const sectorChords = sector
    ? model.chords.filter((c) => c.sourceSector === sector.sector || c.targetSector === sector.sector)
    : [];

  const renderNodeView = (node: BoardNode) => {
    const loc = sourceLocation(node);
    const edges = model.allEdges.filter((e) => e.from === node.id || e.to === node.id);
    const tags = Array.isArray(node.tags) ? node.tags.filter((item): item is string => typeof item === 'string') : [];
    const nodeSec = model.nodeSectorMap.get(node.id);
    const isHuman = node.author === 'human' || node.updatedBy === 'human';

    return (
      <div className="flex flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {(sector || nodeSec) ? (
            <button
              type="button"
              onClick={onBackToSector}
              className="ultra-mono inline-flex items-center gap-1 text-[11px] text-[var(--u-dim)] transition-colors hover:text-[var(--u-mint)]"
            >
              <ArrowLeft className="size-3" />
              <span>{t('ultra.drawer.backSector')} ({sector?.sector || nodeSec})</span>
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={() => onInspectFullNode(node.id)}
            className="ultra-btn h-7 px-2 text-[11px]"
          >
            <ExternalLink className="size-3" />
            <span>{t('ultra.drawer.inspectFull')}</span>
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="ultra-mono rounded border border-[var(--u-mint)]/40 bg-[var(--u-mint)]/10 px-1.5 py-0.5 text-[var(--u-mint)]">{node.id}</span>
          <span className="rounded border border-[var(--u-line)] px-1.5 py-0.5 text-[var(--u-ink)]">{typeLabel(node.type)}</span>
          {node.status && <span className="rounded border border-[var(--u-line)] px-1.5 py-0.5 text-[var(--u-dim)]">{statusLabel(node.status)}</span>}
          {node.severity && (
            <span className="rounded border border-[var(--u-crimson)]/45 bg-[var(--u-crimson)]/10 px-1.5 py-0.5 text-[var(--u-crimson)]">
              {severityLabel(node.severity)}
            </span>
          )}
          {node.confidence && <span className="rounded border border-[var(--u-line)] px-1.5 py-0.5 text-[var(--u-amber)]">{confidenceLabel(node.confidence)}</span>}
          {isHuman && <span className="ultra-mono rounded border border-[var(--u-cyan)]/45 bg-[var(--u-cyan)]/10 px-1.5 py-0.5 text-[10px] text-[var(--u-cyan)]">HUMAN</span>}
        </div>

        <h2 className="m-0 text-base font-medium leading-snug text-[var(--u-ink)]">{node.title}</h2>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--u-line)] pt-3 text-xs">
          <div>
            <dt className="ultra-mono text-[10px] uppercase tracking-wider text-[var(--u-dim)]">{t('source.location')}</dt>
            <dd className="ultra-mono mt-0.5 break-all text-[11.5px] text-[var(--u-ink)]">{loc || '—'}</dd>
          </div>
          <div>
            <dt className="ultra-mono text-[10px] uppercase tracking-wider text-[var(--u-dim)]">Author</dt>
            <dd className="ultra-mono mt-0.5 text-[11.5px] text-[var(--u-ink)]">{String(node.updatedBy || node.author || 'agent:primary')}</dd>
          </div>
          {tags.length > 0 && (
            <div className="col-span-2">
              <dt className="ultra-mono text-[10px] uppercase tracking-wider text-[var(--u-dim)]">{t('source.tags')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span key={tag} className="ultra-mono rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-1.5 py-0.5 text-[10.5px] text-[var(--u-dim)]">{tag}</span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {node.detail && (
          <div className="mt-4 border-t border-[var(--u-line)] pt-3">
            <div className="ultra-section-title mb-2">Detail</div>
            <p className="m-0 whitespace-pre-wrap border-l-2 border-[var(--u-mint)] pl-3 text-xs leading-relaxed text-[var(--u-ink-2)] [overflow-wrap:anywhere]">
              {renderInlineCode(node.detail)}
            </p>
          </div>
        )}

        {edges.length > 0 && (
          <div className="mt-4 border-t border-[var(--u-line)] pt-3">
            <div className="ultra-section-title mb-2">{t('ultra.drawer.chords')} ({edges.length})</div>
            <ul className="m-0 list-none p-0">
              {edges.map((edge) => {
                const incoming = edge.to === node.id;
                const peerId = incoming ? edge.from : edge.to;
                const peer = model.byId.get(peerId);
                const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
                return (
                  <li key={edge.id} className="ultra-row py-2">
                    <button
                      type="button"
                      onClick={() => onSelectNode(peerId, model.nodeSectorMap.get(peerId))}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--u-mint)]" />
                      <span className="min-w-0 flex-1">
                        <span className="ultra-mono flex items-center gap-1.5 text-[10.5px] text-[var(--u-dim)]">
                          <span className="text-[var(--u-mint)]">{relationLabel(edge.kind)}</span>
                          <span>·</span>
                          <span>{peerId}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--u-ink)]">{peer?.title || peerId}</span>
                        {edge.label && <span className="mt-0.5 block text-[11px] text-[var(--u-dim)]">{edge.label}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <HumanInjectionForm targetNode={node} writable={writable} onReload={onReload} onSelectNode={(id) => onSelectNode(id)} />
      </div>
    );
  };

  const renderSectorView = (sec: UltraSectorView) => {
    const ratio = sec.totalSlices > 0 ? Math.round((sec.coveredSlices / sec.totalSlices) * 100) : 0;
    const blindCount = sec.pendingSlices + sec.staleSlices + sec.shallowSlices;

    return (
      <div className="flex flex-col">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="ultra-mono text-[11px] uppercase tracking-wider text-[var(--u-dim)]">Sector Stratum #{String(sec.index + 1).padStart(2, '0')}</span>
          <span className="ultra-mono text-xs text-[var(--u-mint)]">{ratio}%</span>
        </div>
        <h2 className="ultra-mono m-0 text-base font-medium tracking-tight text-[var(--u-ink)]">{sec.sector}</h2>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--u-dim)]">
            <span>{t('ultra.drawer.coverage')}</span>
            <span className="ultra-mono">{sec.coveredSlices}/{sec.totalSlices}</span>
          </div>
          <div className="ultra-wafer-strip h-2.5">
            {sec.bars.map((bar) => (
              <button
                key={bar.id}
                type="button"
                title={`${bar.label} · ${t(`ultra.sliceStatus.${bar.status}`)}`}
                onClick={() => onSelectBar(bar)}
                className="ultra-wafer-seg cursor-pointer border-0 p-0"
                style={{
                  background: WAFER_SEG_TONE[bar.status] || 'var(--u-tick)',
                  opacity: bar.status === 'pending' ? 0.45 : selectedBarId === bar.id ? 1 : 0.88,
                }}
              />
            ))}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-2">
          {[
            [t('ultra.metric.slices'), sec.totalSlices, 'var(--u-ink)'],
            [t('ultra.metric.cleared'), sec.coveredSlices, 'var(--u-mint)'],
            [t('ultra.metric.blind'), blindCount, blindCount > 0 ? 'var(--u-amber)' : 'var(--u-dim)'],
            [t('ultra.metric.findings'), sec.findingsCount, sec.findingsCount > 0 ? 'var(--u-crimson)' : 'var(--u-dim)'],
          ].map(([label, val, color]) => (
            <div key={String(label)} className="border-t border-[var(--u-line)] pt-2">
              <dt className="text-[10.5px] text-[var(--u-dim)]">{label}</dt>
              <dd className="ultra-mono mt-0.5 text-base" style={{ color: String(color) }}>{val}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <div className="ultra-section-title mb-2">{t('ultra.drawer.slices')} ({sectorSlices.length})</div>
          {sectorSlices.length === 0 ? (
            <p className="m-0 py-2 text-xs text-[var(--u-dim)]">{t('ultra.drawer.noSlices')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {sectorSlices.map((slice) => {
                const active = selectedBarId === slice.id;
                const barForSlice = sec.bars.find((b) => b.id === slice.id);
                return (
                  <li key={slice.id} data-active={active ? 'true' : undefined} className="ultra-row py-2.5">
                    <div
                      role={barForSlice ? 'button' : undefined}
                      tabIndex={barForSlice ? 0 : undefined}
                      onClick={() => barForSlice && onSelectBar(barForSlice)}
                      onKeyDown={(e) => {
                        if (barForSlice && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onSelectBar(barForSlice);
                        }
                      }}
                      className={`flex items-start gap-2.5 ${barForSlice ? 'cursor-pointer' : ''}`}
                    >
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full border ${SLICE_DOT_TONE[slice.effectiveStatus] || SLICE_DOT_TONE.pending}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="ultra-mono text-xs text-[var(--u-ink)]">
                            {slice.path}:{slice.startLine}-{slice.endLine}
                          </span>
                          <span className="ultra-mono text-[10.5px] text-[var(--u-dim)]">
                            {slice.id} · {slice.lines}L · {t(`ultra.sliceStatus.${slice.effectiveStatus}`)}
                          </span>
                        </div>
                        {slice.note && <p className="mt-1 mb-0 text-xs leading-relaxed text-[var(--u-dim)]">{slice.note}</p>}
                        {slice.shallowReason && (
                          <p className="mt-1 mb-0 text-[11px] text-[var(--u-amber)]">
                            {t('ultra.drawer.shallowReason')}:{' '}
                            {shallowReasonText(slice.shallowReason, slice.unverifiedDependencies, slice.humanFollowups)}
                          </p>
                        )}
                        {((slice.refs && slice.refs.length > 0) || (slice.dependsOn && slice.dependsOn.length > 0) || (slice.humanFollowups && slice.humanFollowups.length > 0)) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(slice.humanFollowups || []).map((hid) => (
                              <button
                                key={`hf:${hid}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(hid, sec.sector);
                                }}
                                className="ultra-mono rounded border border-[var(--u-cyan)]/45 bg-[var(--u-cyan)]/10 px-1.5 py-0.5 text-[10.5px] text-[var(--u-cyan)] hover:border-[var(--u-cyan)]"
                              >
                                HUMAN · {hid}
                              </button>
                            ))}
                            {(slice.refs || []).map((refId) => (
                              <button
                                key={refId}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(refId, sec.sector);
                                }}
                                className="ultra-mono rounded border border-[var(--u-mint)]/45 bg-[var(--u-mint)]/10 px-1.5 py-0.5 text-[10.5px] text-[var(--u-mint)] hover:border-[var(--u-mint)]"
                              >
                                {refId}
                              </button>
                            ))}
                            {(slice.dependsOn || []).map((depId) => (
                              <button
                                key={depId}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const depSec = model.sliceSectorMap.get(depId);
                                  if (depSec) onSelectSector(depSec);
                                }}
                                className="ultra-mono rounded border border-[var(--u-line)] bg-[var(--u-raise)] px-1.5 py-0.5 text-[10.5px] text-[var(--u-dim)] hover:text-[var(--u-ink)]"
                              >
                                {t('ultra.drawer.dependsOn')} {depId}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <HumanInjectionForm
          sector={sec}
          sectorSlices={sectorSlices}
          selectedBarId={selectedBarId}
          goalId={model.goal?.id ?? null}
          writable={writable}
          onReload={onReload}
          onSelectNode={onSelectNode}
        />

        <div className="mt-5">
          <div className="ultra-section-title mb-2">{t('ultra.drawer.nodes')} ({sectorNodes.length})</div>
          {sectorNodes.length === 0 ? (
            <p className="m-0 py-2 text-xs text-[var(--u-dim)]">{t('ultra.drawer.noNodes')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {sectorNodes.map((node) => (
                <li key={node.id} className="ultra-row py-2">
                  <button
                    type="button"
                    onClick={() => onSelectNode(node.id, sec.sector)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="ultra-mono flex items-center gap-1.5 text-[10.5px] text-[var(--u-dim)]">
                        <span className="text-[var(--u-mint)]">{node.id}</span>
                        <span>{typeLabel(node.type)}</span>
                        {node.status && <span>· {statusLabel(node.status)}</span>}
                        {node.severity && <span className="text-[var(--u-crimson)]">· {severityLabel(node.severity)}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--u-ink)]">{node.title}</span>
                    </span>
                    <span className="ultra-mono shrink-0 text-[10px] text-[var(--u-dim)]">{formatTime(node.updated || node.ts)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {sectorChords.length > 0 && (
          <div className="mt-5">
            <div className="ultra-section-title mb-2">{t('ultra.drawer.chords')} ({sectorChords.length})</div>
            <ul className="m-0 list-none p-0">
              {sectorChords.map((chord) => {
                const peerSec = chord.sourceSector === sec.sector ? chord.targetSector : chord.sourceSector;
                return (
                  <li key={chord.id} className="ultra-row py-2">
                    <button
                      type="button"
                      onClick={() => onSelectSector(peerSec)}
                      className="flex w-full items-center justify-between gap-2 text-left text-xs"
                    >
                      <span className="ultra-mono text-[11px]" style={{ color: chord.isAwakened ? 'var(--u-amber)' : 'var(--u-mint)' }}>{chord.kind}</span>
                      <span className="truncate text-[var(--u-ink)]">{chord.fromId} → {chord.toId}</span>
                      <span className="ultra-mono shrink-0 text-[10.5px] text-[var(--u-dim)]">{peerSec}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderGapsView = () => {
    const { gaps } = model;
    const renderNodeList = (label: string, items: { id: string; type: string; title: string }[], tone = 'var(--u-mint)') => (
      items.length > 0 && (
        <div className="mt-4">
          <div className="ultra-section-title mb-2">{label} ({items.length})</div>
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li key={item.id} className="ultra-row py-2">
                <button
                  type="button"
                  onClick={() => onSelectNode(item.id, model.nodeSectorMap.get(item.id))}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span className="ultra-mono shrink-0 text-[11px]" style={{ color: tone }}>{item.id}</span>
                  <span className="min-w-0 flex-1 text-xs text-[var(--u-ink)]">{item.title}</span>
                  <span className="ultra-mono shrink-0 text-[10.5px] text-[var(--u-dim)]">{item.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    );

    return (
      <div className="flex flex-col">
        <span className="ultra-mono text-[11px] uppercase tracking-wider text-[var(--u-dim)]">Harness Telemetry</span>
        <h2 className="mt-1 mb-0 text-lg font-normal text-[var(--u-ink)]">{t('ultra.nav.overview')}</h2>

        <div className="ultra-mono mt-4 text-[10.5px] uppercase tracking-wider text-[var(--u-mint)]">
          {t('ultra.tier.commitments')}
        </div>

        {gaps.untrackedFiles.length > 0 && (
          <div className="mt-3">
            <div className="ultra-section-title mb-2">{t('ultra.gap.untracked')} ({gaps.untrackedFiles.length})</div>
            <ul className="m-0 list-none p-0">
              {gaps.untrackedFiles.slice(0, 24).map((file) => (
                <li key={file} className="ultra-mono border-b border-[var(--u-line)] py-1.5 text-xs text-[var(--u-amber)]">{file}</li>
              ))}
            </ul>
          </div>
        )}

        {gaps.shallowSlices.length > 0 && (
          <div className="mt-3">
            <div className="ultra-section-title mb-2">{t('ultra.gap.shallow')} ({gaps.shallowSlices.length})</div>
            <ul className="m-0 list-none p-0">
              {gaps.shallowSlices.map((item) => (
                <li key={item.id} className="ultra-row py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sec = model.sliceSectorMap.get(item.id);
                      if (sec) onSelectSector(sec);
                    }}
                    className="flex w-full flex-col gap-0.5 text-left text-xs"
                  >
                    <span className="ultra-mono text-[var(--u-amber)]">{item.id} · {item.path}:{item.startLine}-{item.endLine}</span>
                    <span className="text-[11px] text-[var(--u-dim)]">{shallowReasonText(item.reason, item.unverifiedDependencies, item.humanFollowups)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gaps.staleSlices.length > 0 && (
          <div className="mt-3">
            <div className="ultra-section-title mb-2">{t('ultra.gap.stale')} ({gaps.staleSlices.length})</div>
            <ul className="m-0 list-none p-0">
              {gaps.staleSlices.map((item) => (
                <li key={item.id} className="ultra-row py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sec = model.sliceSectorMap.get(item.id);
                      if (sec) onSelectSector(sec);
                    }}
                    className="ultra-mono block w-full text-left text-xs text-[var(--u-crimson)]"
                  >
                    {item.id} · {item.path}:{item.startLine}-{item.endLine}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {renderNodeList(t('ultra.gap.unbacked'), gaps.unbackedVerdicts, 'var(--u-crimson)')}

        <div className="ultra-mono mt-6 border-t border-[var(--u-line)] pt-4 text-[10.5px] uppercase tracking-wider text-[var(--u-cyan)]">
          {t('ultra.tier.signals')}
        </div>

        {gaps.awakenedChains.length > 0 && (
          <div className="mt-3">
            <div className="ultra-section-title mb-2">{t('ultra.gap.awakened')} ({gaps.awakenedChains.length})</div>
            <ul className="m-0 list-none p-0">
              {gaps.awakenedChains.map((chain) => (
                <li key={chain.hypothesis.id} className="ultra-row py-2">
                  <button
                    type="button"
                    onClick={() => onSelectNode(chain.hypothesis.id, model.nodeSectorMap.get(chain.hypothesis.id))}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-[var(--u-ink)]">
                      <span className="ultra-mono text-[var(--u-amber)]">{chain.hypothesis.id}</span>
                      <span className="truncate">{chain.hypothesis.title}</span>
                    </div>
                    <div className="ultra-mono mt-1 text-[10.5px] text-[var(--u-dim)]">
                      ← {chain.matches.map((m) => `${m.nodeId} (${m.via})`).join(', ')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {renderNodeList(t('ultra.metric.threads'), gaps.openThreads, 'var(--u-amber)')}
        {renderNodeList(t('ultra.gap.anomalies'), gaps.unresolvedAnomalies, 'var(--u-amber)')}
        {renderNodeList(t('ultra.gap.human'), gaps.humanSignals, 'var(--u-cyan)')}
      </div>
    );
  };

  return (
    <aside
      data-open={open ? 'true' : 'false'}
      aria-label={t('ultra.drawer.gaps')}
      className="ultra-drawer flex flex-col"
    >
      <div className="flex items-center justify-end border-b border-[var(--u-line)] px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('ultra.drawer.close')}
          className="ultra-btn h-7 px-2 text-[11px]"
        >
          <X className="size-3.5" />
          <span>Esc</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {viewMode === 'node' && selectedNode
          ? renderNodeView(selectedNode)
          : viewMode === 'sector' && sector
            ? renderSectorView(sector)
            : renderGapsView()}
      </div>
    </aside>
  );
}
