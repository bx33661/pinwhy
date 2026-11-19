// Append-only slice coverage ledger for Pinwhy Ultra.
// Stored separately under .pinwhy/ultra/ledger.jsonl so mechanical file-coverage
// accounting never pollutes the semantic reasoning graph in .pinwhy/events.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { nextShortId } from '../model.js';
import { isInitialized, protectBoard } from '../storage/board.js';
import { paths } from '../storage/layout.js';
import { withFileLock } from '../storage/file-lock.js';

export const LEDGER_VERSION = 1;

export function ultraPaths(cwd = process.cwd()) {
  const root = paths(cwd).root;
  const dir = path.join(root, 'ultra');
  return {
    root,
    dir,
    ledger: path.join(dir, 'ledger.jsonl'),
    lock: path.join(dir, 'lock'),
  };
}

export function emptyUltraLedger() {
  return {
    initialized: false,
    ledgerVersion: LEDGER_VERSION,
    scope: null,
    maxSliceLines: 320,
    syncCount: 0,
    updatedAt: null,
    slices: {},
    retiredIds: {},
    integrity: { corruptLines: 0 },
  };
}

/**
 * Acquire cross-process lock for the Ultra coverage ledger.
 * Never creates a missing .pinwhy/ board; the main board must exist first.
 */
export function withUltraLock(fn, cwd = process.cwd(), timeoutMs = 10000) {
  if (!isInitialized(cwd)) {
    throw Object.assign(
      new Error('No .pinwhy/ board in target directory; run pinwhy init first'),
      { code: 'board_missing', status: 400 },
    );
  }
  protectBoard(cwd);
  const p = ultraPaths(cwd);
  if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });
  return withFileLock(p.lock, () => fn(), Number(timeoutMs) || 10000);
}

export function appendUltraRecord(record, cwd = process.cwd()) {
  const p = ultraPaths(cwd);
  if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });
  const payload = { ledgerVersion: LEDGER_VERSION, ...record };
  fs.appendFileSync(p.ledger, `${JSON.stringify(payload)}\n`);
  return payload;
}

function uniqueStrings(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(String).filter(Boolean))];
}

function applySyncEvent(state, ev) {
  state.initialized = true;
  state.scope = ev.scope ?? null;
  if (Number.isSafeInteger(ev.maxSliceLines) && ev.maxSliceLines >= 20) {
    state.maxSliceLines = ev.maxSliceLines;
  }
  state.syncCount += 1;
  state.updatedAt = ev.at ?? state.updatedAt;

  const incoming = Array.isArray(ev.slices) ? ev.slices : [];
  const oldEntries = Object.values(state.slices);
  const oldByKey = new Map(oldEntries.map((slice) => [slice.key, slice]));
  const oldByPath = new Map();
  const incomingByPath = new Map();
  for (const slice of oldEntries) {
    const list = oldByPath.get(slice.path) || [];
    list.push(slice);
    oldByPath.set(slice.path, list);
  }
  for (const slice of incoming) {
    const list = incomingByPath.get(slice.path) || [];
    list.push(slice);
    incomingByPath.set(slice.path, list);
  }

  const nextSlices = {};
  const matchedOldIds = new Set();
  const matchedSpecs = new Map();
  const carriedPaths = new Set();

  for (const spec of incoming) {
    const exact = oldByKey.get(spec.key);
    if (exact && !matchedOldIds.has(exact.id)) {
      matchedOldIds.add(exact.id);
      matchedSpecs.set(spec.key, exact);
    }
  }

  for (const spec of incoming) {
    let existing = matchedSpecs.get(spec.key);
    if (!existing) {
      const remainingOld = (oldByPath.get(spec.path) || []).filter((s) => !matchedOldIds.has(s.id));
      const remainingNew = (incomingByPath.get(spec.path) || []).filter((s) => !matchedSpecs.has(s.key));
      if (remainingOld.length === 1 && remainingNew.length === 1) {
        existing = remainingOld[0];
        matchedOldIds.add(existing.id);
        matchedSpecs.set(spec.key, existing);
      }
    }

    if (existing) {
      const changed = existing.hash !== spec.hash;
      const nextStatus = changed && existing.status !== 'pending' ? 'stale' : existing.status;
      nextSlices[existing.id] = {
        ...existing,
        key: spec.key,
        path: spec.path,
        sector: spec.sector,
        startLine: spec.startLine,
        endLine: spec.endLine,
        lines: spec.lines,
        hash: spec.hash,
        status: nextStatus,
        syncAt: ev.at ?? existing.syncAt,
      };
      continue;
    }

    const id = nextShortId({ ...state.slices, ...nextSlices }, 's', state.retiredIds);
    const oldGroup = oldByPath.get(spec.path) || [];
    const hadReviewedHistory = oldGroup.some((slice) => slice.status !== 'pending');
    let inheritedRefs = [];
    if (!carriedPaths.has(spec.path) && oldGroup.length) {
      carriedPaths.add(spec.path);
      inheritedRefs = uniqueStrings(oldGroup.flatMap((slice) => slice.refs || []));
    }
    nextSlices[id] = {
      id,
      key: spec.key,
      path: spec.path,
      sector: spec.sector,
      startLine: spec.startLine,
      endLine: spec.endLine,
      lines: spec.lines,
      hash: spec.hash,
      status: hadReviewedHistory ? 'stale' : 'pending',
      note: '',
      refs: inheritedRefs,
      dependsOn: [],
      reviewedHash: null,
      agent: null,
      reopenReason: '',
      syncAt: ev.at ?? null,
      updatedAt: ev.at ?? null,
    };
  }

  for (const oldSlice of oldEntries) {
    if (!matchedOldIds.has(oldSlice.id)) {
      state.retiredIds[oldSlice.id] = true;
    }
  }
  state.slices = nextSlices;
}

function applyReviewEvent(state, ev) {
  const sliceIds = Array.isArray(ev.sliceIds) ? ev.sliceIds : [];
  state.updatedAt = ev.at ?? state.updatedAt;
  for (const id of sliceIds) {
    const slice = state.slices[id];
    if (!slice) continue;
    const reviewedHash = ev.reviewedHashes?.[id] || slice.hash;
    const nextRefs = Array.isArray(ev.refs) ? uniqueStrings(ev.refs) : [...(slice.refs || [])];
    const nextDeps = Array.isArray(ev.dependsOn)
      ? uniqueStrings(ev.dependsOn).filter((dep) => dep !== id)
      : [...(slice.dependsOn || [])];
    slice.status = ev.status === 'flagged' || ev.status === 'cleared' ? ev.status : (nextRefs.length ? 'flagged' : 'cleared');
    if (typeof ev.note === 'string') slice.note = ev.note;
    slice.refs = nextRefs;
    slice.dependsOn = nextDeps;
    slice.reviewedHash = reviewedHash;
    slice.agent = ev.agent || slice.agent || null;
    slice.reopenReason = '';
    slice.updatedAt = ev.at ?? slice.updatedAt;
  }
}

function applyReopenEvent(state, ev) {
  const sliceIds = Array.isArray(ev.sliceIds) ? ev.sliceIds : [];
  state.updatedAt = ev.at ?? state.updatedAt;
  for (const id of sliceIds) {
    const slice = state.slices[id];
    if (!slice) continue;
    slice.status = 'pending';
    slice.reviewedHash = null;
    slice.reopenReason = typeof ev.reason === 'string' ? ev.reason : '';
    slice.agent = ev.agent || slice.agent || null;
    slice.updatedAt = ev.at ?? slice.updatedAt;
  }
}

function applyResetEvent(state, ev) {
  for (const id of Object.keys(state.slices)) state.retiredIds[id] = true;
  state.initialized = false;
  state.scope = null;
  state.syncCount = 0;
  state.updatedAt = ev.at ?? state.updatedAt;
  state.slices = {};
}

/** Read-only replay of .pinwhy/ultra/ledger.jsonl. Never creates files or directories. */
export function readUltraLedger(cwd = process.cwd(), { untilTs = null } = {}) {
  const state = emptyUltraLedger();
  const file = ultraPaths(cwd).ledger;
  if (!fs.existsSync(file)) return state;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return state;
  }
  const hasCutoff = typeof untilTs === 'number' && Number.isFinite(untilTs);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      state.integrity.corruptLines += 1;
      continue;
    }
    if (!ev || typeof ev !== 'object') {
      state.integrity.corruptLines += 1;
      continue;
    }
    if (hasCutoff && typeof ev.at === 'number' && ev.at > untilTs) continue;
    if (ev.op === 'sync') applySyncEvent(state, ev);
    else if (ev.op === 'review') applyReviewEvent(state, ev);
    else if (ev.op === 'reopen') applyReopenEvent(state, ev);
    else if (ev.op === 'reset') applyResetEvent(state, ev);
  }
  return state;
}
