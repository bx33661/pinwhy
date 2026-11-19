#!/usr/bin/env node
/** Recreate the synthetic Ultra demo board + coverage ledger (never touches real boards). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addNode } from '../lib/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'test/fixtures/ultra-demo-board');
const cli = path.join(root, 'bin/pinwhy.js');
const ultraCli = path.join(root, 'bin/pinwhy-ultra.js');

const SEED_EVENTS = [
  { op: 'node', ref: 'goal', type: 'goal', title: 'Pre-release security sweep across auth, export, webhook, and billing', detail: 'Synthetic Ultra harness demo board showing slice-level coverage, blind spots, cross-sector chains, and human signals.', status: 'open' },
  { op: 'node', ref: 'q1', type: 'question', title: 'Does verifySession trust caller-supplied role header?', detail: 'Inspect src/auth/session.js and downstream consumers.', status: 'open', at: 'src/auth/session.js:5', to: '$goal', rel: 'related-to', tags: ['component=src/auth'] },
  { op: 'node', ref: 'f1', type: 'fact', title: 'verifySession reads role directly from x-role-hint header', detail: 'No HMAC or session-store lookup binds x-role-hint to the server session.', status: 'confirmed', confidence: 'static-confirmed', at: 'src/auth/session.js:5', to: '$q1', rel: 'supports', label: 'Trusted header read', tags: ['component=src/auth', 'role=primitive', 'pivot=actor-role'] },
  { op: 'node', ref: 'v1', type: 'vuln', title: 'Header spoofing escalates session actor role before export', detail: 'exportBundle relies on verifySession(req) and trusts actor.role from x-role-hint without signature verification.', severity: 'critical', confidence: 'static-confirmed', status: 'confirmed', at: 'src/export/archive.js:5', to: '$goal', rel: 'related-to', tags: ['component=src/export'] },
  { op: 'link', from: '$f1', to: '$v1', rel: 'supports', label: 'Actor role directly enters exportBundle' },
  { op: 'node', ref: 'f2', type: 'finding', title: 'Path traversal primitive in exportBundle archiveName', detail: 'req.query.name is concatenated directly into /tmp/exports/${archiveName} without basename or root confinement.', severity: 'high', confidence: 'static-confirmed', status: 'open', at: 'src/export/archive.js:7', to: '$goal', rel: 'related-to', tags: ['component=src/export', 'role=primitive', 'pivot=tmp-exports'] },
  { op: 'node', ref: 'h1', type: 'hypothesis', title: 'OAuth callback allows prefix-confusion open redirect', detail: 'redirectUri.startsWith("https://trusted.example") accepts https://trusted.example.attacker.invalid.', status: 'active', confidence: 'static-confirmed', at: 'src/auth/oauth.js:5', to: '$goal', rel: 'related-to', tags: ['component=src/auth'] },
  { op: 'node', ref: 'h2', type: 'hypothesis', title: 'Writable /tmp/exports archive could overwrite runtime script under container user', detail: 'Deferred pending confirmation of writable app directory and worker execution paths.', status: 'deferred', confidence: 'suspected', at: 'Dockerfile:4', to: '$goal', rel: 'related-to', tags: ['component=root', 'pivot=tmp-exports'] },
  { op: 'node', ref: 'q2', type: 'question', title: 'Check webhook signature check and billing coupon replay under concurrency', detail: 'Pending blind-spot inspection across webhook and billing modules.', status: 'open', at: 'src/billing/coupon.js:2', to: '$goal', rel: 'related-to', tags: ['component=src/billing'] },
];

function run(entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `${path.basename(entry)} ${args.join(' ')} failed\n`);
    process.exit(result.status || 1);
  }
  return result.stdout;
}

fs.rmSync(path.join(demo, '.pinwhy'), { recursive: true, force: true });
fs.mkdirSync(demo, { recursive: true });
run(cli, ['init', '--title', 'Ultra demo · pre-release security sweep', '--cwd', demo, '--here', '--json']);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-ultra-seed-'));
let refs = {};
try {
  const seedFile = path.join(tmpDir, 'seed.jsonl');
  fs.writeFileSync(seedFile, `${SEED_EVENTS.map((ev) => JSON.stringify(ev)).join('\n')}\n`);
  const batchResult = JSON.parse(run(cli, ['batch', '--file', seedFile, '--request-id', 'ultra-demo-seed', '--cwd', demo, '--no-init', '--json']));
  refs = batchResult.refs || {};
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
const id = (ref) => refs[ref] || ref;

addNode({
  type: 'question',
  title: 'Check if NGINX strips x-role-hint on edge ingress before reaching Node',
  detail: 'Added by human reviewer in Ultra drawer to verify edge stripping rules.',
  status: 'open',
  at: 'src/auth/session.js:5',
  target: id('v1'),
  relation: 'related-to',
  tags: ['component=src/auth'],
  author: 'human',
}, demo);

// Position two parallel agent cursors in distinct sectors.
run(cli, ['cursor', id('v1'), '--reason', 'Verifying downstream exportBundle impact', '--cwd', demo, '--agent', 'export-diver', '--no-init']);
run(cli, ['cursor', id('h1'), '--reason', 'Checking OAuth prefix match edge cases', '--cwd', demo, '--agent', 'auth-diver', '--no-init']);

// Sync all real source/config files in the synthetic demo fixture.
const syncResult = JSON.parse(run(ultraCli, ['sync', '--cwd', demo, '--json']));
const byPath = new Map(syncResult.snapshot.slices.map((s) => [s.path, s.id]));

// Mark some slices reviewed, leave webhook & billing as pending blind spots,
// and leave Dockerfile shallow (insufficient note) to showcase all slice states.
if (byPath.has('src/auth/session.js')) {
  run(ultraCli, [
    'done', byPath.get('src/auth/session.js'),
    '--note', 'verifySession trusts x-role-hint header without signature check',
    '--refs', `${id('f1')},${id('q1')}`,
    '--cwd', demo, '--agent', 'auth-diver', '--json',
  ]);
}
if (byPath.has('src/auth/oauth.js')) {
  run(ultraCli, [
    'done', byPath.get('src/auth/oauth.js'),
    '--note', 'startsWith check allows prefix-confusion redirect to attacker subdomain',
    '--refs', id('h1'),
    '--cwd', demo, '--agent', 'auth-diver', '--json',
  ]);
}
if (byPath.has('src/export/archive.js')) {
  run(ultraCli, [
    'done', byPath.get('src/export/archive.js'),
    '--note', 'exportBundle relies on auth/session guard and concatenates req.query.name into /tmp/exports',
    '--depends-on', 'src/auth/session.js',
    '--refs', `${id('v1')},${id('f2')}`,
    '--cwd', demo, '--agent', 'export-diver', '--json',
  ]);
}
if (byPath.has('Dockerfile')) {
  // Deliberately short note (<12 chars) with no refs so check flags it as shallow.
  run(ultraCli, [
    'done', byPath.get('Dockerfile'),
    '--note', 'ok',
    '--cwd', demo, '--agent', 'export-diver', '--json',
  ]);
}

run(cli, [
  'checkpoint',
  '--summary',
  'Ultra sweep wave 1: auth & export slices mapped; webhook/verify.js and billing/coupon.js remain unread blind spots.',
  '--cwd', demo, '--no-init',
]);

const rel = path.relative(root, demo);
console.log(`Ultra demo board ready: ${rel}`);
console.log('Serve and open Pinwhy Ultra workspace:');
console.log(`  node bin/pinwhy.js serve --cwd ${rel} --open`);
console.log('  → open ?workspace=ultra');
