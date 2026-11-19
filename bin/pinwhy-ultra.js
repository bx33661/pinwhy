#!/usr/bin/env node
// Pinwhy Ultra Harness CLI — deterministic breadth coverage & cognitive gap checks
// layered cleanly over the Pinwhy core without altering the core schema or events.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultAgentId } from '../lib/store.js';
import { findRoot, isInitialized } from '../lib/storage/board.js';
import {
  buildUltraSnapshot,
  markUltraDone,
  nextUltraBatches,
  reopenUltraSlices,
  resetUltra,
  syncUltra,
} from '../lib/ultra/engine.js';
import { DEFAULT_MAX_SLICE_LINES } from '../lib/ultra/scanner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const VALUE_FLAGS = new Set([
  '--cwd', '--target', '--scope', '--max-lines', '--budget-lines',
  '--max-slices', '--workers', '--sector', '--note', '--refs',
  '--depends-on', '--status', '--reason', '--agent',
]);
const REPEAT_FLAGS = new Set(['--refs', '--depends-on']);
const BOOL_FLAGS = new Set(['--json', '--yes', '--no-disk', '--help', '-h', '--version', '-v']);

function usageError(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseArgs(argv) {
  const positionals = [];
  const opts = { refs: [], dependsOn: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }
    if (BOOL_FLAGS.has(token)) {
      if (token === '-h') opts.help = true;
      else if (token === '-v') opts.version = true;
      else opts[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
      continue;
    }
    const eq = token.indexOf('=');
    const flag = eq > 0 ? token.slice(0, eq) : token;
    if (!VALUE_FLAGS.has(flag)) {
      throw usageError('unknown_option', `Unknown option: ${flag}`);
    }
    const value = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (value === undefined) {
      throw usageError('missing_value', `Option ${flag} requires a value`);
    }
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (REPEAT_FLAGS.has(flag)) {
      for (const part of String(value).split(',')) {
        const trimmed = part.trim();
        if (trimmed) opts[key].push(trimmed);
      }
    } else {
      opts[key] = value;
    }
  }
  return { command: positionals[0] || 'help', args: positionals.slice(1), opts };
}

function resolveBoardCwd(opts) {
  if (opts.cwd) return path.resolve(opts.cwd);
  if (process.env.PINWHY_CWD) return path.resolve(process.env.PINWHY_CWD);
  return findRoot(process.cwd()) || process.cwd();
}

function helpText() {
  return `pinwhy-ultra v${VERSION} — Deterministic breadth coverage & gap harness for Pinwhy

Usage:
  pinwhy-ultra <command> [options]

Commands:
  sync                       Scan source/config files, slice large files, track hashes
  next                       Pull deterministic non-overlapping slice batches within line budget
  done <slice...>            Mark slices reviewed with note, board refs, and cross-slice deps
  reopen <slice...>          Reopen slices back to pending for fresh inspection
  check | status             Read-only audit of breadth coverage, shallow notes, and board gaps
  reset --yes                Reset the Ultra slice ledger (keeps .pinwhy/events.jsonl intact)

Options:
  --cwd <dir>                Project directory owning .pinwhy/
  --target <dir>             Source tree root to scan (defaults to --cwd)
  --scope <relpath>          Restrict scan to a subdirectory or file inside --target
  --max-lines <n>            Max lines per source slice (default: ${DEFAULT_MAX_SLICE_LINES})
  --budget-lines <n>         Line quota per worker batch in next (default: 420)
  --max-slices <n>           Max slices per worker batch in next (default: 4)
  --workers <n>              Number of parallel worker batches in next (default: 1)
  --sector <name>            Restrict next to one module sector
  --note <text>              Evidence-backed review summary for done
  --refs <id,...>            Main-board node IDs produced while inspecting this slice
  --depends-on <slice,...>   Other slice IDs or paths providing relied-upon guards
  --status <cleared|flagged> Explicit review status (defaults to flagged when --refs is given)
  --reason <text>            Reason for reopening slices
  --agent <name>             Explicit agent identity (default: PINWHY_AGENT or agent:primary)
  --no-disk                  Skip disk comparison in check
  --json                     Emit machine-readable JSON output
`;
}

function formatCheckText(snap) {
  const s = snap.summary;
  const pct = Math.round((s.coverageRatio || 0) * 100);
  const lines = [
    `Pinwhy Ultra · ${snap.initialized ? `${s.coveredSlices}/${s.totalSlices} slices covered (${pct}%)` : 'not initialized (run pinwhy-ultra sync)'}`,
    `Pending: ${s.pending}  Stale: ${s.stale}  Shallow: ${s.shallow}  Flagged: ${s.flagged}  Cleared: ${s.cleared}`,
    `Commitments · breadthComplete=${snap.breadthComplete}  commitmentComplete=${snap.commitmentComplete}  unbackedVerdicts=${s.unbackedVerdicts}`,
    `Signals (retain if open boundary) · openThreads=${s.openThreads}  awakenedChains=${s.awakenedChains}  anomalies=${s.unresolvedAnomalies}  humanSignals=${s.humanSignals}  allClear=${snap.allClear}`,
  ];
  if (snap.gaps.untrackedFiles.length) {
    lines.push(`Untracked files on disk (${snap.gaps.untrackedFiles.length}): ${snap.gaps.untrackedFiles.slice(0, 8).join(', ')}`);
  }
  if (snap.gaps.shallowSlices.length) {
    lines.push('Shallow reviews bounced back:');
    for (const item of snap.gaps.shallowSlices.slice(0, 8)) {
      const followups = item.humanFollowups?.length ? ` -> ${item.humanFollowups.join(',')}` : '';
      lines.push(`  - [${item.id}] ${item.path}:${item.startLine}-${item.endLine} (${item.reason}${followups})`);
    }
  }
  return lines.join('\n');
}

function formatNextText(res) {
  if (!res.initialized) return 'Ultra ledger is not initialized. Run: pinwhy-ultra sync';
  if (!res.batches.length) return `No actionable slices (remainingSlices=${res.remainingSlices}).`;
  const lines = [`Remaining slices: ${res.remainingSlices} (actionable: ${res.actionableSlices ?? res.remainingSlices})`];
  for (const batch of res.batches) {
    lines.push(`Batch #${batch.workerIndex} · sector=${batch.sector} · ${batch.totalLines} lines`);
    for (const item of batch.slices) {
      const followup = item.humanFollowups?.length ? ` -> ${item.humanFollowups.join(',')}` : '';
      const hint = item.shallowReason ? ` [${item.status}: ${item.shallowReason}${followup}]` : ` [${item.status}]`;
      const blocks = item.blockingFor?.length ? ` (blocks ${item.blockingFor.join(',')})` : '';
      lines.push(`  - ${item.id} ${item.path}:${item.startLine}-${item.endLine} (${item.lines}L)${hint}${blocks}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const { command, args, opts } = parseArgs(process.argv.slice(2));
  if (opts.version) {
    if (opts.json) console.log(JSON.stringify({ schema: 'pinwhy.ultra-version.v1', version: VERSION }));
    else console.log(VERSION);
    return;
  }
  if (opts.help || command === 'help') {
    process.stdout.write(helpText());
    return;
  }

  const cwd = resolveBoardCwd(opts);
  const agent = defaultAgentId({ PINWHY_AGENT: opts.agent || process.env.PINWHY_AGENT || '' });

  if (command === 'sync') {
    const result = syncUltra(cwd, {
      target: opts.target || cwd,
      scope: opts.scope || '',
      maxSliceLines: opts.maxLines ?? DEFAULT_MAX_SLICE_LINES,
      agent,
    });
    if (opts.json) console.log(JSON.stringify(result));
    else console.log(`Synced ${result.stats.totalActive} slices across ${result.stats.filesScanned} files (added ${result.stats.added}, stale ${result.stats.stale}, unchanged ${result.stats.unchanged}, removed ${result.stats.removed}).`);
    return;
  }

  if (command === 'next') {
    const result = nextUltraBatches(cwd, {
      budgetLines: opts.budgetLines ?? 420,
      maxSlices: opts.maxSlices ?? 4,
      workers: opts.workers ?? 1,
      sector: opts.sector || null,
    });
    if (opts.json) console.log(JSON.stringify(result));
    else console.log(formatNextText(result));
    return;
  }

  if (command === 'done') {
    if (!args.length) throw usageError('invalid_usage', 'done requires at least one slice ID or path');
    const result = markUltraDone(cwd, {
      sliceIds: args,
      note: opts.note ?? '',
      refs: opts.refs,
      dependsOn: opts.dependsOn,
      status: opts.status || null,
      agent,
    });
    if (opts.json) console.log(JSON.stringify(result));
    else {
      for (const item of result.updated) {
        console.log(`${item.id} -> ${item.effectiveStatus}${item.shallowReason ? ` (${item.shallowReason})` : ''} · ${item.path}:${item.startLine}-${item.endLine}`);
      }
    }
    return;
  }

  if (command === 'reopen') {
    if (!args.length) throw usageError('invalid_usage', 'reopen requires at least one slice ID or path');
    const result = reopenUltraSlices(cwd, { sliceIds: args, reason: opts.reason ?? '', agent });
    if (opts.json) console.log(JSON.stringify(result));
    else console.log(`Reopened ${result.reopened.length} slice(s).`);
    return;
  }

  if (command === 'check' || command === 'status') {
    if (!isInitialized(cwd) && opts.cwd && !fs.existsSync(cwd)) {
      throw usageError('invalid_usage', `Project directory does not exist: ${cwd}`);
    }
    const result = buildUltraSnapshot(cwd, {
      target: opts.target || cwd,
      checkDisk: !opts.noDisk,
    });
    if (opts.json) console.log(JSON.stringify(result));
    else console.log(formatCheckText(result));
    return;
  }

  if (command === 'reset') {
    if (!opts.yes) throw usageError('invalid_usage', 'reset requires --yes confirmation');
    const result = resetUltra(cwd, { agent });
    if (opts.json) console.log(JSON.stringify(result));
    else console.log('Reset Ultra slice ledger.');
    return;
  }

  throw usageError('unknown_command', `Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  const wantsJson = process.argv.includes('--json');
  if (wantsJson) {
    process.stderr.write(`${JSON.stringify({
      schema: 'pinwhy.error.v1',
      code: error.code || 'error',
      message: error.message || String(error),
    })}\n`);
  } else {
    process.stderr.write(`pinwhy-ultra: ${error.message || String(error)}\n`);
  }
  process.exitCode = 1;
}
