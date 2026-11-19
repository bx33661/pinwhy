// Deterministic filesystem scanner and line-range slicer for Pinwhy Ultra.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAX_SLICE_LINES = 320;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_PROBE_BYTES = 4096;

const IGNORED_DIRS = new Set([
  '.git', '.hg', '.svn', '.pinwhy', '.blackboard', '.flow',
  '.agents', '.claude', '.codex', '.dsh', '.zcode',
  '.idea', '.vscode', '.gradle',
  'node_modules', 'bower_components', 'vendor',
  'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.turbo',
  'coverage', '.nyc_output', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.venv', 'venv',
]);

const IGNORED_FILES = new Set([
  '.ds_store', 'thumbs.db',
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'cargo.lock', 'poetry.lock', 'pipfile.lock', 'composer.lock', 'gemfile.lock', 'go.sum',
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.jar', '.war',
  '.pdf', '.wasm', '.pyc', '.pyo', '.class', '.o', '.a', '.so', '.dylib', '.dll', '.exe',
  '.sqlite', '.sqlite3', '.db',
]);

const BOUNDARY_RE = /^(?:export\s+|async\s+function\s+|function\s+|class\s+|(?:abstract\s+)?interface\s+|contract\s+|library\s+|struct\s+|enum\s+|type\s+|def\s+|async\s+def\s+|func\s+|pub\s+(?:async\s+)?(?:fn|struct|enum)\s+|fn\s+|impl\b|(?:public|private|protected)\s+|@(?:app|router)\.|(?:app|router)\.(?:get|post|put|delete|patch|use)\b)/;

function invalidValue(message) {
  return Object.assign(new Error(message), { code: 'invalid_value', status: 400 });
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

function isWithin(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isIgnoredFile(name) {
  const lower = name.toLowerCase();
  if (IGNORED_FILES.has(lower)) return true;
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.map')) return true;
  if (lower.endsWith('.tsbuildinfo')) return true;
  return BINARY_EXTS.has(path.extname(lower));
}

/** Derive a stable module sector name from a normalized relative POSIX path. */
export function sectorOfPath(relPath) {
  const parts = String(relPath || '').split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  const dirs = parts.slice(0, -1);
  if (['packages', 'apps', 'services', 'plugins'].includes(dirs[0]) && dirs.length >= 2) {
    return dirs.slice(0, Math.min(3, dirs.length)).join('/');
  }
  return dirs.slice(0, Math.min(2, dirs.length)).join('/');
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/** Split source text into deterministic slices, preferring top-level boundaries for long files. */
export function sliceContent(relPath, content, maxSliceLines = DEFAULT_MAX_SLICE_LINES) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const totalLines = lines.length;
  if (totalLines === 0 || (totalLines === 1 && lines[0] === '')) return [];

  const sector = sectorOfPath(relPath);
  const makeSlice = (startIdx, endIdx) => {
    const startLine = startIdx + 1;
    const endLine = endIdx;
    const text = lines.slice(startIdx, endIdx).join('\n');
    return {
      key: `${relPath}:${startLine}-${endLine}`,
      path: relPath,
      sector,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      hash: hashText(text),
    };
  };

  if (totalLines <= maxSliceLines) {
    return [makeSlice(0, totalLines)];
  }

  const slices = [];
  const minWindow = Math.max(1, Math.floor(maxSliceLines * 0.65));
  let cursor = 0;
  while (cursor < totalLines) {
    if (totalLines - cursor <= maxSliceLines) {
      slices.push(makeSlice(cursor, totalLines));
      break;
    }
    const hardEnd = cursor + maxSliceLines;
    let cut = hardEnd;
    for (let idx = hardEnd; idx >= cursor + minWindow; idx--) {
      if (idx < totalLines && BOUNDARY_RE.test(lines[idx])) {
        cut = idx;
        break;
      }
    }
    if (cut <= cursor) cut = hardEnd;
    slices.push(makeSlice(cursor, cut));
    cursor = cut;
  }
  return slices;
}

/**
 * Scan a target workspace tree deterministically without touching any board state.
 * Never returns host-local absolute paths in output records.
 */
export function scanTargetTree(targetRoot, { scope = '', maxSliceLines = DEFAULT_MAX_SLICE_LINES } = {}) {
  const maxLines = Number(maxSliceLines);
  if (!Number.isSafeInteger(maxLines) || maxLines < 20 || maxLines > 2000) {
    throw invalidValue('maxSliceLines must be an integer between 20 and 2000');
  }
  if (!targetRoot || !fs.existsSync(targetRoot)) {
    throw invalidValue('Target directory does not exist');
  }
  const root = fs.realpathSync(path.resolve(targetRoot));
  const rawScope = String(scope || '').trim();
  let startPath = root;
  let scopeRel = null;
  if (rawScope) {
    const candidate = path.resolve(root, rawScope);
    if (!fs.existsSync(candidate)) throw invalidValue(`Scope does not exist: ${rawScope}`);
    const resolved = fs.realpathSync(candidate);
    if (!isWithin(root, resolved)) throw invalidValue(`Scope escapes target root: ${rawScope}`);
    startPath = resolved;
    scopeRel = toPosix(path.relative(root, resolved)) || null;
  }

  let filesScanned = 0;
  let skippedBinary = 0;
  let skippedLarge = 0;
  const files = [];
  const slices = [];

  function inspectFile(absFile) {
    const base = path.basename(absFile);
    if (isIgnoredFile(base)) return;
    let stat;
    try { stat = fs.lstatSync(absFile); } catch { return; }
    if (stat.isSymbolicLink() || !stat.isFile()) return;
    if (stat.size === 0) return;
    if (stat.size > MAX_FILE_BYTES) {
      skippedLarge += 1;
      return;
    }
    let buf;
    try { buf = fs.readFileSync(absFile); } catch { return; }
    if (!buf.length) return;
    const probeLen = Math.min(buf.length, BINARY_PROBE_BYTES);
    for (let i = 0; i < probeLen; i++) {
      if (buf[i] === 0) {
        skippedBinary += 1;
        return;
      }
    }
    const relPath = toPosix(path.relative(root, absFile));
    const fileSlices = sliceContent(relPath, buf.toString('utf8'), maxLines);
    if (!fileSlices.length) return;
    filesScanned += 1;
    files.push(relPath);
    for (const slice of fileSlices) slices.push(slice);
  }

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const lowerDir = entry.name.toLowerCase();
        if (IGNORED_DIRS.has(lowerDir)) continue;
        if (lowerDir === 'target' && (fs.existsSync(path.join(dir, 'Cargo.toml')) || fs.existsSync(path.join(dir, 'pom.xml')))) continue;
        walk(abs);
      } else if (entry.isFile()) {
        inspectFile(abs);
      }
    }
  }

  const startStat = fs.lstatSync(startPath);
  if (startStat.isFile()) inspectFile(startPath);
  else if (startStat.isDirectory()) walk(startPath);

  return {
    scope: scopeRel,
    maxSliceLines: maxLines,
    filesScanned,
    skippedBinary,
    skippedLarge,
    files,
    slices,
  };
}
