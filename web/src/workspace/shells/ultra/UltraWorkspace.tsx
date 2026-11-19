import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileText, History, Plus, RotateCcw, Search } from 'lucide-react';
import { BrandMark } from '../../../BrandMark';
import type { Connection } from '../../../use-graph-stream';
import type { BoardNode, GraphSnapshot, UltraSnapshot, WorkspaceMode } from '../../../types';
import { t } from '../../../i18n';
import { buildUltraModel, type UltraFilter, type UltraLens, type UltraOrbitalBar } from '../../ultra';
import { UltraTraceMatrix } from './UltraTraceMatrix';
import { UltraDrawer } from './UltraDrawer';

type Props = {
  snapshot: GraphSnapshot;
  ultra: UltraSnapshot | null;
  connection: Connection;
  isStatic: boolean;
  writable: boolean;
  selectedId: string | null;
  timelineOpen: boolean;
  onSelectNode: (id: string | null) => void;
  onInspectFullNode: (id: string) => void;
  onWorkspace: (next: WorkspaceMode) => void;
  onSearch: () => void;
  onDigest: () => void;
  onNew?: () => void;
  onTimeline?: () => void;
  onReload: () => Promise<void>;
};

const FILTERS: UltraFilter[] = ['all', 'blind', 'hits', 'primitives', 'awakened', 'human'];

const WAFER_COLOR: Record<string, string> = {
  cleared: 'var(--u-mint)',
  flagged: 'var(--u-crimson)',
  shallow: 'var(--u-amber)',
  stale: 'var(--u-crimson)',
  pending: 'var(--u-tick)',
};

export function UltraWorkspace({
  snapshot,
  ultra,
  connection,
  isStatic,
  writable,
  selectedId,
  timelineOpen,
  onSelectNode,
  onInspectFullNode,
  onWorkspace,
  onSearch,
  onDigest,
  onNew,
  onTimeline,
  onReload,
}: Props) {
  const [lens, setLens] = useState<UltraLens>('surface');
  const [filter, setFilter] = useState<UltraFilter>('all');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const model = useMemo(
    () => buildUltraModel(snapshot, ultra, { lens, filter }),
    [snapshot, ultra, lens, filter],
  );

  const selectedNode: BoardNode | null = selectedId ? model.byId.get(selectedId) ?? null : null;
  const activeSectorName = selectedSector || (selectedNode ? model.nodeSectorMap.get(selectedNode.id) ?? null : null);
  const activeSector = activeSectorName ? model.sectorMap.get(activeSectorName) ?? null : null;

  const drawerMode: 'sector' | 'node' | 'gaps' | null = selectedNode
    ? 'node'
    : activeSector
      ? 'sector'
      : gapsOpen
        ? 'gaps'
        : null;
  const drawerOpen = drawerMode !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        if (selectedNode) {
          onSelectNode(null);
        } else if (selectedSector || gapsOpen) {
          setSelectedSector(null);
          setSelectedBarId(null);
          setGapsOpen(false);
        }
      } else if (event.key === '0') {
        setResetSignal((n) => n + 1);
      } else if ((event.key === 'n' || event.key === 'N') && writable && onNew) {
        event.preventDefault();
        onNew();
      } else if ((event.key === 't' || event.key === 'T') && onTimeline) {
        event.preventDefault();
        onTimeline();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNode, selectedSector, gapsOpen, writable, onNew, onTimeline, onSelectNode]);

  const handleSelectSector = (sectorName: string) => {
    setGapsOpen(false);
    setSelectedBarId(null);
    setSelectedSector(sectorName);
    onSelectNode(null);
  };

  const handleSelectBar = (bar: UltraOrbitalBar) => {
    setGapsOpen(false);
    setSelectedSector(bar.sector);
    setSelectedBarId(bar.id);
    if (bar.kind === 'node' && bar.primaryNodeId) {
      onSelectNode(bar.primaryNodeId);
    } else {
      onSelectNode(null);
    }
  };

  const handleSelectNode = (nodeId: string, sectorName?: string) => {
    setGapsOpen(false);
    setSelectedSector(sectorName || model.nodeSectorMap.get(nodeId) || null);
    onSelectNode(nodeId);
  };

  const handleClear = () => {
    setSelectedSector(null);
    setSelectedBarId(null);
    setGapsOpen(false);
    onSelectNode(null);
  };

  const openGapsDrawer = () => {
    setSelectedSector(null);
    setSelectedBarId(null);
    onSelectNode(null);
    setGapsOpen(true);
  };

  const copyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd((cur) => (cur === cmd ? null : cur)), 1800);
    } catch { /* Clipboard permission optional. */ }
  };

  const statusText = model.sourceMode === 'ledger'
    ? model.allClear
      ? t('ultra.status.complete')
      : t('ultra.status.active')
    : t('ultra.status.idle');

  const isEmpty = model.sectors.length === 0;
  const pct = Math.round(model.metrics.coverageRatio * 100);
  const c1Count = ultra?.initialized
    ? ultra.summary.pending + ultra.summary.untrackedFiles + ultra.summary.diskStale
    : 0;
  const c2Count = model.gaps.shallowSlices.length + model.gaps.staleSlices.length;
  const c3Count = model.gaps.unbackedVerdicts.length;
  const s1Count = model.metrics.awakenedChains;
  const s2Count = new Set([
    ...model.gaps.humanSignals.map((n) => n.id),
    ...model.gaps.openThreads.map((n) => n.id),
    ...model.gaps.unresolvedAnomalies.map((n) => n.id),
  ]).size;
  const goalTitle = model.goal?.title || snapshot.meta?.title || t('app.untitledTask');

  return (
    <div className="ultra-shell flex min-h-0 flex-1 flex-col">
      {/* Row 1: Top Open-Trace Command Bar */}
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-b border-[var(--u-line)] bg-[var(--u-surface)] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-[var(--u-mint)]">
            <BrandMark size={17} />
          </span>
          <span className="ultra-mono shrink-0 text-[12px] font-semibold tracking-[0.14em] text-[var(--u-ink)]">
            {t('ultra.title')}
          </span>
          <span
            className="size-1.5 shrink-0 rounded-full"
            title={statusText}
            style={{
              background: isStatic ? 'var(--u-dim)' : connection === 'live' ? 'var(--u-mint)' : 'var(--u-crimson)',
            }}
          />
          <span className="h-3.5 w-px shrink-0 bg-[var(--u-line)] max-md:hidden" aria-hidden="true" />
          <span className="truncate text-xs text-[var(--u-ink-2)] max-md:hidden" title={goalTitle}>
            {goalTitle}
          </span>
        </div>

        <div className="ultra-tab-track shrink-0" role="tablist" aria-label="Ultra lenses">
          {(['surface', 'chains', 'gaps'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={lens === item}
              data-active={lens === item ? 'true' : undefined}
              className="ultra-tab"
              onClick={() => {
                setLens(item);
                if (item === 'gaps') setGapsOpen(false);
              }}
            >
              {t(`ultra.lens.${item}`)}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onSearch} className="ultra-btn">
            <Search className="size-3.5" />
            <span className="max-lg:hidden">{t('ultra.btn.find')}</span>
            <span className="ultra-mono text-[10px] text-[var(--u-dim)] max-xl:hidden">[⌘K]</span>
          </button>
          {writable && onNew && (
            <button type="button" onClick={onNew} className="ultra-btn ultra-btn-mint">
              <Plus className="size-3.5" />
              <span className="max-lg:hidden">{t('ultra.btn.newNode')}</span>
              <span className="ultra-mono text-[10px] opacity-80 max-xl:hidden">[N]</span>
            </button>
          )}
          {onTimeline && (
            <button type="button" onClick={onTimeline} aria-pressed={timelineOpen} className="ultra-btn max-md:hidden">
              <History className="size-3.5" />
              <span className="max-xl:hidden">{t('ultra.btn.timeline')}</span>
            </button>
          )}
          <button type="button" onClick={onDigest} className="ultra-btn max-md:hidden">
            <FileText className="size-3.5" />
            <span className="max-xl:hidden">{t('ultra.btn.digest')}</span>
          </button>
          <button type="button" onClick={() => setResetSignal((n) => n + 1)} title={t('ultra.resetView')} className="ultra-btn px-2">
            <RotateCcw className="size-3.5" />
          </button>
          <div className="ultra-tab-track">
            <button type="button" className="ultra-tab" onClick={() => onWorkspace('general')}>{t('ultra.btn.general')}</button>
            <button type="button" className="ultra-tab" onClick={() => onWorkspace('audit')}>{t('ultra.btn.audit')}</button>
            <button type="button" className="ultra-tab" data-active="true">{t('workspace.ultra')}</button>
          </div>
        </div>
      </header>

      {/* Row 2: Telemetry Wafer Strip & 5-Gate Status Row */}
      <div className="flex min-h-[38px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--u-line)] bg-[var(--u-bg)] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="ultra-mono text-xs font-medium text-[var(--u-mint)]">{pct}%</span>
            <span className="ultra-mono text-[11px] text-[var(--u-dim)]">
              {model.metrics.clearedSlices}/{model.metrics.totalSlices} {model.sourceMode === 'ledger' ? t('ultra.metric.slices') : t('ultra.metric.nodes')}
            </span>
            {model.bars.length > 0 && (
              <div className="ultra-wafer-strip w-28 max-sm:hidden" title={`${model.metrics.clearedSlices}/${model.metrics.totalSlices}`}>
                {model.bars.slice(0, 32).map((bar) => (
                  <button
                    key={bar.id}
                    type="button"
                    aria-label={bar.label}
                    title={`${bar.label} · ${t(`ultra.sliceStatus.${bar.status}`)}`}
                    onClick={() => handleSelectBar(bar)}
                    className="ultra-wafer-seg cursor-pointer border-0 p-0"
                    style={{ background: WAFER_COLOR[bar.status] || 'var(--u-tick)', opacity: bar.status === 'pending' ? 0.45 : 0.92 }}
                  />
                ))}
              </div>
            )}
          </div>

          <span className="h-3.5 w-px bg-[var(--u-line)] max-sm:hidden" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-2.5 text-[11.5px]">
            {FILTERS.map((item) => {
              const active = filter === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`border-b pb-0.5 transition-colors ${
                    active
                      ? 'border-[var(--u-mint)] font-medium text-[var(--u-mint)]'
                      : 'border-transparent text-[var(--u-dim)] hover:text-[var(--u-ink)]'
                  }`}
                >
                  {t(`ultra.filter.${item}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { code: 'C1', label: t('ultra.gateChip.c1'), title: t('ultra.gate.c1'), count: c1Count, state: c1Count > 0 ? 'crit' : 'ok' },
            { code: 'C2', label: t('ultra.gateChip.c2'), title: t('ultra.gate.c2'), count: c2Count, state: c2Count > 0 ? 'warn' : 'ok' },
            { code: 'C3', label: t('ultra.gateChip.c3'), title: t('ultra.gate.c3'), count: c3Count, state: c3Count > 0 ? 'crit' : 'ok' },
          ].map((gate) => (
            <button
              key={gate.code}
              type="button"
              data-state={gate.state}
              onClick={openGapsDrawer}
              title={`${gate.code} · ${gate.title}`}
              className="ultra-gate-pill"
            >
              <span>{gate.code}</span>
              <span className="max-xl:hidden text-[var(--u-dim)]">{gate.label}</span>
              <strong>{gate.count}</strong>
            </button>
          ))}
          <span className="mx-0.5 h-3.5 w-px bg-[var(--u-line)]" aria-hidden="true" />
          {[
            { code: 'S1', label: t('ultra.gateChip.s1'), title: t('ultra.gate.s1'), count: s1Count, state: s1Count > 0 ? 'signal' : 'idle' },
            { code: 'S2', label: t('ultra.gateChip.s2'), title: t('ultra.gate.s2'), count: s2Count, state: s2Count > 0 ? 'human' : 'idle' },
          ].map((gate) => (
            <button
              key={gate.code}
              type="button"
              data-state={gate.state}
              onClick={openGapsDrawer}
              title={`${gate.code} · ${gate.title}`}
              className="ultra-gate-pill"
            >
              <span>{gate.code}</span>
              <span className="max-xl:hidden text-[var(--u-dim)]">{gate.label}</span>
              <strong>{gate.count}</strong>
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Main Viewport */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isEmpty ? (
          <div className="ultra-grid-bg flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 text-[var(--u-mint)]">
              <BrandMark size={30} />
            </span>
            <div className="ultra-mono text-[11px] uppercase tracking-[0.22em] text-[var(--u-mint)]">{t('ultra.title')}</div>
            <h2 className="mt-2 mb-0 text-xl font-normal text-[var(--u-ink)]">{t('ultra.empty.title')}</h2>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--u-dim)]">{t('ultra.empty.desc')}</p>
            <button
              type="button"
              onClick={() => copyCommand('pinwhy-ultra sync --cwd .')}
              className="ultra-btn ultra-btn-mint mt-4"
            >
              {copiedCmd === 'pinwhy-ultra sync --cwd .' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span className="ultra-mono">pinwhy-ultra sync --cwd .</span>
            </button>
          </div>
        ) : (
          <>
            {lens !== 'gaps' && (
              <div className="pointer-events-none absolute top-2.5 left-4 z-10 flex items-center gap-2">
                <span className="ultra-mono rounded border border-[var(--u-line)] bg-[var(--u-surface)]/90 px-2 py-0.5 text-[10.5px] text-[var(--u-dim)]">
                  {t(`ultra.lensHint.${lens}`)}
                </span>
              </div>
            )}
            <UltraTraceMatrix
              model={model}
              lens={lens}
              selectedSector={activeSectorName}
              selectedBarId={selectedBarId}
              selectedNodeId={selectedId}
              resetSignal={resetSignal}
              onSelectSector={handleSelectSector}
              onSelectBar={handleSelectBar}
              onSelectNode={handleSelectNode}
              onClearSelection={handleClear}
            />
          </>
        )}
      </div>

      {/* Row 4: Bottom Tactical Footer & Legend */}
      <footer className="flex min-h-[34px] shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--u-line)] bg-[var(--u-surface)] px-4 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-2.5">
          {model.sourceMode === 'board-derived' ? (
            <>
              <span className="text-[var(--u-dim)]">{t('ultra.syncMissing')}</span>
              <button
                type="button"
                onClick={() => copyCommand('pinwhy-ultra sync --cwd .')}
                className="ultra-mono inline-flex items-center gap-1 text-[var(--u-mint)] underline underline-offset-4"
              >
                {copiedCmd === 'pinwhy-ultra sync --cwd .' ? <Check className="size-3" /> : <Copy className="size-3" />}
                <span>{copiedCmd === 'pinwhy-ultra sync --cwd .' ? t('ultra.copiedCmd') : 'pinwhy-ultra sync --cwd .'}</span>
              </button>
            </>
          ) : model.nextWave ? (
            <>
              <span className="ultra-mono rounded border border-[var(--u-mint)]/40 bg-[var(--u-mint)]/10 px-1.5 py-0.5 text-[10px] text-[var(--u-mint)]">
                {t('ultra.nextWave')}
              </span>
              <button
                type="button"
                onClick={() => handleSelectSector(model.nextWave!.sector)}
                className="ultra-mono text-[var(--u-ink)] hover:text-[var(--u-mint)]"
              >
                {model.nextWave.sector} ({model.nextWave.slices.length} · {model.nextWave.totalLines}L)
              </button>
              <button
                type="button"
                onClick={() => copyCommand('pinwhy-ultra next --cwd .')}
                className="ultra-mono inline-flex items-center gap-1 text-[var(--u-dim)] hover:text-[var(--u-mint)]"
              >
                {copiedCmd === 'pinwhy-ultra next --cwd .' ? <Check className="size-3 text-[var(--u-mint)]" /> : <Copy className="size-3" />}
                <span>pinwhy-ultra next --cwd .</span>
              </button>
            </>
          ) : model.allClear ? (
            <>
              <span className="ultra-mono rounded border border-[var(--u-mint)]/40 bg-[var(--u-mint)]/10 px-1.5 py-0.5 text-[10px] text-[var(--u-mint)]">
                {t('ultra.allGatesClear')}
              </span>
              <button
                type="button"
                onClick={() => copyCommand('pinwhy-ultra check --cwd .')}
                className="ultra-mono inline-flex items-center gap-1 text-[var(--u-dim)] hover:text-[var(--u-mint)]"
              >
                {copiedCmd === 'pinwhy-ultra check --cwd .' ? <Check className="size-3 text-[var(--u-mint)]" /> : <Copy className="size-3" />}
                <span>pinwhy-ultra check --cwd .</span>
              </button>
            </>
          ) : model.commitmentComplete ? (
            <button
              type="button"
              onClick={() => setLens('gaps')}
              className="ultra-mono inline-flex items-center gap-1.5 rounded border border-[var(--u-cyan)]/35 bg-[var(--u-cyan)]/8 px-2 py-0.5 text-[10.5px] text-[var(--u-cyan)] hover:border-[var(--u-cyan)]"
            >
              <span>{t('ultra.commitmentsDoneBoundariesOpen', { count: s1Count + s2Count })}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLens('gaps')}
              className="ultra-mono text-[var(--u-amber)] underline underline-offset-4"
            >
              {t('ultra.gates.breadthDoneGapsOpen')}
            </button>
          )}
        </div>

        <div className="ultra-mono hidden items-center gap-3 text-[10.5px] text-[var(--u-dim)] lg:flex">
          <span>{t('ultra.legend.line1')}</span>
          <span className="text-[var(--u-tick)]">·</span>
          <span>{t('ultra.legend.line2')}</span>
        </div>
      </footer>

      {/* Slide-over detail sheet drawer */}
      <UltraDrawer
        open={drawerOpen}
        viewMode={drawerMode}
        sector={activeSector}
        selectedBarId={selectedBarId}
        selectedNode={selectedNode}
        model={model}
        writable={writable}
        onClose={handleClear}
        onBackToSector={() => {
          const fallbackSec = selectedSector || (selectedNode ? model.nodeSectorMap.get(selectedNode.id) ?? null : null);
          onSelectNode(null);
          if (fallbackSec) setSelectedSector(fallbackSec);
        }}
        onSelectSector={handleSelectSector}
        onSelectBar={handleSelectBar}
        onSelectNode={handleSelectNode}
        onInspectFullNode={onInspectFullNode}
        onReload={onReload}
      />
    </div>
  );
}
