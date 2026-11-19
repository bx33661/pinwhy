import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, GitBranch, MessageSquare, ShieldAlert } from 'lucide-react';
import { t } from '../../../i18n';
import type { UltraLens, UltraModel, UltraOrbitalBar, UltraSectorView } from '../../ultra';

type HoverTip = {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  accent?: string;
  sector?: string;
  barId?: string;
};

type Props = {
  model: UltraModel;
  lens: UltraLens;
  selectedSector: string | null;
  selectedBarId: string | null;
  selectedNodeId: string | null;
  resetSignal: number;
  onSelectSector: (sector: string) => void;
  onSelectBar: (bar: UltraOrbitalBar) => void;
  onSelectNode: (nodeId: string, sector?: string) => void;
  onClearSelection: () => void;
};

const X_CALLOUT = 28;
const CALLOUT_W = 222;
const X_DIV = 258;
const X_TRACK = 274;
const TRACK_W = 536;
const X_TRACK_END = X_TRACK + TRACK_W;
const X_SOCKET = 836;
const BUS_START_X = 876;
const BUS_STEP_X = 28;

const CELLS_PER_ROW = 4;
const CELL_H = 44;
const CELL_GAP_X = 8;
const CELL_GAP_Y = 8;
const ROW_PAD_Y = 14;
const ROW_GAP_Y = 12;

const BEACON_COLOR: Record<string, string> = {
  critical: 'var(--u-crimson)',
  hot: 'var(--u-amber)',
  amber: 'var(--u-amber)',
  human: 'var(--u-cyan)',
};

const STATUS_META: Record<string, { barColor: string; stroke: string; fill: string; dash?: string }> = {
  cleared: { barColor: 'var(--u-mint)', stroke: 'rgba(102, 224, 174, 0.34)', fill: 'rgba(102, 224, 174, 0.06)' },
  flagged: { barColor: 'var(--u-crimson)', stroke: 'rgba(255, 93, 82, 0.45)', fill: 'var(--u-raise-2)' },
  pending: { barColor: 'var(--u-tick)', stroke: 'var(--u-tick)', fill: 'url(#ultra-hatch-pending)', dash: '4 3' },
  shallow: { barColor: 'var(--u-amber)', stroke: 'rgba(226, 184, 107, 0.55)', fill: 'url(#ultra-hatch-shallow)' },
  stale: { barColor: 'var(--u-crimson)', stroke: 'var(--u-crimson)', fill: 'rgba(255, 93, 82, 0.08)', dash: '5 3' },
};

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 6) return text.slice(0, Math.max(1, maxChars));
  const head = Math.ceil((maxChars - 1) * 0.55);
  const tail = Math.floor((maxChars - 1) * 0.45);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

function allocateRowWidths(items: UltraOrbitalBar[], totalW: number, gap: number): number[] {
  const n = items.length;
  if (n === 0) return [];
  if (n === 1) return [totalW];
  const avail = totalW - gap * (n - 1);
  const floorW = Math.min(96, Math.floor(avail / n));
  const spare = Math.max(0, avail - floorW * n);
  const weightSum = items.reduce((acc, item) => acc + Math.max(0.1, item.weight), 0) || 1;
  const widths = items.map((item) => floorW + Math.round((spare * Math.max(0.1, item.weight)) / weightSum));
  const diff = avail - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += diff;
  return widths;
}

type PlacedCell = {
  bar: UltraOrbitalBar;
  x: number;
  y: number;
  w: number;
  h: number;
};

type PlacedSector = {
  view: UltraSectorView;
  y: number;
  h: number;
  midY: number;
  cells: PlacedCell[];
};

function buildStrataLayout(sectors: UltraSectorView[]) {
  const placed: PlacedSector[] = [];
  let cursorY = 24;

  for (const sec of sectors) {
    const subRows: UltraOrbitalBar[][] = [];
    for (let i = 0; i < sec.bars.length; i += CELLS_PER_ROW) {
      subRows.push(sec.bars.slice(i, i + CELLS_PER_ROW));
    }
    const rowCount = Math.max(1, subRows.length);
    const satLines = sec.bars.length ? 0 : 0;
    const innerH = rowCount * CELL_H + Math.max(0, rowCount - 1) * CELL_GAP_Y + satLines;
    const rowH = Math.max(76, innerH + ROW_PAD_Y * 2);
    const cellsStartY = cursorY + Math.round((rowH - innerH) / 2);

    const cells: PlacedCell[] = [];
    subRows.forEach((rowItems, rowIdx) => {
      const widths = allocateRowWidths(rowItems, TRACK_W, CELL_GAP_X);
      let cx = X_TRACK;
      const cy = cellsStartY + rowIdx * (CELL_H + CELL_GAP_Y);
      rowItems.forEach((bar, colIdx) => {
        const w = widths[colIdx];
        cells.push({ bar, x: cx, y: cy, w, h: CELL_H });
        cx += w + CELL_GAP_X;
      });
    });

    placed.push({
      view: sec,
      y: cursorY,
      h: rowH,
      midY: cursorY + rowH / 2,
      cells,
    });
    cursorY += rowH + ROW_GAP_Y;
  }

  return {
    rows: placed,
    contentHeight: Math.max(240, cursorY + 24),
  };
}

function chamferBusPath(sx: number, sy: number, bx: number, ty: number): string {
  const dy = ty - sy;
  const dir = dy >= 0 ? 1 : -1;
  const c = Math.min(7, Math.abs(dy) / 2, Math.max(2, (bx - sx) / 3));
  if (Math.abs(dy) < 1) {
    return `M ${sx} ${sy} L ${bx} ${sy} L ${sx} ${ty}`;
  }
  return [
    `M ${sx} ${sy.toFixed(1)}`,
    `L ${(bx - c).toFixed(1)} ${sy.toFixed(1)}`,
    `L ${bx.toFixed(1)} ${(sy + dir * c).toFixed(1)}`,
    `L ${bx.toFixed(1)} ${(ty - dir * c).toFixed(1)}`,
    `L ${(bx - c).toFixed(1)} ${ty.toFixed(1)}`,
    `L ${sx} ${ty.toFixed(1)}`,
  ].join(' ');
}

function formatShallowReason(reason: string | null | undefined, deps?: string[], followups?: string[]) {
  if (reason === 'unverified-dependency') {
    return `${t('ultra.drawer.reasonUnverifiedDep')} (${(deps || []).join(', ')})`;
  }
  if (reason === 'human-followup') {
    return `${t('ultra.drawer.reasonHumanFollowup')}${followups?.length ? ` (${followups.join(', ')})` : ''}`;
  }
  return t('ultra.drawer.reasonInsufficient');
}

function GateAuditMatrix({
  model,
  onSelectSector,
  onSelectNode,
}: {
  model: UltraModel;
  onSelectSector: (sector: string) => void;
  onSelectNode: (nodeId: string, sector?: string) => void;
}) {
  const { gaps, metrics } = model;
  const pendingSlices = useMemo(
    () => model.sectors.flatMap((s) => s.bars.map((b) => b.slice).filter((sl): sl is NonNullable<typeof sl> => Boolean(sl && sl.effectiveStatus === 'pending'))),
    [model.sectors],
  );
  const c1Count = pendingSlices.length + gaps.untrackedFiles.length + gaps.diskStaleIds.length;
  const c2Count = gaps.shallowSlices.length + gaps.staleSlices.length;
  const c3Count = gaps.unbackedVerdicts.length;
  const s1Count = gaps.awakenedChains.length;
  const mergedS2 = useMemo(() => {
    const byId = new Map<string, { item: (typeof gaps.openThreads)[number]; isHuman: boolean; isOpen: boolean; isAnomaly: boolean }>();
    for (const item of gaps.humanSignals) {
      byId.set(item.id, { item, isHuman: true, isOpen: false, isAnomaly: false });
    }
    for (const item of gaps.openThreads) {
      const existing = byId.get(item.id);
      if (existing) existing.isOpen = true;
      else byId.set(item.id, { item, isHuman: item.author === 'human' || item.updatedBy === 'human', isOpen: true, isAnomaly: false });
    }
    for (const item of gaps.unresolvedAnomalies) {
      const existing = byId.get(item.id);
      if (existing) existing.isAnomaly = true;
      else byId.set(item.id, { item, isHuman: item.author === 'human' || item.updatedBy === 'human', isOpen: false, isAnomaly: true });
    }
    return [...byId.values()];
  }, [gaps.humanSignals, gaps.openThreads, gaps.unresolvedAnomalies]);
  const s2Count = mergedS2.length;

  const pct = Math.round(metrics.coverageRatio * 100);
  const commitmentBadge = (count: number, tone: 'crimson' | 'amber') => {
    if (count === 0) {
      return (
        <span className="ultra-mono inline-flex items-center gap-1 text-[10.5px] text-[var(--u-mint)]">
          <CheckCircle2 className="size-3" />
          <span>{t('ultra.gate.clear')}</span>
        </span>
      );
    }
    const color = tone === 'crimson' ? 'var(--u-crimson)' : 'var(--u-amber)';
    return (
      <span className="ultra-mono text-[11px] font-medium" style={{ color }}>
        {count} {t('ultra.gate.pendingItems')}
      </span>
    );
  };
  const signalBadge = (count: number, tone: 'amber' | 'cyan') => (
    <span
      className="ultra-mono text-[11px]"
      style={{ color: count === 0 ? 'var(--u-dim)' : tone === 'cyan' ? 'var(--u-cyan)' : 'var(--u-amber)' }}
    >
      {count} {t('ultra.gate.boundaryItems')}
    </span>
  );

  const summaryStatusText = model.allClear
    ? t('ultra.status.complete')
    : model.commitmentComplete
      ? t('ultra.commitmentsDoneBoundariesOpen', { count: s1Count + s2Count })
      : t('ultra.status.active');

  return (
    <div className="ultra-grid-bg h-full w-full overflow-y-auto px-6 py-5">
      <div className="mx-auto flex max-w-[1220px] flex-col gap-5">
        {/* Two-Tier Ledger Summary Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--u-line)] bg-[var(--u-surface)] px-4 py-3">
          <div>
            <div className="ultra-mono flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--u-dim)]">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: model.allClear ? 'var(--u-mint)' : model.commitmentComplete ? 'var(--u-cyan)' : 'var(--u-crimson)' }}
              />
              <span className={model.commitmentComplete && !model.allClear ? 'text-[var(--u-cyan)]' : undefined}>{summaryStatusText}</span>
              <span>·</span>
              <span>{pct}% ({metrics.clearedSlices}/{metrics.totalSlices})</span>
            </div>
            <p className="mt-1 mb-0 text-xs text-[var(--u-ink-2)]">{t('ultra.lensHint.gaps')}</p>
          </div>
          <div className="ultra-mono flex flex-wrap items-center gap-3.5 text-xs">
            <span>C1 <strong className={c1Count ? 'text-[var(--u-crimson)]' : 'text-[var(--u-mint)]'}>{c1Count}</strong></span>
            <span>C2 <strong className={c2Count ? 'text-[var(--u-amber)]' : 'text-[var(--u-mint)]'}>{c2Count}</strong></span>
            <span>C3 <strong className={c3Count ? 'text-[var(--u-crimson)]' : 'text-[var(--u-mint)]'}>{c3Count}</strong></span>
            <span className="h-3.5 w-px bg-[var(--u-line)]" aria-hidden="true" />
            <span>S1 <strong className={s1Count ? 'text-[var(--u-amber)]' : 'text-[var(--u-dim)]'}>{s1Count}</strong></span>
            <span>S2 <strong className={s2Count ? 'text-[var(--u-cyan)]' : 'text-[var(--u-dim)]'}>{s2Count}</strong></span>
          </div>
        </div>

        {/* Tier 1: Binding Commitments */}
        <div className="flex flex-col gap-3">
          <div className="ultra-section-title text-[var(--u-mint)]">{t('ultra.tier.commitments')}</div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* C1 */}
            <section className="border border-[var(--u-line)] bg-[var(--u-surface)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--u-line-soft)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--u-ink)]">
                  <ShieldAlert className="size-3.5 text-[var(--u-crimson)]" />
                  <span>{t('ultra.gate.c1')}</span>
                </div>
                {commitmentBadge(c1Count, 'crimson')}
              </div>
              {c1Count === 0 ? (
                <p className="mt-3 mb-0 text-xs text-[var(--u-dim)]">{t('ultra.gate.nonePending')}</p>
              ) : (
                <ul className="mt-2.5 mb-0 list-none space-y-1 p-0">
                  {pendingSlices.slice(0, 14).map((slice) => (
                    <li key={slice.id}>
                      <button
                        type="button"
                        onClick={() => onSelectSector(slice.sector)}
                        className="ultra-row flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs"
                      >
                        <span className="ultra-mono truncate text-[var(--u-ink)]">
                          <span className="mr-1.5 text-[var(--u-crimson)]">{slice.id}</span>
                          {slice.path}:{slice.startLine}-{slice.endLine}
                        </span>
                        <span className="ultra-mono shrink-0 text-[10.5px] text-[var(--u-dim)]">{slice.lines}L</span>
                      </button>
                    </li>
                  ))}
                  {gaps.untrackedFiles.slice(0, 8).map((file) => (
                    <li key={`u:${file}`} className="ultra-mono border-b border-[var(--u-line-soft)] px-2 py-1.5 text-xs text-[var(--u-amber)]">
                      + untracked · {file}
                    </li>
                  ))}
                  {gaps.diskStaleIds.map((id) => (
                    <li key={`d:${id}`} className="ultra-mono border-b border-[var(--u-line-soft)] px-2 py-1.5 text-xs text-[var(--u-crimson)]">
                      ! disk-drift · {id}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* C2 */}
            <section className="border border-[var(--u-line)] bg-[var(--u-surface)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--u-line-soft)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--u-ink)]">
                  <FileWarning className="size-3.5 text-[var(--u-amber)]" />
                  <span>{t('ultra.gate.c2')}</span>
                </div>
                {commitmentBadge(c2Count, 'amber')}
              </div>
              {c2Count === 0 ? (
                <p className="mt-3 mb-0 text-xs text-[var(--u-dim)]">{t('ultra.gate.noneShallow')}</p>
              ) : (
                <ul className="mt-2.5 mb-0 list-none space-y-1 p-0">
                  {gaps.shallowSlices.map((item) => (
                    <li key={`sh:${item.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const sec = model.sliceSectorMap.get(item.id);
                          if (sec) onSelectSector(sec);
                        }}
                        className="ultra-row flex w-full flex-col gap-0.5 px-2 py-1.5 text-left"
                      >
                        <span className="ultra-mono text-xs" style={{ color: item.reason === 'human-followup' ? 'var(--u-cyan)' : 'var(--u-amber)' }}>
                          {item.id} · {item.path}:{item.startLine}-{item.endLine}
                        </span>
                        <span className="text-[11px] text-[var(--u-dim)]">
                          {formatShallowReason(item.reason, item.unverifiedDependencies, item.humanFollowups)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {gaps.staleSlices.map((item) => (
                    <li key={`st:${item.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const sec = model.sliceSectorMap.get(item.id);
                          if (sec) onSelectSector(sec);
                        }}
                        className="ultra-row ultra-mono block w-full px-2 py-1.5 text-left text-xs text-[var(--u-crimson)]"
                      >
                        {item.id} · stale · {item.path}:{item.startLine}-{item.endLine}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* C3 */}
            <section className="border border-[var(--u-line)] bg-[var(--u-surface)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--u-line-soft)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--u-ink)]">
                  <AlertTriangle className="size-3.5 text-[var(--u-crimson)]" />
                  <span>{t('ultra.gate.c3')}</span>
                </div>
                {commitmentBadge(c3Count, 'crimson')}
              </div>
              {c3Count === 0 ? (
                <p className="mt-3 mb-0 text-xs text-[var(--u-dim)]">{t('ultra.gate.noneUnbacked')}</p>
              ) : (
                <ul className="mt-2.5 mb-0 list-none space-y-1 p-0">
                  {gaps.unbackedVerdicts.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectNode(item.id, model.nodeSectorMap.get(item.id))}
                        className="ultra-row flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
                      >
                        <span className="ultra-mono text-[var(--u-crimson)]">{item.id}</span>
                        <span className="min-w-0 flex-1 truncate text-[var(--u-ink)]">{item.title}</span>
                        <span className="ultra-mono text-[10.5px] text-[var(--u-dim)]">{item.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Tier 2: Review Signals & Honest Open Boundaries */}
        <div className="flex flex-col gap-3">
          <div className="ultra-section-title text-[var(--u-cyan)]">{t('ultra.tier.signals')}</div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* S1: Awakened Chains */}
            <section className="border border-[var(--u-line)] bg-[var(--u-surface)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--u-line-soft)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--u-ink)]">
                  <GitBranch className="size-3.5 text-[var(--u-amber)]" />
                  <span>{t('ultra.gate.s1')}</span>
                </div>
                {signalBadge(s1Count, 'amber')}
              </div>
              {s1Count === 0 ? (
                <p className="mt-3 mb-0 text-xs text-[var(--u-dim)]">{t('ultra.gate.noneAwakened')}</p>
              ) : (
                <ul className="mt-2.5 mb-0 list-none space-y-2 p-0">
                  {gaps.awakenedChains.map((chain) => (
                    <li key={chain.hypothesis.id} className="border border-[var(--u-amber)]/30 bg-[var(--u-raise)] p-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {chain.matches.map((m) => (
                          <button
                            key={m.nodeId}
                            type="button"
                            onClick={() => onSelectNode(m.nodeId, model.nodeSectorMap.get(m.nodeId))}
                            className="ultra-btn h-6 border-[var(--u-amber)]/45 px-2 text-[11px] text-[var(--u-amber)]"
                          >
                            <span className="ultra-mono">{m.nodeId}</span>
                            <span className="max-w-[180px] truncate">{m.title}</span>
                          </button>
                        ))}
                        <span className="ultra-mono inline-flex items-center gap-1 text-[10.5px] text-[var(--u-amber)]">
                          <ArrowRight className="size-3" />
                          {chain.matches.map((m) => m.via).join(', ')}
                          <ArrowRight className="size-3" />
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectNode(chain.hypothesis.id, model.nodeSectorMap.get(chain.hypothesis.id))}
                          className="ultra-btn h-6 border-[var(--u-mint)]/45 px-2 text-[11px] text-[var(--u-ink)]"
                        >
                          <span className="ultra-mono text-[var(--u-amber)]">{chain.hypothesis.id}</span>
                          <span className="max-w-[220px] truncate">{chain.hypothesis.title}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* S2: Human Signals, Open Threads & Anomalies */}
            <section className="border border-[var(--u-line)] bg-[var(--u-surface)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--u-line-soft)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--u-ink)]">
                  <MessageSquare className="size-3.5 text-[var(--u-cyan)]" />
                  <span>{t('ultra.gate.s2')}</span>
                </div>
                {signalBadge(s2Count, 'cyan')}
              </div>
              {s2Count === 0 ? (
                <p className="mt-3 mb-0 text-xs text-[var(--u-dim)]">{t('ultra.gate.noneThreads')}</p>
              ) : (
                <ul className="mt-2.5 mb-0 list-none space-y-1 p-0">
                  {mergedS2.map(({ item, isHuman, isOpen, isAnomaly }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectNode(item.id, model.nodeSectorMap.get(item.id))}
                        className="ultra-row flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
                      >
                        {isHuman && (
                          <span className="ultra-mono rounded border border-[var(--u-cyan)]/45 bg-[var(--u-cyan)]/10 px-1 py-0.2 text-[10px] text-[var(--u-cyan)]">HUMAN</span>
                        )}
                        {isAnomaly && (
                          <span className="ultra-mono rounded border border-[var(--u-amber)]/45 bg-[var(--u-amber)]/10 px-1 py-0.2 text-[10px] text-[var(--u-amber)]">ANOMALY</span>
                        )}
                        <span className="ultra-mono" style={{ color: isHuman ? 'var(--u-cyan)' : 'var(--u-amber)' }}>{item.id}</span>
                        <span className="min-w-0 flex-1 truncate text-[var(--u-ink)]">{item.title}</span>
                        <span className="ultra-mono shrink-0 text-[10.5px] text-[var(--u-dim)]">
                          {item.type}{isOpen ? ` · ${item.status || 'open'}` : item.status ? ` · ${item.status}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UltraTraceMatrix({
  model,
  lens,
  selectedSector,
  selectedBarId,
  selectedNodeId,
  resetSignal,
  onSelectSector,
  onSelectBar,
  onSelectNode,
  onClearSelection,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<HoverTip | null>(null);
  const [hoveredChordId, setHoveredChordId] = useState<string | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [resetSignal, lens]);

  const layout = useMemo(() => buildStrataLayout(model.sectors), [model.sectors]);
  const sectorYMap = useMemo(
    () => new Map(layout.rows.map((r) => [r.view.sector, r])),
    [layout.rows],
  );

  const labelMarginX = BUS_START_X + Math.max(2, model.busLaneCount) * BUS_STEP_X + 18;
  const viewW = Math.max(1140, labelMarginX + 150);

  const activeSector = hover?.sector ?? selectedSector ?? (selectedNodeId ? model.nodeSectorMap.get(selectedNodeId) ?? null : null);

  const connectedSectors = useMemo(() => {
    if (!activeSector) return null;
    const set = new Set<string>([activeSector]);
    for (const chord of model.chords) {
      if (chord.sourceSector === activeSector) set.add(chord.targetSector);
      if (chord.targetSector === activeSector) set.add(chord.sourceSector);
    }
    return set;
  }, [activeSector, model.chords]);

  const busItems = useMemo(() => {
    const items = model.chords
      .map((chord, idx) => {
        const srcRow = sectorYMap.get(chord.sourceSector);
        const dstRow = sectorYMap.get(chord.targetSector);
        if (!srcRow || !dstRow) return null;
        const touchesActive = activeSector
          ? chord.sourceSector === activeSector || chord.targetSector === activeSector
          : false;
        const touchesNode = selectedNodeId
          ? chord.sourceNodeId === selectedNodeId || chord.targetNodeId === selectedNodeId
          : false;
        const isChordHovered = hoveredChordId === chord.id;
        const hot = touchesActive || touchesNode || isChordHovered || Boolean(chord.isAwakened && lens === 'chains');
        const dimmed = Boolean(activeSector) && !touchesActive;
        const pinOffset = ((idx % 3) - 1) * 6;
        const sy = srcRow.midY + pinOffset;
        const ty = dstRow.midY - pinOffset;
        const bx = BUS_START_X + chord.laneIndex * BUS_STEP_X;
        const pathD = chamferBusPath(X_SOCKET, sy, bx, ty);
        const stroke = chord.isAwakened
          ? 'var(--u-amber)'
          : chord.kind === 'contradicts'
            ? 'var(--u-crimson)'
            : hot
              ? 'var(--u-mint)'
              : chord.isChain
                ? '#3c574d'
                : 'var(--u-tick)';
        const opacity = dimmed ? 0.12 : hot ? 0.96 : lens === 'chains' ? 0.8 : 0.62;
        const showLabel = !dimmed && (lens === 'chains' || isChordHovered || touchesActive);
        return {
          chord,
          sy,
          ty,
          bx,
          pathD,
          stroke,
          opacity,
          hot,
          showLabel,
          idealY: (sy + ty) / 2,
          placedLabelY: (sy + ty) / 2,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const labeled = items
      .filter((item) => item.showLabel)
      .sort((a, b) => a.idealY - b.idealY || a.chord.laneIndex - b.chord.laneIndex);
    let prevY = -Infinity;
    for (const item of labeled) {
      const y = Math.max(24, item.idealY, prevY + 20);
      item.placedLabelY = y;
      prevY = y;
    }
    return items;
  }, [model.chords, sectorYMap, activeSector, selectedNodeId, hoveredChordId, lens]);

  const maxLabelY = busItems.reduce((m, item) => (item.showLabel ? Math.max(m, item.placedLabelY) : m), 0);
  const viewH = Math.max(520, layout.contentHeight, maxLabelY + 28);
  const centerYOffset = layout.contentHeight < viewH ? Math.round((viewH - layout.contentHeight) / 2) : 0;

  if (lens === 'gaps') {
    return (
      <GateAuditMatrix
        model={model}
        onSelectSector={onSelectSector}
        onSelectNode={onSelectNode}
      />
    );
  }

  const cellOpacity = (bar: UltraOrbitalBar, sec: UltraSectorView): number => {
    if (!bar.matchesFilter) return 0.14;
    if (connectedSectors && !connectedSectors.has(sec.sector) && sec.sector !== activeSector) return 0.24;
    if (activeSector && sec.sector !== activeSector && (!selectedBarId || selectedBarId !== bar.id)) {
      return 0.42;
    }
    if (lens === 'chains') {
      const hasChainTouch = bar.beacons.some((b) => b.tone === 'amber' || b.tone === 'critical' || b.tone === 'hot') ||
        Boolean(bar.slice?.dependsOn?.length);
      return hasChainTouch ? 1 : 0.28;
    }
    return 1;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.09 : 0.92;
    setTransform((prev) => {
      const nextScale = Math.max(0.55, Math.min(2.8, Number((prev.scale * factor).toFixed(3))));
      if (nextScale === prev.scale || !hostRef.current) return prev;
      const rect = hostRef.current.getBoundingClientRect();
      const cx = event.clientX - (rect.left + rect.width / 2);
      const cy = event.clientY - (rect.top + rect.height / 2);
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  };

  return (
    <div
      ref={hostRef}
      className="ultra-grid-bg relative flex h-full w-full select-none items-center justify-center overflow-hidden"
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest('[data-ultra-interactive]')) return;
        setTransform({ x: 0, y: 0, scale: 1 });
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest('[data-ultra-interactive]')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          baseX: transform.x,
          baseY: transform.y,
          moved: false,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        setTransform((prev) => ({ ...prev, x: drag.baseX + dx, y: drag.baseY + dy }));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        if (!drag.moved && !(event.target as Element).closest('[data-ultra-interactive]')) {
          onClearSelection();
        }
      }}
    >
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="h-full w-full max-w-[1360px] overflow-visible"
        role="img"
        aria-label={t('ultra.aria')}
      >
        <defs>
          <pattern id="ultra-hatch-pending" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--u-surface)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(108, 127, 120, 0.26)" strokeWidth="1.5" />
          </pattern>
          <pattern id="ultra-hatch-shallow" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(226, 184, 107, 0.06)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(226, 184, 107, 0.32)" strokeWidth="1.5" />
          </pattern>
        </defs>

        <g transform={`translate(${transform.x.toFixed(1)}, ${(transform.y + centerYOffset).toFixed(1)}) scale(${transform.scale.toFixed(3)})`}>
          {/* Architectural column headers */}
          <g className="ultra-mono" fontSize={10} fill="var(--u-dim)" opacity={0.85}>
            <text x={X_CALLOUT} y={10} letterSpacing="0.12em">SECTOR / STRATUM</text>
            <text x={X_TRACK} y={10} letterSpacing="0.12em">SLICE WAFERS ({model.metrics.totalSlices})</text>
            <text x={BUS_START_X} y={10} letterSpacing="0.12em">OPEN-TRACE BUS ({model.chords.length})</text>
          </g>

          {/* Column guide hairlines */}
          <line x1={X_DIV} y1={16} x2={X_DIV} y2={layout.contentHeight - 8} stroke="var(--u-line)" strokeWidth={1} strokeDasharray="3 4" />
          <line x1={X_SOCKET} y1={16} x2={X_SOCKET} y2={layout.contentHeight - 8} stroke="var(--u-line-soft)" strokeWidth={1} />

          {/* Sector strata rows + wafer slices */}
          {layout.rows.map((placed) => {
            const sec = placed.view;
            const isSelectedSec = selectedSector === sec.sector;
            const isActiveSec = activeSector === sec.sector;
            const isConnected = connectedSectors ? connectedSectors.has(sec.sector) : true;
            const secOpacity = !sec.matchesFilter ? 0.22 : activeSector && !isActiveSec && !isConnected ? 0.26 : 1;
            const hasBlind = sec.pendingSlices + sec.staleSlices + sec.shallowSlices > 0;
            const sectorAgents = model.satellites.filter((sat) => sat.sector === sec.sector);

            return (
              <g key={sec.sector} style={{ opacity: secOpacity, transition: 'opacity 0.16s' }}>
                {/* Subtle row frame */}
                <rect
                  x={X_CALLOUT - 8}
                  y={placed.y}
                  width={X_TRACK_END - X_CALLOUT + 20}
                  height={placed.h}
                  rx={4}
                  fill={isSelectedSec || isActiveSec ? 'rgba(17, 25, 22, 0.92)' : 'rgba(12, 18, 16, 0.72)'}
                  stroke={isSelectedSec || isActiveSec ? 'var(--u-mint)' : 'var(--u-line)'}
                  strokeWidth={isSelectedSec || isActiveSec ? 1.2 : 0.9}
                />

                {/* Left status spine accent */}
                <rect
                  x={X_CALLOUT - 8}
                  y={placed.y}
                  width={3}
                  height={placed.h}
                  rx={1.5}
                  fill={sec.findingsCount > 0 ? 'var(--u-crimson)' : hasBlind ? 'var(--u-amber)' : 'var(--u-mint)'}
                  opacity={0.85}
                />

                {/* Column 1: Interactive Sector Callout */}
                <g
                  data-ultra-interactive="sector-label"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(event) => setHover({
                    x: event.clientX,
                    y: event.clientY,
                    title: sec.sector,
                    subtitle: `${sec.coveredSlices}/${sec.totalSlices} ${t('ultra.metric.cleared')} · ${sec.findingsCount} ${t('ultra.metric.findings')} · ${sec.openCount} ${t('ultra.metric.threads')}`,
                    accent: sec.findingsCount > 0 ? 'var(--u-crimson)' : hasBlind ? 'var(--u-amber)' : 'var(--u-mint)',
                    sector: sec.sector,
                  })}
                  onMouseMove={(event) => setHover((prev) => prev ? { ...prev, x: event.clientX, y: event.clientY } : null)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    setHover(null);
                    onSelectSector(sec.sector);
                  }}
                >
                  <rect x={X_CALLOUT - 4} y={placed.y + 2} width={CALLOUT_W + 4} height={placed.h - 4} fill="transparent" />
                  <text
                    x={X_CALLOUT + 6}
                    y={placed.y + 26}
                    className="ultra-mono"
                    fontSize={10.5}
                    fill={isSelectedSec || isActiveSec ? 'var(--u-mint)' : 'var(--u-dim)'}
                  >
                    {String(sec.index + 1).padStart(2, '0')}
                  </text>
                  <text
                    x={X_CALLOUT + 28}
                    y={placed.y + 26}
                    className="ultra-mono"
                    fontSize={12.5}
                    fontWeight={isSelectedSec || isActiveSec ? 600 : 500}
                    fill={isSelectedSec || isActiveSec ? 'var(--u-mint)' : 'var(--u-ink)'}
                  >
                    {truncateMiddle(sec.sector, 20)}
                  </text>
                  <text
                    x={X_CALLOUT + 28}
                    y={placed.y + 44}
                    className="ultra-mono"
                    fontSize={10.5}
                    fill={hasBlind ? 'var(--u-amber)' : 'var(--u-dim)'}
                  >
                    {`${sec.coveredSlices}/${sec.totalSlices} ${t('ultra.metric.cleared')}${sec.totalLines ? ` · ${sec.totalLines}L` : ''}${sec.findingsCount ? ` · ${sec.findingsCount}!` : ''}`}
                  </text>
                </g>

                {/* Active agent cursors pinned inside sector callout */}
                {(() => {
                  let nextX = X_CALLOUT + 28;
                  return sectorAgents.map((sat) => {
                    const pillW = Math.min(188, Math.max(82, sat.shortName.length * 6.8 + 24));
                    const px = nextX;
                    nextX += pillW + 6;
                    if (px + pillW > X_DIV - 4) return null;
                    return (
                      <g
                        key={sat.agentId}
                        data-ultra-interactive="satellite"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setHover(null);
                          onSelectNode(sat.nodeId, sat.sector);
                        }}
                        onMouseEnter={(event) => setHover({
                          x: event.clientX,
                          y: event.clientY,
                          title: `@${sat.shortName} → ${sat.nodeId}`,
                          subtitle: model.byId.get(sat.nodeId)?.title || '',
                          accent: 'var(--u-mint)',
                          sector: sat.sector,
                        })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <rect
                          x={px}
                          y={placed.y + 52}
                          width={pillW}
                          height={17}
                          rx={3}
                          fill="rgba(102, 224, 174, 0.12)"
                          stroke="rgba(102, 224, 174, 0.45)"
                          strokeWidth={0.8}
                        />
                        <circle cx={px + 8} cy={placed.y + 60.5} r={2.3} fill="var(--u-mint)" />
                        <text
                          x={px + 14}
                          y={placed.y + 64}
                          className="ultra-mono"
                          fontSize={9.5}
                          fill="var(--u-mint)"
                        >
                          {truncateMiddle(sat.shortName, Math.floor((pillW - 20) / 6.5))}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Column 2: Slice Wafer Cells */}
                {placed.cells.map(({ bar, x, y, w, h }) => {
                  const op = cellOpacity(bar, sec);
                  const isBarSelected = selectedBarId === bar.id || (selectedNodeId ? bar.nodeIds.includes(selectedNodeId) : false);
                  const styleSpec = STATUS_META[bar.status] || STATUS_META.pending;
                  const isHumanFollowup = bar.status === 'shallow' && bar.shallowReason === 'human-followup';
                  const semanticBarColor = isHumanFollowup
                    ? 'var(--u-cyan)'
                    : bar.status === 'flagged'
                      ? (bar.beacons.some((b) => b.tone === 'critical')
                          ? 'var(--u-crimson)'
                          : bar.beacons.some((b) => b.tone === 'hot' || b.tone === 'amber')
                            ? 'var(--u-amber)'
                            : 'var(--u-mint)')
                      : styleSpec.barColor;
                  const cellStroke = isBarSelected
                    ? 'var(--u-mint)'
                    : isHumanFollowup
                      ? 'rgba(110, 200, 232, 0.58)'
                      : bar.status === 'flagged'
                        ? (semanticBarColor === 'var(--u-crimson)'
                            ? 'rgba(255, 93, 82, 0.45)'
                            : semanticBarColor === 'var(--u-amber)'
                              ? 'rgba(226, 184, 107, 0.42)'
                              : 'rgba(102, 224, 174, 0.34)')
                        : styleSpec.stroke;
                  const maxLabelChars = Math.max(8, Math.floor((w - 28) / 7));

                  return (
                    <g
                      key={bar.id}
                      data-ultra-interactive="bar"
                      style={{ cursor: 'pointer', opacity: op, transition: 'opacity 0.14s' }}
                      onMouseEnter={(event) => setHover({
                        x: event.clientX,
                        y: event.clientY,
                        title: bar.label,
                        subtitle: `${t(`ultra.sliceStatus.${bar.status}`)}${bar.sublabel ? ` · ${bar.sublabel}` : ''}`,
                        accent: semanticBarColor,
                        sector: sec.sector,
                        barId: bar.id,
                      })}
                      onMouseMove={(event) => setHover((prev) => prev ? { ...prev, x: event.clientX, y: event.clientY } : null)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        setHover(null);
                        onSelectBar(bar);
                      }}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        rx={3}
                        fill={styleSpec.fill}
                        stroke={cellStroke}
                        strokeWidth={isBarSelected ? 1.5 : 0.9}
                        strokeDasharray={isBarSelected ? undefined : styleSpec.dash}
                      />
                      {/* Top precision status trace line inside wafer */}
                      <rect x={x + 1} y={y + 1} width={w - 2} height={2.5} rx={1} fill={isBarSelected ? 'var(--u-mint)' : semanticBarColor} />
                      {/* Filename / node basename */}
                      <text
                        x={x + 9}
                        y={y + 19}
                        className="ultra-mono"
                        fontSize={11}
                        fontWeight={500}
                        fill="var(--u-ink)"
                      >
                        {truncateMiddle(bar.shortLabel, maxLabelChars)}
                      </text>
                      {/* Line span & slice line count */}
                      <text
                        x={x + 9}
                        y={y + 34}
                        className="ultra-mono"
                        fontSize={9.5}
                        fill={bar.status === 'pending' ? '#95a8a0' : 'var(--u-dim)'}
                      >
                        {truncateMiddle(bar.rangeLabel, maxLabelChars)}
                      </text>

                      {/* Clickable Beacon Pips aligned on right edge of wafer */}
                      {bar.beacons.slice(0, 3).map((beacon, bIdx) => {
                        const bx = x + w - 12 - bIdx * 12;
                        const by = y + h / 2 + 2;
                        const isNodeSelected = selectedNodeId === beacon.nodeId;
                        const toneColor = BEACON_COLOR[beacon.tone] || 'var(--u-mint)';
                        if (beacon.tone === 'amber') {
                          return (
                            <polygon
                              key={beacon.nodeId}
                              points={`${bx},${by - 4.2} ${bx + 4.2},${by} ${bx},${by + 4.2} ${bx - 4.2},${by}`}
                              fill={toneColor}
                              stroke={isNodeSelected ? 'var(--u-ink)' : 'var(--u-bg)'}
                              strokeWidth={isNodeSelected ? 1.4 : 0.8}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectNode(beacon.nodeId, sec.sector);
                              }}
                            />
                          );
                        }
                        if (beacon.tone === 'human') {
                          return (
                            <circle
                              key={beacon.nodeId}
                              cx={bx}
                              cy={by}
                              r={isNodeSelected ? 4.4 : 3.6}
                              fill="var(--u-bg)"
                              stroke="var(--u-cyan)"
                              strokeWidth={1.6}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectNode(beacon.nodeId, sec.sector);
                              }}
                            />
                          );
                        }
                        return (
                          <circle
                            key={beacon.nodeId}
                            cx={bx}
                            cy={by}
                            r={isNodeSelected ? 4.4 : beacon.tone === 'critical' ? 3.8 : 3.1}
                            fill={toneColor}
                            stroke={isNodeSelected ? 'var(--u-ink)' : 'var(--u-bg)'}
                            strokeWidth={isNodeSelected ? 1.4 : 0.8}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectNode(beacon.nodeId, sec.sector);
                            }}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* Socket lead-in stem and vertical terminal rail */}
                <line x1={X_TRACK_END + 4} y1={placed.midY} x2={X_SOCKET} y2={placed.midY} stroke={isSelectedSec || isActiveSec ? 'var(--u-mint)' : 'var(--u-tick)'} strokeWidth={1} />
                <line x1={X_SOCKET} y1={placed.midY - 12} x2={X_SOCKET} y2={placed.midY + 12} stroke={isSelectedSec || isActiveSec ? 'var(--u-mint)' : 'var(--u-line)'} strokeWidth={1.5} />
                <g
                  data-ultra-interactive="sector-anchor"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setHover(null);
                    onSelectSector(sec.sector);
                  }}
                  onMouseEnter={(event) => setHover({
                    x: event.clientX,
                    y: event.clientY,
                    title: sec.sector,
                    subtitle: `${sec.coveredSlices}/${sec.totalSlices} ${t('ultra.metric.cleared')} · ${sec.findingsCount} ${t('ultra.metric.findings')}`,
                    sector: sec.sector,
                  })}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle cx={X_SOCKET} cy={placed.midY} r={12} fill="transparent" />
                  <circle
                    cx={X_SOCKET}
                    cy={placed.midY}
                    r={isSelectedSec || isActiveSec ? 4.5 : 3.5}
                    fill="var(--u-bg)"
                    stroke={isSelectedSec || isActiveSec ? 'var(--u-mint)' : hasBlind ? 'var(--u-amber)' : 'var(--u-mint)'}
                    strokeWidth={1.4}
                  />
                </g>
              </g>
            );
          })}

          {/* Column 3: Chamfered Cross-Sector Open-Trace Bus */}
          <g>
            {busItems.map((item) => {
              const { chord, ty, bx, pathD, stroke, opacity, hot, showLabel, idealY, placedLabelY } = item;
              const pillText = chord.isAwakened ? `⚡ ${chord.kind}` : chord.kind;
              const pillW = Math.min(138, Math.max(54, pillText.length * 6.2 + 14));

              return (
                <g
                  key={chord.id}
                  data-ultra-interactive="chord"
                  style={{ cursor: 'pointer', opacity, transition: 'opacity 0.15s' }}
                  onMouseEnter={(event) => {
                    setHoveredChordId(chord.id);
                    setHover({
                      x: event.clientX,
                      y: event.clientY,
                      title: `${chord.sourceSector} → ${chord.targetSector}`,
                      subtitle: `${chord.kind}${chord.label && chord.label !== chord.kind ? ` · ${chord.label}` : ''}`,
                      accent: chord.isAwakened ? 'var(--u-amber)' : 'var(--u-mint)',
                      sector: chord.sourceSector,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredChordId(null);
                    setHover(null);
                  }}
                  onClick={() => {
                    setHover(null);
                    if (chord.targetNodeId) onSelectNode(chord.targetNodeId, chord.targetSector);
                    else onSelectSector(chord.targetSector);
                  }}
                >
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth={10} />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={hot ? 1.8 : 1.15}
                    strokeDasharray={chord.isAwakened ? '5 4' : chord.kind === 'contradicts' ? '3 3' : undefined}
                    className={chord.isAwakened ? 'ultra-trace-flow' : undefined}
                  />
                  {/* Terminal node at destination */}
                  <circle cx={X_SOCKET + 5} cy={ty} r={2.2} fill={stroke} />
                  {showLabel && (
                    <>
                      <circle cx={bx} cy={idealY} r={2} fill={stroke} />
                      <path
                        d={`M ${bx} ${idealY.toFixed(1)} L ${(labelMarginX - 10).toFixed(1)} ${idealY.toFixed(1)} L ${(labelMarginX - 4).toFixed(1)} ${placedLabelY.toFixed(1)} L ${labelMarginX.toFixed(1)} ${placedLabelY.toFixed(1)}`}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={0.7}
                        strokeDasharray="2 2"
                        opacity={0.72}
                      />
                      <g transform={`translate(${labelMarginX}, ${placedLabelY})`}>
                        <rect
                          x={0}
                          y={-8}
                          width={pillW}
                          height={15}
                          rx={2.5}
                          fill="var(--u-bg)"
                          stroke={stroke}
                          strokeWidth={0.75}
                        />
                        <text x={6} y={2.5} className="ultra-mono" fontSize={9} fill={stroke}>
                          {truncateMiddle(pillText, 20)}
                        </text>
                      </g>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Precision floating tooltip */}
      {hover && (
        <div
          className="ultra-tip"
          style={{
            left: Math.min(typeof window !== 'undefined' ? window.innerWidth - 316 : hover.x + 14, hover.x + 14),
            top: Math.max(12, hover.y - 18),
          }}
        >
          <div className="ultra-mono flex items-center gap-1.5 text-[11px]" style={{ color: hover.accent || 'var(--u-mint)' }}>
            <span className="inline-block size-1.5 rounded-full" style={{ background: hover.accent || 'var(--u-mint)' }} />
            <span className="truncate font-medium">{hover.title}</span>
          </div>
          {hover.subtitle && <p className="mt-1 mb-0 line-clamp-2 text-[11px] leading-snug text-[var(--u-ink-2)]">{hover.subtitle}</p>}
        </div>
      )}
    </div>
  );
}
