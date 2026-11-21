import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tooltip } from 'radix-ui';
import { createServer } from 'vite';

// Render the real components without a browser, a listening server, or a project board.
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  configFile: false,
  root: path.join(root, 'web'),
  resolve: { alias: { '@': path.join(root, 'web/src') } },
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
});
after(() => server.close());
const { Inspector } = await server.ssrLoadModule('/src/panels/Inspector.tsx');
const { Sidebar } = await server.ssrLoadModule('/src/panels/Sidebar.tsx');
const { Topbar } = await server.ssrLoadModule('/src/panels/Topbar.tsx');
const { AuditCatalog } = await server.ssrLoadModule('/src/workspace/shells/audit/AuditCatalog.tsx');
const { AuditDossier } = await server.ssrLoadModule('/src/workspace/shells/audit/AuditDossier.tsx');
const { buildAuditIndex, selectAudit } = await server.ssrLoadModule('/src/workspace/audit.ts');
const render = (element) => renderToStaticMarkup(createElement(Tooltip.Provider, null, element));
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const node = {
  id: 'synthetic-finding', type: 'finding', confidence: 'suspected',
  title: '  已观察行为。\n限制：尚未验证！  ',
  detail: `第一行保留换行\n\n${'合成证据 '.repeat(700)}\n末尾限制：实际行为尚未验证。  `,
};
const inspectorProps = {
  node, edges: [], byId: new Map([[node.id, node]]),
  onClose() {}, onFocus() {}, async onReload() {},
  isStatic: true, connected: false, revision: 0,
};

test('Inspector renders the complete authored title and detail, including punctuation and tail conditions', () => {
  const before = JSON.stringify(node);
  const html = render(createElement(Inspector, inspectorProps));
  assert.equal(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1], escape(node.title));
  assert.ok(html.includes(`>${escape(node.detail)}</p>`), 'the entire detail must appear as one authored text, not a trimmed preview');
  assert.equal(JSON.stringify(node), before, 'reading must not alter the source record');
});


const findings = Array.from({ length: 18 }, (_, i) => ({ id: `synthetic-${i}`, type: 'finding', title: `Synthetic finding ${i}` }));
const openItems = Array.from({ length: 13 }, (_, i) => ({ id: `question-${i}`, type: 'question', title: `Synthetic question ${i}` }));
const sidebarProps = {
  current: null, openItems, findings, inbox: [], selectedId: null,
  counts: { nodes: findings.length + openItems.length, edges: 0, risk: 0, open: openItems.length, candidates: findings.length },
  onSelect() {}, onSearch() {}, onShortcuts() {}, onFilter() {},
  filter: { types: [], statuses: [], confidences: [], riskOnly: false },
  filterOptions: { types: [], statuses: [], confidences: [], riskCount: 0 }, results: null,
};

test('Sidebar keeps all findings reachable behind an explicit disclosure instead of silently cutting after eight', () => {
  const before = JSON.stringify(findings);
  const html = render(createElement(Sidebar, sidebarProps));
  assert.equal((html.match(/title="Synthetic finding \d+"/g) || []).length, findings.length);
  assert.ok(/<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?10[\s\S]*?<\/summary>/.test(html), 'ten more findings have a native disclosure');
  assert.ok(html.includes('title="Synthetic finding 17"'));
  assert.equal(JSON.stringify(findings), before);
});

test('Sidebar open items retain every record and use the same explicit disclosure', () => {
  const html = render(createElement(Sidebar, sidebarProps));
  assert.equal((html.match(/title="Synthetic question \d+"/g) || []).length, openItems.length);
  assert.ok(/<summary[^>]*>[\s\S]*?5[\s\S]*?<\/summary>/.test(html), 'five more questions have a native disclosure');
});


test('Inspector exposes persisted input truncation instead of presenting a partial input as complete', () => {
  const truncated = { ...node, inputTruncation: { detail: { originalLength: 20006, storedLength: 20000 } } };
  const html = render(createElement(Inspector, { ...inspectorProps, node: truncated }));
  assert.ok(html.includes('20006') && html.includes('20000'), 'the saved and original lengths are visible');
});

test('Inspector retains authored relation labels and reports their recorded input loss', () => {
  const peer = { id: 'synthetic-peer', type: 'fact', title: 'Synthetic peer' };
  const label = '第一行关系说明\n限制：仅支持这一项观察。';
  const edge = { id: 'synthetic-edge', from: peer.id, to: node.id, kind: 'supports', label, inputTruncation: { label: { originalLength: 506, storedLength: 500 } } };
  const html = render(createElement(Inspector, { ...inspectorProps, edges: [edge], byId: new Map([[node.id, node], [peer.id, peer]]) }));
  assert.ok(html.includes(`>${escape(label)}</p>`), 'the authored relation label is available alongside the explicit direction');
  assert.ok(html.includes('506') && html.includes('500'));
});

test('Inspector highlights inline backtick code spans in detail without dropping surrounding text or unmatched backticks', () => {
  const codeNode = {
    ...node,
    id: 'code-node-1',
    detail: 'Request `GET /api/v2/admin/users` succeeded and left an unmatched `tail.',
  };
  const html = render(createElement(Inspector, { ...inspectorProps, node: codeNode, byId: new Map([[codeNode.id, codeNode]]) }));
  assert.ok(html.includes('>code-node-1<'));
  assert.ok(html.includes('>GET /api/v2/admin/users</code>'));
  assert.ok(html.includes('succeeded and left an unmatched `tail.'));
});

test('AuditDossier landing and AuditCatalog expose unassigned candidates with explicit expansion controls', () => {
  const snapshot = {
    meta: {},
    nodes: [
      { id: 'g1', type: 'goal', title: 'Synthetic audit goal' },
      { id: 'fd1', type: 'finding', title: 'Unassigned finding 1' },
      { id: 'fd2', type: 'finding', title: 'Unassigned finding 2' },
      { id: 'fd3', type: 'finding', title: 'Unassigned finding 3' },
    ],
    edges: [],
  };
  const index = buildAuditIndex(snapshot);
  const landing = selectAudit(index, null, null);
  const landingHtml = render(createElement(AuditDossier, {
    audit: landing,
    selected: null,
    graphOpen: false,
    onToggleGraph() {},
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onOpenArgument() {},
    onExpand() {},
  }));
  assert.ok(landingHtml.includes('未归属候选 · 3'));
  assert.ok(landingHtml.includes('未归属候选 · 显示更多'));

  const emptyIssue = selectAudit(index, 'g1', null);
  const catalogHtml = render(createElement(AuditCatalog, {
    audit: emptyIssue,
    selectedId: null,
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onCandidateIssue() {},
    onOpenArgument() {},
    onSearch() {},
    onExpand() {},
  }));
  assert.ok(catalogHtml.includes('当前议题下暂无明确归属的候选'));
  assert.ok(catalogHtml.includes('另有 3 条未归属候选'));
  assert.ok(catalogHtml.includes('未归属候选 · 显示更多'));
});

test('AuditDossier tethers 2nd-hop premises, inline local challenges and shared references without duplicate selects', () => {
  const snapshot = {
    meta: {},
    nodes: [
      { id: 'q1', type: 'question', title: 'Synthetic audit question' },
      { id: 'fd1', type: 'finding', title: 'Synthetic root finding', severity: 'critical', confidence: 'suspected', status: 'open' },
      { id: 'fd2', type: 'vuln', title: 'Synthetic peer finding', confidence: 'reproduced', status: 'confirmed' },
      { id: 'f1', type: 'fact', title: 'Synthetic direct evidence', status: 'confirmed' },
      { id: 'p1', type: 'observation', title: 'Synthetic supporting premise', status: 'confirmed' },
      { id: 'r1', type: 'result', title: 'Synthetic local challenge', status: 'confirmed' },
      { id: 'n1', type: 'condition', title: 'Synthetic shared condition', status: 'open' },
    ],
    edges: [
      { id: 'm1', from: 'fd1', to: 'q1', kind: 'answers' },
      { id: 'm2', from: 'fd2', to: 'q1', kind: 'answers' },
      { id: 's1', from: 'f1', to: 'fd1', kind: 'supports', label: 'Direct scope' },
      { id: 'p-edge', from: 'p1', to: 'f1', kind: 'supports' },
      { id: 'c-edge', from: 'r1', to: 'f1', kind: 'contradicts', label: 'Local rebuttal only' },
      { id: 'd1', from: 'fd1', to: 'n1', kind: 'depends-on' },
      { id: 'd2', from: 'fd2', to: 'n1', kind: 'depends-on' },
    ],
  };
  const index = buildAuditIndex(snapshot);
  const view = selectAudit(index, 'q1', 'fd1');
  const dossierHtml = render(createElement(AuditDossier, {
    audit: view,
    selected: null,
    graphOpen: false,
    onToggleGraph() {},
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onOpenArgument() {},
    onExpand() {},
  }));
  assert.ok(dossierHtml.includes('前提支持'));
  assert.ok(dossierHtml.includes('Synthetic supporting premise'));
  assert.ok(dossierHtml.includes('存在反驳记录'));
  assert.ok(dossierHtml.includes('共享于'));
  assert.ok(dossierHtml.includes('>fd2<'));

  const catalogHtml = render(createElement(AuditCatalog, {
    audit: view,
    selectedId: 'fd1',
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onCandidateIssue() {},
    onOpenArgument() {},
    onSearch() {},
    onExpand() {},
  }));
  assert.equal(catalogHtml.includes('<select'), false);
  assert.ok(catalogHtml.includes('Synthetic audit question'));
  assert.ok(catalogHtml.includes('+1'));
});

test('Topbar hides zero-count activity noise by default while surfacing Preferences and restoring activity when non-empty or opted in', () => {
  const baseProps = {
    title: 'Synthetic task',
    workspace: 'general',
    onWorkspace() {},
    mode: 'context',
    onMode() {},
    agentId: 'agent:primary',
    agentIds: ['agent:primary'],
    onAgent() {},
    theme: 'light',
    onTheme() {},
    connection: 'live',
    isStatic: false,
    sidebarOpen: true,
    onToggleSidebar() {},
    onSearch() {},
    onDigest() {},
    digestRef: { current: null },
    activities: [],
    activityTotal: 0,
    timelineOpen: false,
    onSettings() {},
  };

  const quietHtml = render(createElement(Topbar, baseProps));
  assert.equal(quietHtml.includes('Agent 活动'), false, 'zero-count activity button stays hidden by default');
  assert.ok(quietHtml.includes('偏好设置'), 'Preferences button is exposed in standalone topbar');

  const optedInHtml = render(createElement(Topbar, { ...baseProps, showEmptyActivity: true }));
  assert.ok(optedInHtml.includes('Agent 活动'), 'user preference can keep empty activity entry visible');

  const activeHtml = render(createElement(Topbar, { ...baseProps, activityTotal: 3 }));
  assert.ok(activeHtml.includes('Agent 活动'), 'recorded activities surface automatically');
});

test('AuditDossier respects provenanceMode="off" and renders checkpoint delta badges without mutating records', () => {
  const snapshot = {
    meta: {},
    nodes: [
      { id: 'q1', type: 'question', title: 'Audit question', author: 'agent:lead' },
      { id: 'fd1', type: 'finding', title: 'Disputed finding', confidence: 'static-confirmed', status: 'open', author: 'agent:finder' },
      { id: 'f1', type: 'fact', title: 'Corroborating check', confidence: 'reproduced', status: 'confirmed', author: 'agent:verifier' },
      { id: 'c1', type: 'observation', title: 'Counter check', confidence: 'static-confirmed', status: 'confirmed', author: 'agent:skeptic' },
    ],
    edges: [
      { id: 'e1', from: 'fd1', to: 'q1', kind: 'answers', author: 'agent:finder' },
      { id: 'e2', from: 'f1', to: 'fd1', kind: 'supports', author: 'agent:verifier' },
      { id: 'e3', from: 'c1', to: 'fd1', kind: 'contradicts', author: 'agent:skeptic' },
    ],
  };
  const index = buildAuditIndex(snapshot);
  const view = selectAudit(index, 'q1', 'fd1');
  const changes = new Map([
    ['fd1', { kind: 'updated', fields: ['confidence'] }],
    ['f1', { kind: 'added', fields: [] }],
  ]);

  const autoHtml = render(createElement(AuditDossier, {
    audit: view,
    selected: null,
    graphOpen: false,
    provenanceMode: 'auto',
    changes,
    onToggleGraph() {},
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onOpenArgument() {},
    onExpand() {},
  }));
  assert.ok(autoHtml.includes('参与方溯源'));
  assert.ok(autoHtml.includes('异源印证'));
  assert.ok(autoHtml.includes('这一段修改：confidence'));
  assert.ok(autoHtml.includes('这一段新增'));

  const offHtml = render(createElement(AuditDossier, {
    audit: view,
    selected: null,
    graphOpen: false,
    provenanceMode: 'off',
    changes,
    onToggleGraph() {},
    onSelect() {},
    onIssue() {},
    onCandidate() {},
    onOpenArgument() {},
    onExpand() {},
  }));
  assert.equal(offHtml.includes('参与方溯源'), false, 'provenanceMode="off" hides spotlight bar');
  assert.equal(offHtml.includes('异源印证'), false, 'provenanceMode="off" hides cross-actor chips');
  assert.ok(offHtml.includes('这一段新增'), 'checkpoint delta badges remain visible');
});



