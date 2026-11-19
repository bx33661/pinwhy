import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanTargetTree, sliceContent } from '../lib/ultra/scanner.js';
import { buildUltraSnapshot, markUltraDone, nextUltraBatches, reopenUltraSlices, syncUltra } from '../lib/ultra/engine.js';
import { addEdge, addNode } from '../lib/store.js';
import { startServer } from '../lib/server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PINWHY_CLI = path.join(ROOT, 'bin', 'pinwhy.js');
const ULTRA_CLI = path.join(ROOT, 'bin', 'pinwhy-ultra.js');

function run(cli, args, cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PINWHY_')) delete env[key];
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 15000 });
}

function makeTempProject(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-ultra-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

test('scanner filters noise/binaries, retains Dockerfile/configs, slices long files at function boundaries, and checks scope containment', (t) => {
  const dir = makeTempProject(t);
  const longLines = [];
  for (let i = 1; i <= 95; i++) longLines.push(`// line ${i}`);
  longLines.push('export function secondHandler() {');
  for (let i = 97; i <= 165; i++) longLines.push(`  const x${i} = ${i};`);
  longLines.push('}');

  writeFiles(dir, {
    'Dockerfile': 'FROM node:22-alpine\nCMD ["node", "src/app.js"]\n',
    'src/auth/login.js': 'export function login() { return true; }\n',
    'src/target/handler.js': 'export function targetHandler() { return true; }\n',
    'rustapp/Cargo.toml': '[package]\nname = "rustapp"\n',
    'rustapp/target/debug/out.rs': 'pub fn compiled() {}\n',
    'src/long.js': `${longLines.join('\n')}\n`,
    'node_modules/pkg/index.js': 'module.exports = 1;\n',
    'dist/bundle.min.js': 'console.log(1);\n',
    'package-lock.json': '{"lockfileVersion":3}\n',
    'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
    'assets/raw.dat': Buffer.from([0x41, 0x42, 0x00, 0x43]),
  });

  const scanned = scanTargetTree(dir, { maxSliceLines: 110 });
  const paths = new Set(scanned.files);
  assert.equal(paths.has('Dockerfile'), true);
  assert.equal(paths.has('src/auth/login.js'), true);
  assert.equal(paths.has('src/target/handler.js'), true);
  assert.equal(paths.has('rustapp/Cargo.toml'), true);
  assert.equal(paths.has('rustapp/target/debug/out.rs'), false);
  assert.equal(paths.has('src/long.js'), true);
  assert.equal(paths.has('node_modules/pkg/index.js'), false);
  assert.equal(paths.has('dist/bundle.min.js'), false);
  assert.equal(paths.has('package-lock.json'), false);
  assert.equal(paths.has('assets/logo.png'), false);
  assert.equal(paths.has('assets/raw.dat'), false);
  assert.equal(scanned.skippedBinary, 1);

  const longSlices = scanned.slices.filter((s) => s.path === 'src/long.js');
  assert.equal(longSlices.length, 2);
  assert.equal(longSlices[0].startLine, 1);
  assert.equal(longSlices[0].endLine, 95);
  assert.equal(longSlices[1].startLine, 96);
  assert.equal(longSlices[1].endLine, longLines.length);
  assert.ok(!JSON.stringify(scanned).includes(dir), 'scanner output must omit host absolute paths');

  assert.throws(() => scanTargetTree(dir, { scope: '../outside' }), (err) => err.code === 'invalid_value');
  assert.equal(sliceContent('empty.js', '').length, 0);
});

test('Ultra CLI lifecycle enforces breadth completion, shallow bounce, dependency propagation, and stale invalidation without polluting events.jsonl', (t) => {
  const dir = makeTempProject(t);
  writeFiles(dir, {
    'src/auth/guard.js': 'export function guard(user) {\n  return Boolean(user?.isAdmin);\n}\n',
    'src/export/run.js': 'export function runExport(req) {\n  return req.query.id;\n}\n',
    'src/billing/pay.js': 'export function charge(cents) {\n  return cents > 0;\n}\n',
  });

  assert.equal(run(PINWHY_CLI, ['init', '--title', 'Ultra lifecycle test', '--cwd', dir, '--json'], dir).status, 0);
  const goalRes = JSON.parse(run(PINWHY_CLI, ['node', 'add', 'goal', 'Audit all routes', '--cwd', dir, '--no-init', '--json'], dir).stdout);
  const goalId = goalRes.node.id;
  const hypRes = JSON.parse(run(PINWHY_CLI, ['node', 'add', 'hypothesis', 'Deferred exploit via billing pivot', '--status', 'deferred', '--tag', 'pivot=session-id', '--to', goalId, '--cwd', dir, '--no-init', '--json'], dir).stdout);
  const primRes = JSON.parse(run(PINWHY_CLI, ['node', 'add', 'observation', 'Session id controllable via query param', '--confidence', 'static-confirmed', '--tag', 'role=primitive', '--tag', 'pivot=session-id', '--cwd', dir, '--no-init', '--json'], dir).stdout);
  const verdictRes = JSON.parse(run(PINWHY_CLI, ['node', 'add', 'finding', 'Unbacked finding claim', '--status', 'confirmed', '--cwd', dir, '--no-init', '--json'], dir).stdout);
  const anomalyRes = JSON.parse(run(PINWHY_CLI, ['node', 'add', 'question', 'Unexplained debug header check', '--tag', 'role=anomaly', '--cwd', dir, '--no-init', '--json'], dir).stdout);

  const eventsFile = path.join(dir, '.pinwhy', 'events.jsonl');
  const eventsBeforeSync = fs.readFileSync(eventsFile, 'utf8');

  const syncRes = JSON.parse(run(ULTRA_CLI, ['sync', '--cwd', dir, '--json'], dir).stdout);
  assert.equal(syncRes.schema, 'pinwhy.ultra-sync.v1');
  assert.equal(syncRes.stats.totalActive, 3);
  assert.equal(fs.readFileSync(eventsFile, 'utf8'), eventsBeforeSync, 'sync must not write mechanical slices to events.jsonl');

  // Parallel next returns non-overlapping batches across distinct sectors.
  const nextMulti = nextUltraBatches(dir, { workers: 2, budgetLines: 300 });
  assert.equal(nextMulti.batches.length, 2);
  const batchIds = nextMulti.batches.flatMap((b) => b.slices.map((s) => s.id));
  assert.equal(new Set(batchIds).size, batchIds.length);
  assert.notEqual(nextMulti.batches[0].sector, nextMulti.batches[1].sector);

  const byPath = new Map(syncRes.snapshot.slices.map((s) => [s.path, s.id]));
  const guardId = byPath.get('src/auth/guard.js');
  const exportId = byPath.get('src/export/run.js');
  const payId = byPath.get('src/billing/pay.js');

  // 1) Insufficient note without refs bounces back as shallow.
  const shallowDone = markUltraDone(dir, { sliceIds: [payId], note: 'ok' });
  assert.equal(shallowDone.updated[0].effectiveStatus, 'shallow');
  assert.equal(shallowDone.updated[0].shallowReason, 'insufficient-note');

  // 2) Depending on an unread guard slice bounces export slice back as shallow.
  const depDone = markUltraDone(dir, {
    sliceIds: [exportId],
    note: 'Calls guard(user) from auth/guard before exporting rows',
    dependsOn: ['src/auth/guard.js'],
    refs: [primRes.node.id],
  });
  assert.equal(depDone.updated[0].effectiveStatus, 'shallow');
  assert.equal(depDone.updated[0].shallowReason, 'unverified-dependency');

  // Guard slice blocks exportId so next prioritizes guard ahead of ordinary shallow/pending slices
  // and holds back exportId until guard is reviewed.
  const depPriorityNext = nextUltraBatches(dir, { workers: 4, budgetLines: 300 });
  const depBatchSlices = depPriorityNext.batches.flatMap((b) => b.slices);
  assert.equal(depBatchSlices[0].id, guardId);
  assert.deepEqual(depBatchSlices[0].blockingFor, [exportId]);
  assert.ok(!depBatchSlices.some((s) => s.id === exportId), 'unverified-dependency slice waits while guard is unread');

  // Verify invalid main-board ref is rejected.
  assert.throws(() => markUltraDone(dir, { sliceIds: [guardId], note: 'Valid note text here', refs: ['missing99'] }), (err) => err.code === 'not_found');

  const midCheck = JSON.parse(run(ULTRA_CLI, ['check', '--cwd', dir, '--json'], dir).stdout);
  assert.equal(midCheck.breadthComplete, false);
  assert.equal(midCheck.summary.shallow, 2);
  assert.equal(midCheck.summary.pending, 1);
  assert.equal(midCheck.gaps.awakenedChains.length, 1);
  assert.equal(midCheck.gaps.awakenedChains[0].hypothesis.id, hypRes.node.id);
  assert.equal(midCheck.gaps.unbackedVerdicts[0].id, verdictRes.node.id);
  assert.equal(midCheck.gaps.unresolvedAnomalies[0].id, anomalyRes.node.id);

  // Clear guard and pay properly (testing path:line resolution); export heals from shallow -> flagged!
  markUltraDone(dir, { sliceIds: ['src/auth/guard.js:2'], note: 'Verified user?.isAdmin check enforces boolean role flag' });
  markUltraDone(dir, { sliceIds: [payId], note: 'Pure arithmetic check cents > 0, no external sink or state mutation' });

  const healedCheck = buildUltraSnapshot(dir, { checkDisk: true });
  assert.equal(healedCheck.breadthComplete, true);
  assert.equal(healedCheck.commitmentComplete, false, 'unbackedVerdict blocks commitmentComplete');
  assert.equal(healedCheck.summary.shallow, 0);
  assert.equal(healedCheck.summary.pending, 0);
  assert.equal(healedCheck.slices.find((s) => s.id === exportId).effectiveStatus, 'flagged');
  assert.equal(healedCheck.allClear, false, 'open threads/awakened chains/unbacked verdicts block allClear');
  assert.equal(fs.readFileSync(eventsFile, 'utf8'), eventsBeforeSync, 'harmless slice reviews must not pollute events.jsonl');

  // Concise CJK note >= 6 chars succeeds without hitting insufficient-note shallow threshold.
  const cjkDone = markUltraDone(dir, { sliceIds: [payId], note: '纯算术检查无输入' });
  assert.equal(cjkDone.updated[0].effectiveStatus, 'cleared');

  // Human interjection on a blank/cleared slice flips it back to shallow(human-followup) at Rank 0!
  const humanQ = addNode({
    type: 'question',
    title: 'What if negative cents bypasses charge?',
    status: 'open',
    at: 'src/billing/pay.js:1',
    tags: [`slice=${payId}`],
    author: 'human',
  }, dir);
  const followupSnap = buildUltraSnapshot(dir, { checkDisk: false });
  const paySliceFollowup = followupSnap.slices.find((s) => s.id === payId);
  assert.equal(paySliceFollowup.effectiveStatus, 'shallow');
  assert.equal(paySliceFollowup.shallowReason, 'human-followup');
  assert.deepEqual(paySliceFollowup.humanFollowups, [humanQ.node.id]);
  const rank0Next = nextUltraBatches(dir, { workers: 1, budgetLines: 300 });
  assert.equal(rank0Next.batches[0].slices[0].id, payId);

  // Addressing the human question via --refs clears human-followup; backing verdict completes commitments
  // even while open threads/awakened chains honestly remain on the board (commitmentComplete=true, allClear=false).
  const answeredDone = markUltraDone(dir, {
    sliceIds: [payId],
    note: 'Checked cents > 0 rejects negatives and returns false',
    refs: [humanQ.node.id],
  });
  assert.equal(answeredDone.updated[0].effectiveStatus, 'flagged');
  assert.deepEqual(answeredDone.updated[0].humanFollowups, []);

  addEdge({ from: primRes.node.id, to: verdictRes.node.id, kind: 'supports', author: 'agent:primary' }, dir);
  const committedCheck = buildUltraSnapshot(dir, { checkDisk: true });
  assert.equal(committedCheck.breadthComplete, true);
  assert.equal(committedCheck.commitmentComplete, true);
  assert.equal(committedCheck.allClear, false, 'honest open threads keep allClear false without invalidating commitments');

  // Refresh eventsBeforeSync baseline after explicit human/edge test writes for stale/reset assertions.
  const eventsAfterHumanTest = fs.readFileSync(eventsFile, 'utf8');

  // Mutate a source file on disk: check detects diskStale before sync, and sync marks it stale.
  fs.appendFileSync(path.join(dir, 'src/auth/guard.js'), '// new bypass branch\n');
  const staleCheck = buildUltraSnapshot(dir, { checkDisk: true });
  assert.equal(staleCheck.breadthComplete, false);
  assert.deepEqual(staleCheck.gaps.diskStaleIds, [guardId]);

  const resync = syncUltra(dir);
  assert.equal(resync.stats.stale, 1);
  assert.equal(resync.snapshot.slices.find((s) => s.id === guardId).effectiveStatus, 'stale');
  // Export slice depending on stale guard automatically bounces back to shallow!
  assert.equal(resync.snapshot.slices.find((s) => s.id === exportId).effectiveStatus, 'shallow');

  // Removing guard.js on disk also keeps export in shallow (deleted dependency),
  // and passing --depends-on none clears the obsolete dependency upon re-review.
  fs.rmSync(path.join(dir, 'src/auth/guard.js'));
  const removedGuardSync = syncUltra(dir);
  assert.equal(removedGuardSync.snapshot.slices.find((s) => s.id === exportId).effectiveStatus, 'shallow');
  assert.equal(removedGuardSync.snapshot.slices.find((s) => s.id === exportId).shallowReason, 'unverified-dependency');

  const clearedExport = markUltraDone(dir, {
    sliceIds: ['src/export/run.js:1-3'],
    note: 'Refactored export handler no longer relies on removed guard module',
    dependsOn: ['none'],
  });
  assert.equal(clearedExport.updated[0].effectiveStatus, 'flagged');
  assert.deepEqual(clearedExport.updated[0].dependsOn, []);

  // Reopen & reset do not touch events.jsonl.
  const reopened = reopenUltraSlices(dir, { sliceIds: [payId], reason: 'Re-check integer overflow' });
  assert.equal(reopened.reopened[0].effectiveStatus, 'pending');
  assert.equal(run(ULTRA_CLI, ['reset', '--yes', '--cwd', dir, '--json'], dir).status, 0);
  assert.equal(buildUltraSnapshot(dir).initialized, false);
  assert.equal(fs.readFileSync(eventsFile, 'utf8'), eventsAfterHumanTest);
});

test('server exposes /api/ultra and /ultra-events SSE stream, and HTML export embeds window.__PINWHY_ULTRA__', async (t) => {
  const dir = makeTempProject(t);
  writeFiles(dir, { 'src/app.js': 'export const ok = true;\n' });
  assert.equal(run(PINWHY_CLI, ['init', '--title', 'Server Ultra Test', '--cwd', dir], dir).status, 0);
  assert.equal(run(PINWHY_CLI, ['node', 'add', 'goal', 'Inspect app', '--cwd', dir, '--no-init'], dir).status, 0);
  assert.equal(run(PINWHY_CLI, ['checkpoint', '--summary', 'cp1', '--cwd', dir, '--no-init'], dir).status, 0);
  await new Promise((r) => setTimeout(r, 15));
  const synced = syncUltra(dir);
  const s1Id = synced.snapshot.slices[0].id;
  assert.equal(run(PINWHY_CLI, ['checkpoint', '--summary', 'cp2', '--cwd', dir, '--no-init'], dir).status, 0);
  await new Promise((r) => setTimeout(r, 15));
  markUltraDone(dir, { sliceIds: [s1Id], note: 'Pure constant ok=true export with zero inputs' });

  const server = await startServer({ cwd: dir, port: 0, readOnly: true });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const res = await fetch(`${base}/api/ultra`);
  assert.equal(res.status, 200);
  const snap = await res.json();
  assert.equal(snap.schema, 'pinwhy.ultra.v1');
  assert.equal(snap.initialized, true);
  assert.equal(snap.summary.totalSlices, 1);
  assert.equal(snap.summary.coveredSlices, 1);

  const cp1Res = await fetch(`${base}/api/ultra?asOf=cp1`);
  assert.equal(cp1Res.status, 200);
  const cp1Snap = await cp1Res.json();
  assert.equal(cp1Snap.initialized, false, '?asOf=cp1 must not leak later sync events');

  const cp2Res = await fetch(`${base}/api/ultra?asOf=cp2`);
  assert.equal(cp2Res.status, 200);
  const cp2Snap = await cp2Res.json();
  assert.equal(cp2Snap.initialized, true);
  assert.equal(cp2Snap.summary.pending, 1, '?asOf=cp2 must reflect synced pending slice before post-cp2 review');
  assert.equal(cp2Snap.summary.coveredSlices, 0);

  // Check SSE endpoint delivers an `event: ultra` frame cleanly.
  const frame = await new Promise((resolve, reject) => {
    const req = http.get(`${base}/ultra-events`, (stream) => {
      let buf = '';
      stream.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (buf.includes('\n\n')) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET') reject(err);
    });
  });
  assert.match(frame, /^event: ultra\ndata: /);
  const ssePayload = JSON.parse(frame.split('\n').find((l) => l.startsWith('data: ')).slice(6));
  assert.equal(ssePayload.schema, 'pinwhy.ultra.v1');

  // Verify offline HTML export embeds __PINWHY_ULTRA__ when built assets exist.
  if (fs.existsSync(path.join(ROOT, 'public', 'index.html'))) {
    const htmlOut = path.join(dir, 'ultra-export.html');
    assert.equal(run(PINWHY_CLI, ['export', '--out', htmlOut, '--cwd', dir], dir).status, 0);
    const html = fs.readFileSync(htmlOut, 'utf8');
    assert.match(html, /window\.__PINWHY_DATA__ = .*;/);
    const ultraLine = html.match(/window\.__PINWHY_ULTRA__ = (.*);/);
    assert.ok(ultraLine, 'offline HTML embeds __PINWHY_ULTRA__ when Ultra ledger is initialized');
    assert.equal(JSON.parse(ultraLine[1]).summary.totalSlices, 1);
  }
});

test('frontend pure ultra projection handles ledger and board-derived modes without mutating snapshots', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-ultra-ts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync(process.execPath, [
    path.join(ROOT, 'node_modules/typescript/bin/tsc'),
    '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck',
    '--outDir', dir, path.join(ROOT, 'web/src/workspace/ultra.ts'),
  ], { cwd: dir });
  for (const file of ['types.js', 'workspace/ultra.js']) {
    const target = path.join(dir, file);
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_all, name) => `from '${name}.js'`));
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const { buildUltraModel } = await import(pathToFileURL(path.join(dir, 'workspace/ultra.js')).href);

  const graph = {
    meta: { title: 'Synthetic Ultra Board' },
    nodes: {
      g1: { id: 'g1', type: 'goal', title: 'Audit boundaries', status: 'open' },
      f1: { id: 'f1', type: 'fact', title: 'Header read primitive', status: 'confirmed', confidence: 'static-confirmed', loc: { path: 'src/auth/session.js', line: 5 }, tags: ['role=primitive', 'pivot=role'] },
      v1: { id: 'v1', type: 'vuln', title: 'Privilege escalation in export', severity: 'critical', confidence: 'static-confirmed', status: 'confirmed', loc: { path: 'src/export/run.js', line: 8 } },
      h1: { id: 'h1', type: 'hypothesis', title: 'Deferred chain via role pivot', status: 'deferred', loc: { path: 'src/billing/pay.js', line: 4 }, tags: ['pivot=role'] },
      hum1: { id: 'hum1', type: 'question', title: 'Check edge proxy', status: 'open', author: 'human' },
    },
    edges: {
      e1: { id: 'e1', from: 'f1', to: 'v1', kind: 'supports' },
    },
    cursors: {
      'agent:auth': { id: 'c1', agentId: 'agent:auth', to: 'f1' },
    },
  };

  const beforeGraph = JSON.stringify(graph);

  // 1) Board-derived fallback mode (no ledger).
  const derived = buildUltraModel(graph, null, { lens: 'chains', filter: 'all' });
  assert.equal(derived.sourceMode, 'board-derived');
  assert.equal(derived.sectors.length, 4);
  assert.ok(derived.chords.some((c) => c.fromId === 'f1' && c.toId === 'v1'));
  assert.ok(derived.chords.some((c) => c.isAwakened && c.fromId === 'f1' && c.toId === 'h1'));
  assert.equal(derived.satellites.length, 1);
  assert.equal(derived.metrics.humanSignals, 1);

  // Goal alone without loc never creates a spurious 'unscoped' sector.
  const goalOnlyDerived = buildUltraModel({
    meta: { title: 'Goal filter test' },
    nodes: { g1: graph.nodes.g1, f1: graph.nodes.f1 },
    edges: {},
    cursors: {},
  }, null);
  assert.equal(goalOnlyDerived.sectors.length, 1);
  assert.equal(goalOnlyDerived.sectors[0].sector, 'src/auth');

  // 2) Ledger mode.
  const ultraSnap = {
    schema: 'pinwhy.ultra.v1',
    readOnly: true,
    prescriptive: false,
    initialized: true,
    scope: null,
    maxSliceLines: 320,
    syncCount: 1,
    updatedAt: 1000,
    summary: {
      totalSlices: 3, totalLines: 60, pending: 1, stale: 0, shallow: 0, cleared: 0, flagged: 2,
      coveredSlices: 2, sectors: 3, openThreads: 1, unbackedVerdicts: 0, awakenedChains: 1,
      unresolvedAnomalies: 0, humanSignals: 1, untrackedFiles: 0, diskStale: 0, remainingSlices: 1, coverageRatio: 0.6667,
    },
    slices: [
      { id: 's1', key: 'src/auth/session.js:1-20', path: 'src/auth/session.js', sector: 'src/auth', startLine: 1, endLine: 20, lines: 20, hash: 'aaa', status: 'flagged', effectiveStatus: 'flagged', refs: ['f1'], dependsOn: [] },
      { id: 's2', key: 'src/export/run.js:1-20', path: 'src/export/run.js', sector: 'src/export', startLine: 1, endLine: 20, lines: 20, hash: 'bbb', status: 'flagged', effectiveStatus: 'flagged', refs: ['v1'], dependsOn: ['s1'] },
      { id: 's3', key: 'src/billing/pay.js:1-20', path: 'src/billing/pay.js', sector: 'src/billing', startLine: 1, endLine: 20, lines: 20, hash: 'ccc', status: 'pending', effectiveStatus: 'pending', refs: [], dependsOn: [] },
    ],
    sectors: [],
    gaps: {
      openThreads: [], unbackedVerdicts: [], awakenedChains: [{ hypothesis: { id: 'h1', type: 'hypothesis', title: 'Deferred', status: 'deferred', severity: null, confidence: null }, matches: [{ nodeId: 'f1', title: 'Header read', via: 'pivot=role' }] }],
      unresolvedAnomalies: [], humanSignals: [], untrackedFiles: [], diskStaleIds: [], shallowSlices: [], staleSlices: [],
    },
    breadthComplete: false,
    allClear: false,
  };

  const ledgerModel = buildUltraModel(graph, ultraSnap, { lens: 'surface', filter: 'all' });
  assert.equal(ledgerModel.sourceMode, 'ledger');
  assert.equal(ledgerModel.metrics.blindSpots, 1);
  assert.ok(ledgerModel.chords.some((c) => c.kind === 'depends-on' && c.fromId === 's2' && c.toId === 's1'));
  assert.ok(ledgerModel.chords.some((c) => c.isAwakened && c.fromId === 'f1' && c.toId === 'h1'));
  assert.ok(ledgerModel.busLaneCount >= 1);
  assert.ok(ledgerModel.chords.every((c) => typeof c.laneIndex === 'number' && c.laneIndex >= 0));
  assert.equal(ledgerModel.nextWave?.sector, 'src/billing');
  assert.equal(ledgerModel.nextWave?.slices[0]?.id, 's3');
  assert.equal(JSON.stringify(graph), beforeGraph);
});
