// SSE stream for Pinwhy Ultra: pushes updated Ultra snapshots when either
// .pinwhy/events.jsonl or .pinwhy/ultra/ledger.jsonl changes.
import fs from 'node:fs';
import { paths } from '../storage/layout.js';
import { ultraPaths } from '../ultra/ledger.js';
import { buildUltraSnapshot } from '../ultra/engine.js';

const PING = ': ping\n\n';

function stamp(file) {
  try {
    const st = fs.statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return 'none';
  }
}

export function createUltraStream(cwd) {
  const eventsFile = paths(cwd).events;
  const ledgerFile = ultraPaths(cwd).ledger;
  const clients = new Map();
  let poll = null;
  let heartbeat = null;
  let lastSig = null;

  const signature = () => `${stamp(eventsFile)}|${stamp(ledgerFile)}`;
  const frame = () => `event: ultra\ndata: ${JSON.stringify(buildUltraSnapshot(cwd))}\n\n`;

  function stopTimers() {
    clearInterval(poll);
    clearInterval(heartbeat);
    poll = heartbeat = null;
  }

  function remove(client) {
    clients.delete(client.res);
    client.res.off('close', client.close);
    client.res.off('drain', client.drain);
    client.pending = null;
    if (!clients.size) stopTimers();
  }

  function send(client, data) {
    if (client.res.destroyed || client.res.writableEnded) {
      remove(client);
      return;
    }
    if (client.blocked) {
      if (data !== PING) client.pending = data;
      return;
    }
    try {
      client.blocked = !client.res.write(data);
    } catch {
      remove(client);
      client.res.destroy();
    }
  }

  function tick() {
    if (!clients.size) return;
    try {
      const sig = signature();
      if (sig === lastSig) return;
      const data = frame();
      lastSig = sig;
      for (const client of clients.values()) send(client, data);
    } catch { /* Wait for next readable tick. */ }
  }

  function subscribe(_req, res) {
    const first = clients.size === 0;
    const sig = first ? signature() : null;
    const data = frame();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const client = { res, blocked: false, pending: null, close: null, drain: null };
    client.close = () => remove(client);
    client.drain = () => {
      client.blocked = false;
      const pending = client.pending;
      client.pending = null;
      if (pending !== null) send(client, pending);
    };
    clients.set(res, client);
    res.once('close', client.close);
    res.on('drain', client.drain);
    send(client, data);
    if (first && clients.size) {
      lastSig = sig;
      poll = setInterval(tick, 250);
      heartbeat = setInterval(() => {
        for (const entry of clients.values()) send(entry, PING);
      }, 15000);
    }
  }

  function close() {
    for (const client of clients.values()) {
      remove(client);
      client.res.end();
    }
    stopTimers();
  }

  return { subscribe, close };
}
