import os from 'node:os';
import path from 'node:path';
import { resolveNodeBinary } from '../hooks.js';
import { resolvePort } from '../service.js';
import { LABEL, readOptional, runNative, serviceState } from './common.js';

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
}

function plistString(raw, key) {
  const value = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(raw)?.[1];
  return value === undefined ? null : unescapeXml(value);
}

function plistProgram(raw) {
  const args = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(raw)?.[1] || '';
  return [...args.matchAll(/<string>([^<]*)<\/string>/g)].map((match) => unescapeXml(match[1]));
}

function plistPort(programArgs) {
  const index = programArgs.indexOf('--port');
  const value = index >= 0 ? programArgs[index + 1] : undefined;
  return value !== undefined && /^\d+$/.test(value) ? resolvePort({ port: value }) : null;
}

export function renderLaunchAgent({ cwd, cli, node = resolveNodeBinary(), port }) {
  port = resolvePort({ cwd, port });
  const log = path.join(os.tmpdir(), 'pinwhy-workspace.log');
  const err = path.join(os.tmpdir(), 'pinwhy-workspace.err.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(cli)}</string>
    <string>serve</string>
    <string>--port</string>
    <string>${Number(port)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PINWHY_CWD</key><string>${xml(cwd)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(err)}</string>
</dict>
</plist>
`;
}

async function bootstrapService(ctl, domain, file) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    try {
      ctl(['bootstrap', domain, file]);
      return;
    } catch (error) { failure = error; }
  }
  throw failure;
}

/** Create the macOS launchd service adapter. */
export function createLaunchdService({ run = runNative, home = os.homedir(), uid = process.getuid?.() } = {}) {
  const file = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const domain = `gui/${uid}`;
  const target = `${domain}/${LABEL}`;
  const ctl = (args) => run('launchctl', args);

  const unload = () => {
    try { ctl(['bootout', target]); }
    catch (error) { if (error.status !== 113 && error.status !== 3) throw error; }
  };

  return {
    mode: 'launchd',
    file,
    defaultMode: 0o644,
    stagedName: 'replacement.plist',
    recoveryName: 'original.plist',
    render: renderLaunchAgent,
    status({ cwd = process.cwd() } = {}) {
      const buf = readOptional(file);
      const raw = buf ? buf.toString('utf8') : '';
      const owner = raw ? plistString(raw, 'WorkingDirectory') : null;
      const managed = !!buf && plistString(raw, 'Label') === LABEL
        && /<string>[^<]*\/bin\/pinwhy\.js<\/string>/.test(raw)
        && raw.includes('<string>serve</string>') && !!owner;
      let loaded = false;
      let running = false;
      try {
        const output = ctl(['print', target]);
        loaded = true;
        running = /^\s*state\s*=\s*running\s*$/m.test(output);
      } catch (error) {
        if (error.status !== 113 && error.status !== 3) throw error;
      }
      const program = managed ? plistProgram(raw) : [];
      const [node, cli] = program;
      return serviceState({
        mode: 'launchd',
        file,
        cwd,
        configured: !!buf,
        managed,
        loaded,
        running,
        config: managed ? { cwd: owner, port: plistPort(program), node, cli } : null,
      });
    },
    deactivate(previous = {}) {
      if (previous.loaded) unload();
    },
    async activate(_config, start) {
      if (start) await bootstrapService(ctl, domain, file);
    },
    async restore(previous) {
      if (previous.loaded) await bootstrapService(ctl, domain, file);
    },
    remove() {},
  };
}
