// One-shot project onboarding. This is deliberately infrastructure-only: it
// prepares storage, Claude integration and the viewer, but never chooses work
// for the Agent or writes semantic nodes on its behalf.

import fs from 'node:fs';
import path from 'node:path';
import { setMeta, withLock } from './store.js';
import { ensure, protectBoard, readConfig } from './storage/board.js';
import {
  installHooks, installLauncher, installSkill, resolveNodeBinary, shellQuote,
} from './hooks.js';
import { resolvePort, viewerUrl, rememberViewerPort, probeViewer } from './service.js';
import { createLaunchdService } from './services/launchd.js';
import { createSystemdService } from './services/systemd.js';
import { createWindowsService } from './services/windows.js';
import { OWNER, replaceManagedService, stopManagedService, unavailable } from './services/common.js';

export { LABEL as WORKSPACE_SERVICE_LABEL } from './services/common.js';
export { renderLaunchAgent } from './services/launchd.js';

const SERVICE_ADAPTERS = {
  darwin: createLaunchdService,
  linux: createSystemdService,
  win32: createWindowsService,
};

function platformService() {
  return SERVICE_ADAPTERS[process.platform]?.() ?? null;
}

/** The single shared service can belong to a different project than the caller. */
export function workspaceServiceStatus({ cwd = process.cwd() } = {}) {
  const adapter = platformService();
  if (adapter) return adapter.status({ cwd });
  return unavailable(
    'unsupported',
    null,
    'Persistent services are not managed on this platform; run pinwhy serve manually and stop its foreground process to shut it down.',
  );
}

/** Stop leaves registration on disk; uninstall removes only our fixed managed registration. */
export function stopWorkspaceService({ cwd = process.cwd(), uninstall = false } = {}) {
  const adapter = platformService();
  return adapter ? stopManagedService(adapter, { cwd, uninstall }) : workspaceServiceStatus({ cwd });
}

async function waitForGraph({ cwd, port }, timeoutMs = 6000) {
  const url = viewerUrl(port);
  const deadline = Date.now() + timeoutMs;
  let last = 'The service did not respond';
  while (Date.now() < deadline) {
    try {
      const viewer = await probeViewer({ cwd, port });
      if (viewer.state === 'online') {
        const response = await fetch(`${url}/api/graph`, { signal: AbortSignal.timeout(800) });
        if (response.ok) {
          const graph = await response.json();
          return { ok: true, nodes: Object.keys(graph.nodes || {}).length };
        }
        last = `HTTP ${response.status}`;
      } else {
        last = viewer.state === 'other-project'
          ? `Port ${port} is serving another project: ${viewer.cwd}`
          : viewer.state;
      }
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`pinwhy service startup verification failed: ${last}`);
}

export async function installWorkspaceService({ cwd, cli, port }) {
  port = resolvePort({ cwd, port });
  const url = viewerUrl(port);
  const adapter = platformService();
  if (!adapter) {
    return {
      mode: 'manual', url, verified: false,
      // Single quotes survive POSIX shells verbatim; JSON double quotes would
      // still let $var, `cmd`, and $(…) expand inside printed paths.
      command: `PINWHY_CWD=${shellQuote(cwd)} ${shellQuote(resolveNodeBinary())} ${shellQuote(cli)} serve --port ${port}`,
    };
  }
  const config = { owner: OWNER, cwd: path.resolve(cwd), cli: path.resolve(cli), node: resolveNodeBinary(), port };
  const previous = adapter.status({ cwd });
  const result = await replaceManagedService({ adapter, previous, config, start: true, health: waitForGraph });
  return { ...result, url };
}

/**
 * Point the existing shared service at `cli` without changing its project or
 * port. A running service restarts so it serves the new code; a stopped one
 * stays stopped.
 */
export async function refreshWorkspaceService({ cli }) {
  const adapter = platformService();
  const status = adapter ? adapter.status() : workspaceServiceStatus();
  if (!adapter || !status.managed || status.state === 'unavailable') return { ...status, refreshed: false };
  if (!fs.existsSync(status.cwd)) {
    return { ...status, refreshed: false, warning: `The service's project directory no longer exists: ${status.cwd}; run pinwhy setup again in the target project.` };
  }
  const port = status.port ?? resolvePort({ cwd: status.cwd });
  const config = { owner: OWNER, cwd: status.cwd, cli: path.resolve(cli), node: resolveNodeBinary(), port };
  const result = await replaceManagedService({ adapter, previous: status, config, start: status.loaded, health: waitForGraph });
  return { ...result, url: viewerUrl(port), refreshed: true, restarted: status.loaded };
}

export async function setupProject({
  cwd,
  cli,
  title = path.basename(cwd),
  port,
  hooks = true,
  skill = true,
  serve = true,
}) {
  const target = path.resolve(cwd);
  if (!fs.statSync(target).isDirectory()) throw new Error(`Project directory does not exist: ${target}`);
  port = resolvePort({ cwd: target, port });
  const board = ensure(target);
  protectBoard(target);
  if (title) setMeta({ title: String(title) }, target);

  // Semantic writes remain manual. Recovery hooks do not record tool activity.
  withLock(() => {
    const config = { ...readConfig(target), autoRecord: false };
    fs.writeFileSync(board.config, JSON.stringify(config, null, 2));
  }, target);

  const launcher = installLauncher({ cli, scope: 'user' });
  const skillResult = skill ? installSkill({ cwd: target, cli, scope: 'project', agent: 'claude' }) : null;
  const hooksResult = hooks
    ? installHooks({ cwd: target, write: true, cli, scope: 'project', withActivity: false })
    : null;
  const service = serve ? await installWorkspaceService({ cwd: target, cli, port }) : null;
  rememberViewerPort(target, port);

  return {
    cwd: target,
    title: String(title || ''),
    board: board.root,
    autoRecord: false,
    launcher,
    skill: skillResult,
    hooks: hooksResult ? { file: hooksResult.file, activityCapture: false } : null,
    service,
  };
}
