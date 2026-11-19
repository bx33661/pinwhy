// Pinwhy Ultra Harness engine: deterministic breadth accounting, quota batching,
// dependency validation, and read-only cognitive gap diagnostics over the core board.
import fs from 'node:fs';
import path from 'node:path';
import { resolveRef } from '../model.js';
import { isOpenThread } from '../semantics.js';
import { isInitialized } from '../storage/board.js';
import { replay } from '../storage/event-log.js';
import { scanTargetTree, DEFAULT_MAX_SLICE_LINES } from './scanner.js';
import { appendUltraRecord, readUltraLedger, withUltraLock } from './ledger.js';

const EVIDENCE_OUT = new Set(['derived-from', 'caused-by']);
const VERDICT_IN = new Set(['supports', 'proves', 'prove', 'contradicts']);
const ANOMALY_EDGES = new Set(['supports', 'contradicts', 'derived-from', 'resolves', 'supersedes']);
const CLOSED_CHALLENGE_STATUSES = new Set(['done', 'dead', 'refuted', 'superseded', 'confirmed']);
const MIN_NOTE_CHARS = 6;

function invalidValue(message) {
  return Object.assign(new Error(message), { code: 'invalid_value', status: 400 });
}

function parseLoc(loc) {
  if (!loc) return null;
  if (typeof loc === 'string') {
    const m = /^(.+?):(\d+)(?::\d+)?$/.exec(loc.trim());
    if (m) return { path: m[1].replace(/\\/g, '/'), line: Number(m[2]) };
    return loc.trim() ? { path: loc.trim().replace(/\\/g, '/'), line: null } : null;
  }
  if (typeof loc === 'object' && !Array.isArray(loc)) {
    const p = typeof loc.path === 'string' ? loc.path.trim().replace(/\\/g, '/') : '';
    const line = typeof loc.line === 'number' && Number.isFinite(loc.line) ? loc.line : null;
    return p ? { path: p, line } : null;
  }
  return null;
}

function tagValues(node, key) {
  const prefix = `${key}=`;
  const out = [];
  for (const tag of Array.isArray(node.tags) ? node.tags : []) {
    if (typeof tag === 'string' && tag.startsWith(prefix) && tag.length > prefix.length) {
      out.push(tag.slice(prefix.length));
    }
  }
  return out;
}

function computeEffectiveSlices(ledger, graph) {
  const rawSlices = Object.values(ledger.slices || {});
  const byId = new Map();
  const slicesByPath = new Map();
  for (const slice of rawSlices) {
    const validRefs = (slice.refs || []).filter((id) => Boolean(graph.nodes?.[id]));
    const entry = {
      ...slice,
      refs: validRefs,
      dependsOn: [...(slice.dependsOn || [])],
      humanFollowups: [],
      effectiveStatus: slice.status,
      shallowReason: null,
    };
    byId.set(slice.id, entry);
    const list = slicesByPath.get(slice.path) || [];
    list.push(entry);
    slicesByPath.set(slice.path, list);
  }

  // Index open human challenges targeting specific slices so mid-audit expert
  // questions immediately surface as actionable follow-ups on cleared/blank slices.
  for (const node of Object.values(graph.nodes || {})) {
    const isHuman = node.author === 'human' || node.updatedBy === 'human';
    if (!isHuman) continue;
    if (CLOSED_CHALLENGE_STATUSES.has(node.status || '')) continue;
    const isChallenge = isOpenThread(node) || (
      ['hint', 'observation', 'note'].includes(node.type) &&
      ['open', 'active'].includes(node.status || '')
    );
    if (!isChallenge) continue;

    const targetIds = new Set();
    for (const sid of tagValues(node, 'slice')) {
      if (byId.has(sid)) targetIds.add(sid);
    }
    if (targetIds.size === 0) {
      const loc = parseLoc(node.loc);
      if (loc?.path) {
        const candidates = slicesByPath.get(loc.path) || [];
        const hits = loc.line !== null
          ? candidates.filter((s) => loc.line >= s.startLine && loc.line <= s.endLine)
          : (candidates.length === 1 ? candidates : []);
        const matched = hits.length ? hits : (candidates.length === 1 ? candidates : []);
        for (const s of matched) targetIds.add(s.id);
      }
    }
    const nodeTs = Number(node.updated || node.ts || 0);
    for (const sid of targetIds) {
      const slice = byId.get(sid);
      if (!slice) continue;
      if (slice.refs.includes(node.id)) continue;
      if (nodeTs >= Number(slice.updatedAt || 0)) {
        slice.humanFollowups.push(node.id);
      }
    }
  }

  // First pass: stale-hash, human-followup, and note-length checks.
  for (const slice of byId.values()) {
    if (slice.status !== 'cleared' && slice.status !== 'flagged') continue;
    if (slice.reviewedHash && slice.reviewedHash !== slice.hash) {
      slice.effectiveStatus = 'stale';
      continue;
    }
    if (slice.humanFollowups.length > 0) {
      slice.effectiveStatus = 'shallow';
      slice.shallowReason = 'human-followup';
      continue;
    }
    const noteLen = [...String(slice.note || '').trim()].length;
    if (noteLen < MIN_NOTE_CHARS && slice.refs.length === 0 && slice.dependsOn.length === 0) {
      slice.effectiveStatus = 'shallow';
      slice.shallowReason = 'insufficient-note';
    }
  }

  // Fixed-point propagation for dependency checks: claiming a slice is protected by
  // another unreviewed/shallow/deleted slice bounces the dependent slice back to shallow.
  let changed = true;
  let guard = 0;
  while (changed && guard < 16) {
    changed = false;
    guard += 1;
    for (const slice of byId.values()) {
      if (slice.effectiveStatus !== 'cleared' && slice.effectiveStatus !== 'flagged') continue;
      const unresolved = slice.dependsOn.filter((depId) => {
        const dep = byId.get(depId);
        return !dep || (dep.effectiveStatus !== 'cleared' && dep.effectiveStatus !== 'flagged');
      });
      if (unresolved.length) {
        slice.effectiveStatus = 'shallow';
        slice.shallowReason = 'unverified-dependency';
        slice.unverifiedDependencies = unresolved;
        changed = true;
      }
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.sector.localeCompare(b.sector) ||
    a.path.localeCompare(b.path) ||
    a.startLine - b.startLine ||
    a.id.localeCompare(b.id)
  );
}

function tagValue(node, key) {
  const prefix = `${key}=`;
  for (const tag of Array.isArray(node.tags) ? node.tags : []) {
    if (typeof tag === 'string' && tag.startsWith(prefix) && tag.length > prefix.length) {
      return tag.slice(prefix.length);
    }
  }
  return null;
}

function hasTag(node, exact) {
  return Array.isArray(node.tags) && node.tags.includes(exact);
}

function compactGapNode(node, extra = {}) {
  return {
    id: node.id,
    type: node.type,
    title: node.title ?? '',
    status: node.status ?? null,
    severity: node.severity ?? null,
    confidence: node.confidence ?? null,
    loc: node.loc ?? null,
    author: node.author ?? null,
    updatedBy: node.updatedBy ?? null,
    ...extra,
  };
}

function computeCognitiveGaps(graph) {
  const nodes = Object.values(graph.nodes || {});
  const edges = Object.values(graph.edges || {});
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  const connectedPairs = new Set();

  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge);
    outgoing.get(edge.from)?.push(edge);
    connectedPairs.add(`${edge.from}->${edge.to}`);
    connectedPairs.add(`${edge.to}->${edge.from}`);
  }

  const openThreads = nodes
    .filter(isOpenThread)
    .sort((a, b) => (b.updated || b.ts || 0) - (a.updated || a.ts || 0))
    .map((node) => compactGapNode(node));

  const unbackedVerdicts = [];
  for (const node of nodes) {
    if (!['finding', 'vuln', 'hypothesis'].includes(node.type)) continue;
    if (!['confirmed', 'refuted'].includes(node.status)) continue;
    const hasIn = (incoming.get(node.id) || []).some((e) => VERDICT_IN.has(e.kind));
    const hasOut = (outgoing.get(node.id) || []).some((e) => EVIDENCE_OUT.has(e.kind));
    if (!hasIn && !hasOut) unbackedVerdicts.push(compactGapNode(node));
  }

  // Awakening candidates: deferred hypotheses whose dependency conditions or shared
  // pivot/component surfaces now have unlinked primitives or confirmed facts.
  const primitivesAndFacts = nodes.filter((node) =>
    hasTag(node, 'role=primitive') ||
    (
      ['fact', 'observation', 'result'].includes(node.type) &&
      !['refuted', 'dead', 'superseded'].includes(node.status) &&
      (node.status === 'confirmed' || ['static-confirmed', 'reproduced', 'confirmed'].includes(node.confidence))
    ),
  );

  const awakenedChains = [];
  for (const hyp of nodes) {
    if (hyp.type !== 'hypothesis' || hyp.status !== 'deferred') continue;
    const pivots = new Set();
    const ownPivot = tagValue(hyp, 'pivot');
    if (ownPivot) pivots.add(ownPivot);
    const deps = (outgoing.get(hyp.id) || []).filter((e) => e.kind === 'depends-on').map((e) => graph.nodes[e.to]).filter(Boolean);
    for (const dep of deps) {
      const dp = tagValue(dep, 'pivot');
      if (dp) pivots.add(dp);
    }
    const ownComp = tagValue(hyp, 'component');
    const matches = [];
    for (const candidate of primitivesAndFacts) {
      if (candidate.id === hyp.id) continue;
      if (connectedPairs.has(`${candidate.id}->${hyp.id}`)) continue;
      const cPivot = tagValue(candidate, 'pivot');
      const cComp = tagValue(candidate, 'component');
      const pivotMatch = cPivot && pivots.has(cPivot);
      const compMatch = !pivots.size && ownComp && cComp && ownComp === cComp && hasTag(candidate, 'role=primitive');
      if (pivotMatch || compMatch) {
        matches.push({
          nodeId: candidate.id,
          title: candidate.title,
          via: pivotMatch ? `pivot=${cPivot}` : `component=${cComp}`,
        });
      }
    }
    if (matches.length) {
      awakenedChains.push({
        hypothesis: compactGapNode(hyp),
        matches,
      });
    }
  }

  const unresolvedAnomalies = [];
  for (const node of nodes) {
    if (!hasTag(node, 'role=anomaly') && node.type !== 'anomaly') continue;
    if (['done', 'dead', 'refuted', 'superseded', 'confirmed'].includes(node.status)) continue;
    const linked = [...(incoming.get(node.id) || []), ...(outgoing.get(node.id) || [])]
      .some((e) => ANOMALY_EDGES.has(e.kind));
    if (!linked) unresolvedAnomalies.push(compactGapNode(node));
  }

  const humanSignals = nodes
    .filter((node) => node.author === 'human' || node.updatedBy === 'human')
    .sort((a, b) => (b.updated || b.ts || 0) - (a.updated || a.ts || 0))
    .map((node) => compactGapNode(node));

  return { openThreads, unbackedVerdicts, awakenedChains, unresolvedAnomalies, humanSignals };
}

function summarizeSectors(slices, graph) {
  const bySector = new Map();
  const ensureSector = (name) => {
    if (!bySector.has(name)) {
      bySector.set(name, {
        sector: name,
        totalSlices: 0,
        totalLines: 0,
        pending: 0,
        stale: 0,
        shallow: 0,
        cleared: 0,
        flagged: 0,
        findings: 0,
        openThreads: 0,
        sliceIds: [],
      });
    }
    return bySector.get(name);
  };

  for (const slice of slices) {
    const sec = ensureSector(slice.sector);
    sec.totalSlices += 1;
    sec.totalLines += slice.lines || 0;
    sec[slice.effectiveStatus] = (sec[slice.effectiveStatus] || 0) + 1;
    sec.sliceIds.push(slice.id);
    for (const refId of slice.refs || []) {
      const node = graph.nodes?.[refId];
      if (!node) continue;
      if (['finding', 'vuln'].includes(node.type) && !['refuted', 'superseded', 'dead'].includes(node.status)) {
        sec.findings += 1;
      }
      if (isOpenThread(node)) sec.openThreads += 1;
    }
  }
  return [...bySector.values()].sort((a, b) => a.sector.localeCompare(b.sector));
}

/**
 * Pure read-only snapshot combining .pinwhy/ultra/ledger.jsonl and .pinwhy/events.jsonl.
 * Never mutates either log or leaks host absolute paths.
 */
export function buildUltraSnapshot(cwd = process.cwd(), { target = null, checkDisk = false, source } = {}) {
  const boardPresent = isInitialized(cwd);
  const untilTs = typeof source?.asOf?.at === 'number' && Number.isFinite(source.asOf.at) ? source.asOf.at : null;
  const ledger = readUltraLedger(cwd, { untilTs });
  const graph = source || boardPresent ? replay(cwd, source) : { nodes: {}, edges: {}, cursors: {}, checkpoints: {} };
  const slices = computeEffectiveSlices(ledger, graph);
  const sectors = summarizeSectors(slices, graph);
  const gaps = computeCognitiveGaps(graph);

  let untrackedFiles = [];
  let diskStaleIds = [];
  if (checkDisk && ledger.initialized) {
    const scanRoot = target ? path.resolve(target) : cwd;
    if (fsSafeExists(scanRoot)) {
      const scanned = scanTargetTree(scanRoot, {
        scope: ledger.scope || '',
        maxSliceLines: ledger.maxSliceLines || DEFAULT_MAX_SLICE_LINES,
      });
      const scannedByPath = new Map();
      for (const item of scanned.slices) {
        const list = scannedByPath.get(item.path) || [];
        list.push(item);
        scannedByPath.set(item.path, list);
      }
      const recordedByPath = new Map();
      for (const s of slices) {
        const list = recordedByPath.get(s.path) || [];
        list.push(s);
        recordedByPath.set(s.path, list);
      }
      for (const file of scanned.files) {
        if (!recordedByPath.has(file)) untrackedFiles.push(file);
      }
      for (const [file, recSlices] of recordedByPath.entries()) {
        const diskSlices = scannedByPath.get(file);
        if (!diskSlices) {
          for (const rec of recSlices) diskStaleIds.push(rec.id);
          continue;
        }
        for (const rec of recSlices) {
          const exact = diskSlices.find((d) => d.key === rec.key && d.hash === rec.hash);
          if (!exact) diskStaleIds.push(rec.id);
        }
      }
      diskStaleIds = [...new Set(diskStaleIds)];
    }
  }

  const summary = {
    totalSlices: slices.length,
    totalLines: slices.reduce((acc, s) => acc + (s.lines || 0), 0),
    pending: slices.filter((s) => s.effectiveStatus === 'pending').length,
    stale: slices.filter((s) => s.effectiveStatus === 'stale').length,
    shallow: slices.filter((s) => s.effectiveStatus === 'shallow').length,
    cleared: slices.filter((s) => s.effectiveStatus === 'cleared').length,
    flagged: slices.filter((s) => s.effectiveStatus === 'flagged').length,
    coveredSlices: slices.filter((s) => s.effectiveStatus === 'cleared' || s.effectiveStatus === 'flagged').length,
    sectors: sectors.length,
    openThreads: gaps.openThreads.length,
    unbackedVerdicts: gaps.unbackedVerdicts.length,
    awakenedChains: gaps.awakenedChains.length,
    unresolvedAnomalies: gaps.unresolvedAnomalies.length,
    humanSignals: gaps.humanSignals.length,
    untrackedFiles: untrackedFiles.length,
    diskStale: diskStaleIds.length,
  };
  summary.remainingSlices = summary.pending + summary.stale + summary.shallow;
  summary.coverageRatio = summary.totalSlices > 0
    ? Number((summary.coveredSlices / summary.totalSlices).toFixed(4))
    : 0;

  const breadthComplete = Boolean(
    ledger.initialized &&
    summary.totalSlices > 0 &&
    summary.remainingSlices === 0 &&
    untrackedFiles.length === 0 &&
    diskStaleIds.length === 0,
  );
  const commitmentComplete = Boolean(
    breadthComplete &&
    gaps.unbackedVerdicts.length === 0,
  );
  const allClear = Boolean(
    commitmentComplete &&
    gaps.openThreads.length === 0 &&
    gaps.awakenedChains.length === 0 &&
    gaps.unresolvedAnomalies.length === 0,
  );

  return {
    schema: 'pinwhy.ultra.v1',
    readOnly: true,
    prescriptive: false,
    initialized: ledger.initialized,
    scope: ledger.scope,
    maxSliceLines: ledger.maxSliceLines,
    syncCount: ledger.syncCount,
    updatedAt: ledger.updatedAt,
    integrity: ledger.integrity,
    summary,
    slices,
    sectors,
    gaps: {
      ...gaps,
      untrackedFiles,
      diskStaleIds,
      shallowSlices: slices
        .filter((s) => s.effectiveStatus === 'shallow')
        .map((s) => ({
          id: s.id,
          path: s.path,
          startLine: s.startLine,
          endLine: s.endLine,
          reason: s.shallowReason,
          unverifiedDependencies: s.unverifiedDependencies || [],
          humanFollowups: s.humanFollowups || [],
        })),
      staleSlices: slices
        .filter((s) => s.effectiveStatus === 'stale')
        .map((s) => ({ id: s.id, path: s.path, startLine: s.startLine, endLine: s.endLine })),
    },
    breadthComplete,
    commitmentComplete,
    allClear,
  };
}

function fsSafeExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

/** Sync target workspace slices into .pinwhy/ultra/ledger.jsonl under lock. */
export function syncUltra(cwd = process.cwd(), { target = null, scope = '', maxSliceLines = DEFAULT_MAX_SLICE_LINES, agent = 'agent:primary' } = {}) {
  const scanRoot = path.resolve(target || cwd);
  return withUltraLock(() => {
    const before = readUltraLedger(cwd);
    const beforeKeys = new Map(Object.values(before.slices).map((s) => [s.key, s]));
    const scanned = scanTargetTree(scanRoot, { scope, maxSliceLines });
    const at = Date.now();
    appendUltraRecord({
      op: 'sync',
      at,
      agent,
      scope: scanned.scope,
      maxSliceLines: scanned.maxSliceLines,
      slices: scanned.slices,
    }, cwd);
    const after = readUltraLedger(cwd);
    const afterSlices = Object.values(after.slices);

    let added = 0;
    let unchanged = 0;
    let stale = 0;
    for (const s of afterSlices) {
      const prev = beforeKeys.get(s.key);
      if (!prev) {
        if (s.status === 'stale') stale += 1;
        else added += 1;
      } else if (prev.hash === s.hash) {
        unchanged += 1;
      } else {
        stale += 1;
      }
    }
    const afterIds = new Set(afterSlices.map((s) => s.id));
    const removed = Object.keys(before.slices).filter((id) => !afterIds.has(id)).length;
    const snapshot = buildUltraSnapshot(cwd);

    return {
      schema: 'pinwhy.ultra-sync.v1',
      scope: scanned.scope,
      maxSliceLines: scanned.maxSliceLines,
      stats: {
        filesScanned: scanned.filesScanned,
        skippedBinary: scanned.skippedBinary,
        skippedLarge: scanned.skippedLarge,
        added,
        unchanged,
        stale,
        removed,
        totalActive: afterSlices.length,
      },
      snapshot,
    };
  }, cwd);
}

function nextBatchPriority(slice, dependentsMap) {
  if (slice.shallowReason === 'human-followup') return 0;
  if (slice.effectiveStatus === 'stale') return 1;
  if ((dependentsMap.get(slice.id)?.length || 0) > 0) return 2;
  if (slice.effectiveStatus === 'shallow') return 3;
  return 4;
}

/** Pure read-only deterministic batching of remaining slices for single or parallel Agents. */
export function nextUltraBatches(cwd = process.cwd(), { budgetLines = 420, maxSlices = 4, workers = 1, sector = null } = {}) {
  const budget = Number(budgetLines);
  const sliceLimit = Number(maxSlices);
  const workerCount = Number(workers);
  if (!Number.isSafeInteger(budget) || budget < 20 || budget > 10000) throw invalidValue('budgetLines must be between 20 and 10000');
  if (!Number.isSafeInteger(sliceLimit) || sliceLimit < 1 || sliceLimit > 50) throw invalidValue('maxSlices must be between 1 and 50');
  if (!Number.isSafeInteger(workerCount) || workerCount < 1 || workerCount > 32) throw invalidValue('workers must be between 1 and 32');

  const snapshot = buildUltraSnapshot(cwd);
  const activeIds = new Set(snapshot.slices.map((s) => s.id));
  const dependentsMap = new Map();
  for (const s of snapshot.slices) {
    if (s.effectiveStatus === 'cleared' || s.effectiveStatus === 'flagged') continue;
    for (const depId of s.dependsOn || []) {
      const list = dependentsMap.get(depId) || [];
      list.push(s.id);
      dependentsMap.set(depId, list);
    }
  }

  const allRemaining = snapshot.slices
    .filter((s) => ['stale', 'shallow', 'pending'].includes(s.effectiveStatus))
    .filter((s) => !sector || s.sector === sector);
  const nonBlocked = allRemaining.filter((s) => {
    if (s.effectiveStatus === 'shallow' && s.shallowReason === 'unverified-dependency') {
      const activeDeps = (s.unverifiedDependencies || []).filter((depId) => activeIds.has(depId));
      return activeDeps.length === 0;
    }
    return true;
  });
  const remaining = (nonBlocked.length > 0 ? nonBlocked : allRemaining).sort((a, b) =>
    nextBatchPriority(a, dependentsMap) - nextBatchPriority(b, dependentsMap) ||
    a.sector.localeCompare(b.sector) ||
    a.path.localeCompare(b.path) ||
    a.startLine - b.startLine ||
    a.id.localeCompare(b.id),
  );

  // Build sector-coherent quota chunks first.
  const chunks = [];
  let current = null;
  for (const slice of remaining) {
    const fitsSector = current && current.sector === slice.sector;
    const fitsBudget = current && (current.totalLines + slice.lines <= budget) && (current.slices.length < sliceLimit);
    if (!current || !fitsSector || !fitsBudget) {
      if (current) chunks.push(current);
      current = { sector: slice.sector, totalLines: 0, slices: [] };
    }
    current.slices.push({
      id: slice.id,
      path: slice.path,
      sector: slice.sector,
      startLine: slice.startLine,
      endLine: slice.endLine,
      lines: slice.lines,
      status: slice.effectiveStatus,
      shallowReason: slice.shallowReason,
      humanFollowups: slice.humanFollowups || [],
      blockingFor: dependentsMap.get(slice.id) || [],
      hash: slice.hash,
      previousNote: slice.note || null,
      refs: slice.refs || [],
    });
    current.totalLines += slice.lines;
  }
  if (current) chunks.push(current);

  // For multiple workers, prefer assigning distinct sectors across workers first to avoid collisions.
  const selected = [];
  const usedChunkIndices = new Set();
  const usedSectors = new Set();
  for (let i = 0; i < chunks.length && selected.length < workerCount; i++) {
    if (!usedSectors.has(chunks[i].sector)) {
      usedSectors.add(chunks[i].sector);
      usedChunkIndices.add(i);
      selected.push(chunks[i]);
    }
  }
  for (let i = 0; i < chunks.length && selected.length < workerCount; i++) {
    if (!usedChunkIndices.has(i)) {
      usedChunkIndices.add(i);
      selected.push(chunks[i]);
    }
  }

  const batches = selected.map((chunk, idx) => ({
    workerIndex: idx + 1,
    sector: chunk.sector,
    totalLines: chunk.totalLines,
    slices: chunk.slices,
  }));

  return {
    schema: 'pinwhy.ultra-next.v1',
    readOnly: true,
    prescriptive: false,
    initialized: snapshot.initialized,
    remainingSlices: allRemaining.length,
    actionableSlices: remaining.length,
    batches,
  };
}

function resolveSliceIds(ledger, rawInputs) {
  const map = ledger.slices || {};
  const list = Object.values(map);
  const ids = [];
  for (const raw of rawInputs) {
    const text = String(raw || '').trim();
    if (!text) continue;
    if (map[text]) {
      ids.push(text);
      continue;
    }
    const byKey = list.find((s) => s.key === text);
    if (byKey) {
      ids.push(byKey.id);
      continue;
    }
    const byPath = list.filter((s) => s.path === text);
    if (byPath.length) {
      for (const s of byPath) ids.push(s.id);
      continue;
    }
    const lineMatch = /^(.+):(\d+)$/.exec(text);
    if (lineMatch) {
      const targetPath = lineMatch[1].replace(/\\/g, '/');
      const targetLine = Number(lineMatch[2]);
      const candidates = list.filter((s) => s.path === targetPath);
      const hit = candidates.find((s) => targetLine >= s.startLine && targetLine <= s.endLine);
      if (hit) {
        ids.push(hit.id);
        continue;
      }
    }
    ids.push(resolveRef(map, text, 'slice'));
  }
  return [...new Set(ids)];
}

/** Mark one or more slices reviewed after careful reading. Validates main-board refs. */
export function markUltraDone(cwd = process.cwd(), { sliceIds = [], note = '', refs = [], dependsOn = [], status = null, agent = 'agent:primary' } = {}) {
  const inputs = [].concat(sliceIds || []).filter(Boolean);
  if (!inputs.length) throw invalidValue('At least one slice ID is required');
  if (status && !['cleared', 'flagged'].includes(status)) {
    throw invalidValue(`Invalid slice review status: ${status}; expected cleared or flagged`);
  }

  return withUltraLock(() => {
    const ledger = readUltraLedger(cwd);
    const resolvedIds = resolveSliceIds(ledger, inputs);
    const graph = replay(cwd);
    const resolvedRefs = [];
    for (const ref of [].concat(refs || []).filter(Boolean)) {
      resolvedRefs.push(resolveRef(graph.nodes || {}, ref, 'node'));
    }

    const rawDeps = [].concat(dependsOn || []).filter(Boolean).map((d) => String(d).trim()).filter(Boolean);
    const clearDeps = rawDeps.some((d) => d === 'none' || d === '-');
    const depTokens = rawDeps.filter((d) => d !== 'none' && d !== '-');
    const resolvedDeps = depTokens.length ? resolveSliceIds(ledger, depTokens) : null;

    const at = Date.now();
    const reviewedHashes = {};
    for (const id of resolvedIds) reviewedHashes[id] = ledger.slices[id].hash;

    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    // Merge refs / dependsOn per slice so follow-up marks never silently erase prior links.
    const updated = [];
    for (const id of resolvedIds) {
      const prev = ledger.slices[id];
      const mergedRefs = [...new Set([...(prev.refs || []), ...resolvedRefs])];
      const baseDeps = clearDeps ? [] : (prev.dependsOn || []);
      const mergedDeps = resolvedDeps
        ? [...new Set([...baseDeps, ...resolvedDeps.filter((d) => d !== id)])]
        : [...baseDeps];
      const finalStatus = status || (mergedRefs.length > 0 ? 'flagged' : 'cleared');
      const finalNote = trimmedNote || prev.note || '';
      appendUltraRecord({
        op: 'review',
        at,
        agent,
        sliceIds: [id],
        status: finalStatus,
        note: finalNote,
        refs: mergedRefs,
        dependsOn: mergedDeps,
        reviewedHashes: { [id]: reviewedHashes[id] },
      }, cwd);
    }

    const nextSnapshot = buildUltraSnapshot(cwd);
    for (const id of resolvedIds) {
      const s = nextSnapshot.slices.find((item) => item.id === id);
      if (s) updated.push(s);
    }
    return {
      schema: 'pinwhy.ultra-done.v1',
      updated,
      summary: nextSnapshot.summary,
    };
  }, cwd);
}

/** Reopen reviewed slices back to pending for fresh inspection. */
export function reopenUltraSlices(cwd = process.cwd(), { sliceIds = [], reason = '', agent = 'agent:primary' } = {}) {
  const inputs = [].concat(sliceIds || []).filter(Boolean);
  if (!inputs.length) throw invalidValue('At least one slice ID is required');
  return withUltraLock(() => {
    const ledger = readUltraLedger(cwd);
    const resolvedIds = resolveSliceIds(ledger, inputs);
    appendUltraRecord({
      op: 'reopen',
      at: Date.now(),
      agent,
      sliceIds: resolvedIds,
      reason: String(reason || '').trim(),
    }, cwd);
    const nextSnapshot = buildUltraSnapshot(cwd);
    return {
      schema: 'pinwhy.ultra-reopen.v1',
      reopened: resolvedIds.map((id) => nextSnapshot.slices.find((s) => s.id === id)).filter(Boolean),
      summary: nextSnapshot.summary,
    };
  }, cwd);
}

/** Reset the Ultra coverage ledger without affecting the main reasoning board. */
export function resetUltra(cwd = process.cwd(), { agent = 'agent:primary' } = {}) {
  return withUltraLock(() => {
    appendUltraRecord({ op: 'reset', at: Date.now(), agent }, cwd);
    return { schema: 'pinwhy.ultra-reset.v1', reset: true };
  }, cwd);
}
