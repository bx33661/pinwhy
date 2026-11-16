#!/usr/bin/env node
/** Recreate the synthetic security-audit demo board (does not touch the repo root board). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, 'test/fixtures/audit-demo-board');
const seed = path.join(demo, 'seed.jsonl');
const cli = path.join(root, 'bin/pinwhy.js');
const run = (args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `pinwhy ${args.join(' ')} failed\n`);
    process.exit(result.status || 1);
  }
  return result.stdout;
};

if (!fs.existsSync(seed)) {
  console.error(`Missing seed file: ${seed}`);
  process.exit(1);
}

fs.rmSync(path.join(demo, '.pinwhy'), { recursive: true, force: true });
fs.mkdirSync(demo, { recursive: true });
run(['init', '--title', 'Audit demo · admin API authorization', '--cwd', demo, '--here', '--json']);
run(['batch', '--file', seed, '--request-id', 'audit-demo-seed', '--cwd', demo, '--no-init', '--json']);
run([
  'checkpoint',
  '--summary',
  'Demo board seeded: IDOR candidate static-confirmed on export; competing ACL hypothesis refuted; MIME candidate refuted; worker path uncovered.',
  '--cwd',
  demo,
  '--no-init',
]);

const rel = path.relative(root, demo);
console.log(`Demo board ready: ${rel}`);
console.log('Serve with audit deep link:');
console.log(`  node bin/pinwhy.js serve --cwd ${rel} --open`);
console.log('  → switch to 审计, or open ?workspace=audit&issue=q1&candidate=fd1');
