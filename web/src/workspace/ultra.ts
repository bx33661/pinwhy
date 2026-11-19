import {
  values,
  type BoardEdge,
  type BoardNode,
  type GraphSnapshot,
  type UltraGapNode,
  type UltraSlice,
  type UltraSliceStatus,
  type UltraSnapshot,
} from '../types';

export type UltraLens = 'surface' | 'chains' | 'gaps';
export type UltraFilter = 'all' | 'blind' | 'hits' | 'primitives' | 'awakened' | 'human';
export type BeaconTone = 'critical' | 'hot' | 'amber' | 'human';

export type UltraBeacon = {
  nodeId: string;
  tone: BeaconTone;
  title: string;
  type: string;
};

export type UltraOrbitalBar = {
  id: string;
  kind: 'slice' | 'node';
  sector: string;
  label: string;
  shortLabel: string;
  rangeLabel: string;
  sublabel: string;
  lines: number;
  status: UltraSliceStatus;
  shallowReason?: string | null;
  weight: number;
  angle: number;
  slice?: UltraSlice;
  nodeIds: string[];
  primaryNodeId: string | null;
  beacons: UltraBeacon[];
  matchesFilter: boolean;
};

export type UltraSectorView = {
  sector: string;
  index: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  bars: UltraOrbitalBar[];
  totalSlices: number;
  totalLines: number;
  coveredSlices: number;
  pendingSlices: number;
  staleSlices: number;
  shallowSlices: number;
  flaggedSlices: number;
  nodeIds: string[];
  findingsCount: number;
  openCount: number;
  primitivesCount: number;
  humanCount: number;
  matchesFilter: boolean;
};

export type UltraChord = {
  id: string;
  kind: string;
  label: string;
  sourceSector: string;
  targetSector: string;
  sourceAngle: number;
  targetAngle: number;
  sourceIndex: number;
  targetIndex: number;
  laneIndex: number;
  fromId: string;
  toId: string;
  sourceNodeId: string | null;
  targetNodeId: string | null;
  isChain: boolean;
  isAwakened?: boolean;
};

export type UltraSatellite = {
  agentId: string;
  shortName: string;
  nodeId: string;
  sector: string;
  angle: number;
};

export type UltraNextWave = {
  sector: string;
  totalLines: number;
  slices: UltraSlice[];
};

export type UltraModel = {
  sourceMode: 'ledger' | 'board-derived';
  initialized: boolean;
  title: string;
  scope: string | null;
  goal: BoardNode | null;
  breadthComplete: boolean;
  commitmentComplete: boolean;
  allClear: boolean;
  sectors: UltraSectorView[];
  bars: UltraOrbitalBar[];
  chords: UltraChord[];
  busLaneCount: number;
  satellites: UltraSatellite[];
  nextWave: UltraNextWave | null;
  nodeSectorMap: Map<string, string>;
  sliceSectorMap: Map<string, string>;
  sectorMap: Map<string, UltraSectorView>;
  byId: Map<string, BoardNode>;
  allNodes: BoardNode[];
  allEdges: BoardEdge[];
  gaps: UltraSnapshot['gaps'];
  metrics: {
    totalSlices: number;
    clearedSlices: number;
    blindSpots: number;
    openThreads: number;
    findings: number;
    primitives: number;
    awakenedChains: number;
    humanSignals: number;
    coverageRatio: number;
  };
};

const OPEN_STATUSES = new Set(['open', 'active', 'blocked']);
const RETIRED_STATUSES = new Set(['dead', 'refuted', 'superseded']);
const THREAD_TYPES = new Set(['intent', 'hypothesis', 'question', 'action']);
const VERDICT_IN = new Set(['supports', 'proves', 'prove', 'contradicts']);
const EVIDENCE_OUT = new Set(['derived-from', 'caused-by']);
const ANOMALY_EDGES = new Set(['supports', 'contradicts', 'derived-from', 'resolves', 'supersedes']);

function isOpenNode(node: BoardNode) {
  return THREAD_TYPES.has(node.type) && OPEN_STATUSES.has(node.status || 'open');
}

function isRetiredNode(node: BoardNode) {
  return RETIRED_STATUSES.has(node.status || '');
}

function hasTag(node: BoardNode, exact: string) {
  return Array.isArray(node.tags) && node.tags.includes(exact);
}

function tagValue(node: BoardNode, key: string): string | null {
  const prefix = `${key}=`;
  if (!Array.isArray(node.tags)) return null;
  for (const tag of node.tags) {
    if (typeof tag === 'string' && tag.startsWith(prefix) && tag.length > prefix.length) {
      return tag.slice(prefix.length);
    }
  }
  return null;
}

export function sectorFromPath(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  const dirs = parts.slice(0, -1);
  if (['packages', 'apps', 'services', 'plugins'].includes(dirs[0]) && dirs.length >= 2) {
    return dirs.slice(0, Math.min(3, dirs.length)).join('/');
  }
  return dirs.slice(0, Math.min(2, dirs.length)).join('/');
}

export function parseNodeLocation(node: BoardNode): { path: string; line: number | null } | null {
  const loc = node.loc;
  if (!loc) return null;
  if (typeof loc === 'string') {
    const m = /^(.+?):(\d+)(?::\d+)?$/.exec(loc.trim());
    if (m) return { path: m[1].replace(/\\/g, '/'), line: Number(m[2]) };
    return loc.trim() ? { path: loc.trim().replace(/\\/g, '/'), line: null } : null;
  }
  if (typeof loc === 'object' && !Array.isArray(loc)) {
    const obj = loc as { path?: unknown; line?: unknown };
    if (typeof obj.path === 'string' && obj.path.trim()) {
      return {
        path: obj.path.trim().replace(/\\/g, '/'),
        line: typeof obj.line === 'number' && Number.isFinite(obj.line) ? obj.line : null,
      };
    }
  }
  return null;
}

export function sectorOfNode(node: BoardNode): string {
  const comp = tagValue(node, 'component');
  if (comp) return comp;
  const loc = parseNodeLocation(node);
  if (loc?.path) return sectorFromPath(loc.path);
  return 'unscoped';
}

function relativeInSector(filePath: string, sector: string): string {
  const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (sector !== 'root' && sector !== 'unscoped' && norm.startsWith(`${sector}/`)) {
    return norm.slice(sector.length + 1);
  }
  return norm.split('/').pop() || norm;
}

function compactGapNode(node: BoardNode): UltraGapNode {
  const loc = parseNodeLocation(node);
  return {
    id: node.id,
    type: node.type,
    title: node.title ?? '',
    status: node.status ?? null,
    severity: node.severity ?? null,
    confidence: node.confidence ?? null,
    loc: loc ? { path: loc.path, line: loc.line ?? undefined } : null,
    author: typeof node.author === 'string' ? node.author : null,
    updatedBy: typeof node.updatedBy === 'string' ? node.updatedBy : null,
  };
}

function deriveGaps(nodes: BoardNode[], edges: BoardEdge[], byId: Map<string, BoardNode>): UltraSnapshot['gaps'] {
  const incoming = new Map<string, BoardEdge[]>(nodes.map((n) => [n.id, []]));
  const outgoing = new Map<string, BoardEdge[]>(nodes.map((n) => [n.id, []]));
  const connectedPairs = new Set<string>();
  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge);
    outgoing.get(edge.from)?.push(edge);
    connectedPairs.add(`${edge.from}->${edge.to}`);
    connectedPairs.add(`${edge.to}->${edge.from}`);
  }

  const openThreads = nodes
    .filter(isOpenNode)
    .sort((a, b) => Number(b.updated || b.ts || 0) - Number(a.updated || a.ts || 0))
    .map(compactGapNode);

  const unbackedVerdicts: UltraGapNode[] = [];
  for (const node of nodes) {
    if (!['finding', 'vuln', 'hypothesis'].includes(node.type)) continue;
    if (!['confirmed', 'refuted'].includes(node.status || '')) continue;
    const hasIn = (incoming.get(node.id) || []).some((e) => VERDICT_IN.has(e.kind));
    const hasOut = (outgoing.get(node.id) || []).some((e) => EVIDENCE_OUT.has(e.kind));
    if (!hasIn && !hasOut) unbackedVerdicts.push(compactGapNode(node));
  }

  const primitivesAndFacts = nodes.filter((node) =>
    hasTag(node, 'role=primitive') ||
    (
      ['fact', 'observation', 'result'].includes(node.type) &&
      !isRetiredNode(node) &&
      (node.status === 'confirmed' || ['static-confirmed', 'reproduced', 'confirmed'].includes(node.confidence || ''))
    ),
  );

  const awakenedChains: UltraSnapshot['gaps']['awakenedChains'] = [];
  for (const hyp of nodes) {
    if (hyp.type !== 'hypothesis' || hyp.status !== 'deferred') continue;
    const pivots = new Set<string>();
    const ownPivot = tagValue(hyp, 'pivot');
    if (ownPivot) pivots.add(ownPivot);
    for (const edge of outgoing.get(hyp.id) || []) {
      if (edge.kind !== 'depends-on') continue;
      const target = byId.get(edge.to);
      const p = target ? tagValue(target, 'pivot') : null;
      if (p) pivots.add(p);
    }
    const ownComp = tagValue(hyp, 'component');
    const matches: { nodeId: string; title: string; via: string }[] = [];
    for (const candidate of primitivesAndFacts) {
      if (candidate.id === hyp.id || connectedPairs.has(`${candidate.id}->${hyp.id}`)) continue;
      const cPivot = tagValue(candidate, 'pivot');
      const cComp = tagValue(candidate, 'component');
      const pivotMatch = Boolean(cPivot && pivots.has(cPivot));
      const compMatch = Boolean(!pivots.size && ownComp && cComp && ownComp === cComp && hasTag(candidate, 'role=primitive'));
      if (pivotMatch || compMatch) {
        matches.push({ nodeId: candidate.id, title: candidate.title, via: pivotMatch ? `pivot=${cPivot}` : `component=${cComp}` });
      }
    }
    if (matches.length) awakenedChains.push({ hypothesis: compactGapNode(hyp), matches });
  }

  const unresolvedAnomalies = nodes
    .filter((node) => (hasTag(node, 'role=anomaly') || node.type === 'anomaly') && !['done', 'dead', 'refuted', 'superseded', 'confirmed'].includes(node.status || ''))
    .filter((node) => ![...(incoming.get(node.id) || []), ...(outgoing.get(node.id) || [])].some((e) => ANOMALY_EDGES.has(e.kind)))
    .map(compactGapNode);

  const humanSignals = nodes
    .filter((node) => node.author === 'human' || node.updatedBy === 'human')
    .sort((a, b) => Number(b.updated || b.ts || 0) - Number(a.updated || a.ts || 0))
    .map(compactGapNode);

  return {
    openThreads,
    unbackedVerdicts,
    awakenedChains,
    unresolvedAnomalies,
    humanSignals,
    untrackedFiles: [],
    diskStaleIds: [],
    shallowSlices: [],
    staleSlices: [],
  };
}

function classifyBeacon(node: BoardNode, awakenedNodeIds: Set<string>): BeaconTone | null {
  if (node.author === 'human' || node.updatedBy === 'human') {
    if (node.type === 'question' || node.type === 'hint' || node.type === 'observation') return 'human';
  }
  if (!isRetiredNode(node)) {
    if (['finding', 'vuln'].includes(node.type)) {
      if (['critical', 'high'].includes(node.severity || '') || node.confidence === 'reproduced' || node.status === 'confirmed') {
        return 'critical';
      }
      return 'hot';
    }
    if (hasTag(node, 'role=primitive') || hasTag(node, 'role=anomaly') || node.type === 'anomaly' || awakenedNodeIds.has(node.id)) {
      return 'amber';
    }
    if (isOpenNode(node)) return 'hot';
  }
  return null;
}

function nodeMatchesWeight(node: BoardNode): number {
  const detailLen = typeof node.detail === 'string' ? node.detail.length : 0;
  const base = ['finding', 'vuln'].includes(node.type) ? 0.78 : ['fact', 'observation', 'result'].includes(node.type) ? 0.56 : 0.44;
  return Math.min(1, base + Math.min(0.22, detailLen / 900));
}

function sliceWeight(lines: number, linkedCount: number): number {
  const norm = Math.log2(Math.max(8, lines) + 8) / Math.log2(360);
  return Math.max(0.32, Math.min(1, 0.32 + norm * 0.52 + Math.min(0.16, linkedCount * 0.06)));
}

function barMatchesFilter(
  bar: Omit<UltraOrbitalBar, 'angle' | 'matchesFilter'>,
  nodes: BoardNode[],
  filter: UltraFilter,
  awakenedNodeIds: Set<string>,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'blind') {
    return bar.status === 'pending' || bar.status === 'stale' || bar.status === 'shallow' || nodes.some(isOpenNode);
  }
  if (filter === 'hits') {
    return bar.beacons.some((b) => b.tone === 'critical' || b.tone === 'hot') ||
      nodes.some((n) => ['finding', 'vuln'].includes(n.type) && !isRetiredNode(n));
  }
  if (filter === 'primitives') {
    return nodes.some((n) => hasTag(n, 'role=primitive') || hasTag(n, 'role=anomaly') || n.type === 'anomaly' || (n.type === 'hypothesis' && n.status === 'deferred'));
  }
  if (filter === 'awakened') {
    return nodes.some((n) => awakenedNodeIds.has(n.id));
  }
  if (filter === 'human') {
    return nodes.some((n) => n.author === 'human' || n.updatedBy === 'human');
  }
  return true;
}

function nextWavePriority(slice: UltraSlice, dependentsMap: Map<string, number>): number {
  if (slice.shallowReason === 'human-followup') return 0;
  if (slice.effectiveStatus === 'stale') return 1;
  if ((dependentsMap.get(slice.id) || 0) > 0) return 2;
  if (slice.effectiveStatus === 'shallow') return 3;
  return 4;
}

function computeNextWave(ultra?: UltraSnapshot | null): UltraNextWave | null {
  if (!ultra?.initialized || !ultra.slices?.length) return null;
  const activeIds = new Set(ultra.slices.map((s) => s.id));
  const dependentsMap = new Map<string, number>();
  for (const s of ultra.slices) {
    if (s.effectiveStatus === 'cleared' || s.effectiveStatus === 'flagged') continue;
    for (const depId of s.dependsOn || []) {
      dependentsMap.set(depId, (dependentsMap.get(depId) || 0) + 1);
    }
  }
  const allRemaining = ultra.slices.filter((s) => s.effectiveStatus === 'stale' || s.effectiveStatus === 'shallow' || s.effectiveStatus === 'pending');
  if (!allRemaining.length) return null;
  const nonBlocked = allRemaining.filter((s) => {
    if (s.effectiveStatus === 'shallow' && s.shallowReason === 'unverified-dependency') {
      const activeDeps = (s.unverifiedDependencies || []).filter((id) => activeIds.has(id));
      return activeDeps.length === 0;
    }
    return true;
  });
  const remaining = (nonBlocked.length ? nonBlocked : allRemaining).sort((a, b) =>
    nextWavePriority(a, dependentsMap) - nextWavePriority(b, dependentsMap) ||
    a.sector.localeCompare(b.sector) ||
    a.path.localeCompare(b.path) ||
    a.startLine - b.startLine ||
    a.id.localeCompare(b.id),
  );
  const sector = remaining[0].sector;
  const slices: UltraSlice[] = [];
  let totalLines = 0;
  for (const s of remaining) {
    if (s.sector !== sector) continue;
    if (slices.length > 0 && (totalLines + s.lines > 420 || slices.length >= 4)) break;
    slices.push(s);
    totalLines += s.lines;
  }
  return slices.length ? { sector, totalLines, slices } : null;
}

function assignTraceBusLanes(rawChords: UltraChord[]): { chords: UltraChord[]; busLaneCount: number } {
  const sorted = [...rawChords].sort((a, b) => {
    const spanA = Math.abs(a.targetIndex - a.sourceIndex);
    const spanB = Math.abs(b.targetIndex - b.sourceIndex);
    const minA = Math.min(a.sourceIndex, a.targetIndex);
    const minB = Math.min(b.sourceIndex, b.targetIndex);
    return spanA - spanB || minA - minB || a.id.localeCompare(b.id);
  });

  const lanes: [number, number][][] = [];
  for (const chord of sorted) {
    const lo = Math.min(chord.sourceIndex, chord.targetIndex);
    const hi = Math.max(chord.sourceIndex, chord.targetIndex);
    let assigned = -1;
    for (let idx = 0; idx < lanes.length; idx++) {
      const conflict = lanes[idx].some(([a, b]) => !(hi < a || lo > b));
      if (!conflict) {
        assigned = idx;
        lanes[idx].push([lo, hi]);
        break;
      }
    }
    if (assigned === -1) {
      assigned = lanes.length;
      lanes.push([[lo, hi]]);
    }
    chord.laneIndex = assigned;
  }

  return { chords: sorted, busLaneCount: lanes.length };
}

export function buildUltraModel(
  graph: GraphSnapshot,
  ultra?: UltraSnapshot | null,
  options: { lens?: UltraLens; filter?: UltraFilter } = {},
): UltraModel {
  const filter = options.filter ?? 'all';
  const allNodes = values(graph.nodes);
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const allEdges = values(graph.edges).filter((e) => byId.has(e.from) && byId.has(e.to));

  const sourceMode: 'ledger' | 'board-derived' = ultra?.initialized ? 'ledger' : 'board-derived';
  const gaps = sourceMode === 'ledger' && ultra ? ultra.gaps : deriveGaps(allNodes, allEdges, byId);

  const awakenedNodeIds = new Set<string>();
  for (const chain of gaps.awakenedChains) {
    awakenedNodeIds.add(chain.hypothesis.id);
    for (const m of chain.matches) awakenedNodeIds.add(m.nodeId);
  }

  const nodeSectorMap = new Map<string, string>();
  const sliceSectorMap = new Map<string, string>();
  const sliceBarMap = new Map<string, UltraOrbitalBar>();
  const nodeBarMap = new Map<string, UltraOrbitalBar>();
  const sectorBuckets = new Map<string, {
    bars: Omit<UltraOrbitalBar, 'angle'>[];
    nodeIds: Set<string>;
    slices: UltraSlice[];
  }>();

  const ensureBucket = (name: string) => {
    if (!sectorBuckets.has(name)) {
      sectorBuckets.set(name, { bars: [], nodeIds: new Set(), slices: [] });
    }
    return sectorBuckets.get(name)!;
  };

  if (sourceMode === 'ledger' && ultra) {
    const slicesByPath = new Map<string, UltraSlice[]>();
    const sliceNodes = new Map<string, BoardNode[]>();
    for (const slice of ultra.slices) {
      sliceSectorMap.set(slice.id, slice.sector);
      sliceNodes.set(slice.id, []);
      const list = slicesByPath.get(slice.path) || [];
      list.push(slice);
      slicesByPath.set(slice.path, list);
      ensureBucket(slice.sector).slices.push(slice);
    }

    const assignedNodeIds = new Set<string>();
    for (const slice of ultra.slices) {
      for (const refId of slice.refs || []) {
        const node = byId.get(refId);
        if (!node) continue;
        sliceNodes.get(slice.id)!.push(node);
        assignedNodeIds.add(node.id);
        if (!nodeSectorMap.has(node.id)) nodeSectorMap.set(node.id, slice.sector);
      }
    }

    const sliceById = new Map(ultra.slices.map((s) => [s.id, s]));
    const standaloneBarsBySector = new Map<string, Omit<UltraOrbitalBar, 'angle'>[]>();
    for (const node of allNodes) {
      if (assignedNodeIds.has(node.id)) continue;
      const taggedSliceId = tagValue(node, 'slice');
      if (taggedSliceId && sliceById.has(taggedSliceId)) {
        const hit = sliceById.get(taggedSliceId)!;
        sliceNodes.get(hit.id)!.push(node);
        assignedNodeIds.add(node.id);
        nodeSectorMap.set(node.id, hit.sector);
        continue;
      }
      const loc = parseNodeLocation(node);
      if (loc?.path) {
        const candidates = slicesByPath.get(loc.path);
        if (candidates?.length) {
          const hit = (loc.line !== null
            ? candidates.find((s) => loc.line! >= s.startLine && loc.line! <= s.endLine)
            : null) || candidates[0];
          sliceNodes.get(hit.id)!.push(node);
          assignedNodeIds.add(node.id);
          nodeSectorMap.set(node.id, hit.sector);
          continue;
        }
      }
      const sec = sectorOfNode(node);
      if (node.type === 'goal' && sec === 'unscoped') continue;
      nodeSectorMap.set(node.id, sec);
      const bucket = ensureBucket(sec);
      bucket.nodeIds.add(node.id);
      const beacons: UltraBeacon[] = [];
      const tone = classifyBeacon(node, awakenedNodeIds);
      if (tone) beacons.push({ nodeId: node.id, tone, title: node.title, type: node.type });
      const status: UltraSliceStatus = isOpenNode(node) ? 'pending' : beacons.length ? 'flagged' : 'cleared';
      const draftBar: Omit<UltraOrbitalBar, 'angle' | 'matchesFilter'> = {
        id: `node:${node.id}`,
        kind: 'node',
        sector: sec,
        label: node.id,
        shortLabel: loc?.path ? relativeInSector(loc.path, sec) : node.id,
        rangeLabel: loc?.path ? `${loc.line ? `:${loc.line} · ` : ''}${node.id}` : node.type,
        sublabel: node.title,
        lines: 0,
        status,
        weight: nodeMatchesWeight(node),
        nodeIds: [node.id],
        primaryNodeId: node.id,
        beacons,
      };
      const placed = { ...draftBar, matchesFilter: barMatchesFilter(draftBar, [node], filter, awakenedNodeIds) };
      const extraList = standaloneBarsBySector.get(sec) || [];
      extraList.push(placed);
      standaloneBarsBySector.set(sec, extraList);
    }

    for (const slice of ultra.slices) {
      const bucket = ensureBucket(slice.sector);
      const linked = sliceNodes.get(slice.id) || [];
      for (const n of linked) bucket.nodeIds.add(n.id);
      const beacons: UltraBeacon[] = [];
      for (const n of linked) {
        const tone = classifyBeacon(n, awakenedNodeIds);
        if (tone) beacons.push({ nodeId: n.id, tone, title: n.title, type: n.type });
      }
      const draftBar: Omit<UltraOrbitalBar, 'angle' | 'matchesFilter'> = {
        id: slice.id,
        kind: 'slice',
        sector: slice.sector,
        label: `${slice.path}:${slice.startLine}-${slice.endLine}`,
        shortLabel: relativeInSector(slice.path, slice.sector),
        rangeLabel: `:${slice.startLine}-${slice.endLine} · ${slice.lines}L`,
        sublabel: slice.note || `${slice.lines}L`,
        lines: slice.lines,
        status: slice.effectiveStatus,
        shallowReason: slice.shallowReason,
        weight: sliceWeight(slice.lines, linked.length),
        slice,
        nodeIds: linked.map((n) => n.id),
        primaryNodeId: linked[0]?.id ?? null,
        beacons,
      };
      bucket.bars.push({ ...draftBar, matchesFilter: barMatchesFilter(draftBar, linked, filter, awakenedNodeIds) });
    }

    for (const [sec, extra] of standaloneBarsBySector.entries()) {
      ensureBucket(sec).bars.push(...extra);
    }
  } else {
    for (const node of allNodes) {
      const sec = sectorOfNode(node);
      if (node.type === 'goal' && sec === 'unscoped') continue;
      nodeSectorMap.set(node.id, sec);
      const bucket = ensureBucket(sec);
      bucket.nodeIds.add(node.id);
      const beacons: UltraBeacon[] = [];
      const tone = classifyBeacon(node, awakenedNodeIds);
      if (tone) beacons.push({ nodeId: node.id, tone, title: node.title, type: node.type });
      const status: UltraSliceStatus = isOpenNode(node)
        ? 'pending'
        : node.status === 'deferred'
          ? 'shallow'
          : beacons.some((b) => b.tone === 'critical' || b.tone === 'hot')
            ? 'flagged'
            : 'cleared';
      const loc = parseNodeLocation(node);
      const draftBar: Omit<UltraOrbitalBar, 'angle' | 'matchesFilter'> = {
        id: `node:${node.id}`,
        kind: 'node',
        sector: sec,
        label: loc?.path ? `${loc.path}${loc.line ? `:${loc.line}` : ''}` : node.id,
        shortLabel: loc?.path ? relativeInSector(loc.path, sec) : node.id,
        rangeLabel: loc?.path ? `${loc.line ? `:${loc.line} · ` : ''}${node.id}` : node.type,
        sublabel: node.title,
        lines: 0,
        status,
        weight: nodeMatchesWeight(node),
        nodeIds: [node.id],
        primaryNodeId: node.id,
        beacons,
      };
      bucket.bars.push({ ...draftBar, matchesFilter: barMatchesFilter(draftBar, [node], filter, awakenedNodeIds) });
    }
  }

  const sectorNames = [...sectorBuckets.keys()].sort((a, b) => {
    if (a === 'unscoped' && b !== 'unscoped') return 1;
    if (b === 'unscoped' && a !== 'unscoped') return -1;
    if (a === 'root' && b !== 'root') return 1;
    if (b === 'root' && a !== 'root') return -1;
    return a.localeCompare(b);
  });

  const gapRad = sectorNames.length > 1 ? Math.min(0.11, (Math.PI * 0.34) / sectorNames.length) : 0;
  const usableRad = Math.PI * 2 - gapRad * sectorNames.length;
  const totalSlots = sectorNames.reduce((acc, name) => acc + Math.max(2, sectorBuckets.get(name)!.bars.length), 0) || 1;

  let cursorAngle = -Math.PI / 2;
  const sectors: UltraSectorView[] = [];
  const bars: UltraOrbitalBar[] = [];
  const sectorMap = new Map<string, UltraSectorView>();

  sectorNames.forEach((name, sectorIndex) => {
    const bucket = sectorBuckets.get(name)!;
    const span = usableRad * (Math.max(2, bucket.bars.length) / totalSlots);
    const startAngle = cursorAngle;
    const endAngle = startAngle + span;
    const midAngle = (startAngle + endAngle) / 2;
    cursorAngle = endAngle + gapRad;

    const pad = Math.min(0.035, span * 0.14);
    const innerSpan = Math.max(0.01, span - pad * 2);
    const placedBars: UltraOrbitalBar[] = bucket.bars.map((bar, index) => {
      const ratio = (index + 0.5) / Math.max(1, bucket.bars.length);
      const angle = startAngle + pad + ratio * innerSpan;
      const placed: UltraOrbitalBar = { ...bar, angle };
      bars.push(placed);
      if (placed.kind === 'slice') sliceBarMap.set(placed.id, placed);
      for (const nid of placed.nodeIds) {
        if (!nodeBarMap.has(nid)) nodeBarMap.set(nid, placed);
      }
      return placed;
    });

    const nodeList = [...bucket.nodeIds].map((id) => byId.get(id)!).filter(Boolean);
    const coveredSlices = bucket.slices.length
      ? bucket.slices.filter((s) => s.effectiveStatus === 'cleared' || s.effectiveStatus === 'flagged').length
      : placedBars.filter((b) => b.status === 'cleared' || b.status === 'flagged').length;

    const view: UltraSectorView = {
      sector: name,
      index: sectorIndex,
      startAngle,
      endAngle,
      midAngle,
      bars: placedBars,
      totalSlices: bucket.slices.length || placedBars.length,
      totalLines: bucket.slices.reduce((acc, s) => acc + (s.lines || 0), 0),
      coveredSlices,
      pendingSlices: bucket.slices.filter((s) => s.effectiveStatus === 'pending').length,
      staleSlices: bucket.slices.filter((s) => s.effectiveStatus === 'stale').length,
      shallowSlices: bucket.slices.filter((s) => s.effectiveStatus === 'shallow').length,
      flaggedSlices: bucket.slices.filter((s) => s.effectiveStatus === 'flagged').length,
      nodeIds: [...bucket.nodeIds],
      findingsCount: nodeList.filter((n) => ['finding', 'vuln'].includes(n.type) && !isRetiredNode(n)).length,
      openCount: nodeList.filter(isOpenNode).length,
      primitivesCount: nodeList.filter((n) => hasTag(n, 'role=primitive') || hasTag(n, 'role=anomaly') || n.type === 'anomaly').length,
      humanCount: nodeList.filter((n) => n.author === 'human' || n.updatedBy === 'human').length,
      matchesFilter: filter === 'all' ? true : placedBars.some((b) => b.matchesFilter),
    };
    sectors.push(view);
    sectorMap.set(name, view);
  });

  // Build cross-sector trace links from authored board edges, slice guard dependencies,
  // and awakened pivot collision bridges.
  const rawChords: UltraChord[] = [];
  const seenChordKeys = new Set<string>();
  const addChord = (chord: UltraChord) => {
    if (seenChordKeys.has(chord.id)) return;
    seenChordKeys.add(chord.id);
    rawChords.push(chord);
  };

  for (const edge of allEdges) {
    const fromSec = nodeSectorMap.get(edge.from);
    const toSec = nodeSectorMap.get(edge.to);
    if (!fromSec || !toSec || fromSec === toSec) continue;
    const srcView = sectorMap.get(fromSec);
    const dstView = sectorMap.get(toSec);
    if (!srcView || !dstView) continue;
    addChord({
      id: edge.id,
      kind: edge.kind,
      label: edge.label || edge.kind,
      sourceSector: fromSec,
      targetSector: toSec,
      sourceAngle: nodeBarMap.get(edge.from)?.angle ?? srcView.midAngle,
      targetAngle: nodeBarMap.get(edge.to)?.angle ?? dstView.midAngle,
      sourceIndex: srcView.index,
      targetIndex: dstView.index,
      laneIndex: 0,
      fromId: edge.from,
      toId: edge.to,
      sourceNodeId: edge.from,
      targetNodeId: edge.to,
      isChain: ['supports', 'proves', 'prove', 'depends-on', 'derived-from', 'caused-by', 'contradicts'].includes(edge.kind),
    });
  }

  if (sourceMode === 'ledger' && ultra) {
    for (const slice of ultra.slices) {
      for (const depId of slice.dependsOn || []) {
        const depSec = sliceSectorMap.get(depId);
        if (!depSec || depSec === slice.sector) continue;
        const srcView = sectorMap.get(slice.sector);
        const dstView = sectorMap.get(depSec);
        if (!srcView || !dstView) continue;
        addChord({
          id: `dep:${slice.id}->${depId}`,
          kind: 'depends-on',
          label: `${slice.id} → ${depId}`,
          sourceSector: slice.sector,
          targetSector: depSec,
          sourceAngle: sliceBarMap.get(slice.id)?.angle ?? srcView.midAngle,
          targetAngle: sliceBarMap.get(depId)?.angle ?? dstView.midAngle,
          sourceIndex: srcView.index,
          targetIndex: dstView.index,
          laneIndex: 0,
          fromId: slice.id,
          toId: depId,
          sourceNodeId: null,
          targetNodeId: null,
          isChain: true,
        });
      }
    }
  }

  for (const chain of gaps.awakenedChains) {
    const hSec = nodeSectorMap.get(chain.hypothesis.id);
    if (!hSec) continue;
    const dstView = sectorMap.get(hSec);
    if (!dstView) continue;
    for (const match of chain.matches) {
      const mSec = nodeSectorMap.get(match.nodeId);
      if (!mSec || mSec === hSec) continue;
      const srcView = sectorMap.get(mSec);
      if (!srcView) continue;
      addChord({
        id: `awakened:${match.nodeId}->${chain.hypothesis.id}`,
        kind: match.via,
        label: match.via,
        sourceSector: mSec,
        targetSector: hSec,
        sourceAngle: nodeBarMap.get(match.nodeId)?.angle ?? srcView.midAngle,
        targetAngle: nodeBarMap.get(chain.hypothesis.id)?.angle ?? dstView.midAngle,
        sourceIndex: srcView.index,
        targetIndex: dstView.index,
        laneIndex: 0,
        fromId: match.nodeId,
        toId: chain.hypothesis.id,
        sourceNodeId: match.nodeId,
        targetNodeId: chain.hypothesis.id,
        isChain: true,
        isAwakened: true,
      });
    }
  }

  const { chords, busLaneCount } = assignTraceBusLanes(rawChords);

  const satellites: UltraSatellite[] = [];
  for (const [agentId, cursor] of Object.entries(graph.cursors || {})) {
    const nodeId = cursor?.to;
    if (!nodeId || !byId.has(nodeId)) continue;
    const sec = nodeSectorMap.get(nodeId) || 'unscoped';
    const angle = nodeBarMap.get(nodeId)?.angle ?? sectorMap.get(sec)?.midAngle ?? -Math.PI / 2;
    satellites.push({
      agentId,
      shortName: agentId.replace(/^agent:/, ''),
      nodeId,
      sector: sec,
      angle,
    });
  }

  const goal = allNodes.find((n) => n.type === 'goal' && !isRetiredNode(n)) || allNodes.find((n) => n.type === 'goal') || null;
  const findingsCount = allNodes.filter((n) => ['finding', 'vuln'].includes(n.type) && !isRetiredNode(n)).length;
  const primitivesCount = allNodes.filter((n) => hasTag(n, 'role=primitive') || hasTag(n, 'role=anomaly') || n.type === 'anomaly').length;

  const totalSlices = sourceMode === 'ledger' && ultra ? ultra.summary.totalSlices : bars.length;
  const clearedSlices = sourceMode === 'ledger' && ultra ? ultra.summary.coveredSlices : bars.filter((b) => b.status === 'cleared' || b.status === 'flagged').length;
  const blindSpots = sourceMode === 'ledger' && ultra ? ultra.summary.remainingSlices + ultra.summary.untrackedFiles + ultra.summary.diskStale : gaps.openThreads.length;
  const commitmentComplete = sourceMode === 'ledger' && ultra
    ? Boolean(ultra.commitmentComplete ?? (ultra.breadthComplete && gaps.unbackedVerdicts.length === 0))
    : gaps.unbackedVerdicts.length === 0 && gaps.openThreads.length === 0;

  return {
    sourceMode,
    initialized: Boolean(ultra?.initialized),
    title: graph.meta?.title || '',
    scope: ultra?.scope ?? null,
    goal,
    breadthComplete: Boolean(ultra?.breadthComplete),
    commitmentComplete,
    allClear: Boolean(ultra?.allClear),
    sectors,
    bars,
    chords,
    busLaneCount,
    satellites,
    nextWave: computeNextWave(ultra),
    nodeSectorMap,
    sliceSectorMap,
    sectorMap,
    byId,
    allNodes,
    allEdges,
    gaps,
    metrics: {
      totalSlices,
      clearedSlices,
      blindSpots,
      openThreads: gaps.openThreads.length,
      findings: findingsCount,
      primitives: primitivesCount,
      awakenedChains: gaps.awakenedChains.length,
      humanSignals: gaps.humanSignals.length,
      coverageRatio: totalSlices > 0 ? clearedSlices / totalSlices : 0,
    },
  };
}
