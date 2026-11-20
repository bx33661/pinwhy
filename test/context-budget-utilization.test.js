import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGraph } from '../lib/model.js';
import { buildAgentContext, estimateTokensText } from '../lib/context.js';

const POLICY = { readOnly: true, prescriptive: false, nextStepSelection: 'agent-controlled' };
const graphWith = (...nodes) => {
  const graph = emptyGraph();
  graph.nodes = Object.fromEntries(nodes.map(node => [node.id, node]));
  return graph;
};

function assertBudget(packet, budget) {
  assert.ok(packet.estimatedTokens <= budget, `${packet.estimatedTokens}/${budget}`);
  assert.equal(packet.estimatedTokens, Math.ceil(estimateTokensText(JSON.stringify(packet))));
  assert.equal(packet.truncated, Object.keys(packet.omitted).length > 0);
  assert.equal(packet.schema, 'pinwhy.context.v2');
  assert.deepEqual(packet.policy, POLICY);
}

test('an oversized first finding does not hide later complete findings that fit', () => {
  const large = { id: 'fd3', type: 'finding', title: 'Large authored finding', detail: 'x'.repeat(8000), ts: 3 };
  const middle = { id: 'fd2', type: 'finding', title: 'Later candidate', detail: 'Not yet reproduced.', confidence: 'suspected', ts: 2 };
  const oldest = { id: 'fd1', type: 'finding', title: 'Earlier candidate', detail: 'Only one input was checked.', confidence: 'static-confirmed', ts: 1 };
  const graph = graphWith(oldest, middle, large);
  const before = JSON.stringify(graph);
  const packet = buildAgentContext(graph, { budgetTokens: 1000 });
  assert.deepEqual(packet.findings.map(node => node.id), ['fd2', 'fd1']);
  assert.equal(packet.omitted.findings, 1);
  assert.equal(packet.findings[0].detail, middle.detail);
  assert.equal(packet.findings[1].detail, oldest.detail);
  assert.equal(JSON.stringify(packet).includes(large.detail), false);
  assertBudget(packet, 1000);
  assert.equal(JSON.stringify(graph), before);
});

test('Chinese records keep all conditions and attribution after an oversized candidate is skipped', () => {
  const detail = '观察范围仅限测试输入。\n\n限制：真实部署尚未验证。\n';
  const short = { id: 'f1', type: 'fact', title: '已保存的局部观察', detail, confidence: 'static-confirmed',
    status: 'blocked', severity: 'low', author: 'agent:observer', updatedBy: 'agent:reviewer', ts: 1 };
  const graph = graphWith(short, { id: 'f2', type: 'fact', title: '较长的原始观察', detail: '原文'.repeat(3000), confidence: 'confirmed', ts: 2 });
  const before = structuredClone(graph);
  const packet = buildAgentContext(graph, { budgetTokens: 1000 });
  assert.deepEqual(packet.confirmedFacts.map(node => node.id), ['f1']);
  for (const field of ['title', 'detail', 'confidence', 'status', 'severity', 'author', 'updatedBy']) {
    assert.equal(packet.confirmedFacts[0][field], short[field], field);
  }
  assert.equal(packet.omitted.confirmedFacts, 1);
  assertBudget(packet, 1000);
  assert.deepEqual(graph, before);
});

test('the same whole-record scan applies to checkpoints and activities', () => {
  const graph = emptyGraph();
  for (const key of ['checkpoints', 'activities']) {
    graph[key].long = { id: `${key}-long`, agentId: 'agent:primary', at: 2, summary: 'x'.repeat(8000) };
    graph[key].short = { id: `${key}-short`, agentId: 'agent:primary', at: 1, summary: 'Only a partial observation; validation remains open.' };
  }
  const packet = buildAgentContext(graph, { budgetTokens: 1000 });
  assert.deepEqual(packet.checkpoints.map(item => item.id), ['checkpoints-short']);
  assert.deepEqual(packet.recentActivity.map(item => item.id), ['activities-short']);
  assert.equal(packet.omitted.checkpoints, 1);
  assert.equal(packet.omitted.recentActivity, 1);
  assertBudget(packet, 1000);
});

test('all oversized candidates remain whole omissions without leaking partial claims', () => {
  const graph = graphWith(...Array.from({ length: 5 }, (_, i) => ({
    id: `fd${i}`, type: 'finding', title: `Conditional finding ${i}`, detail: 'unverified scope '.repeat(1000), ts: i,
  })));
  const packet = buildAgentContext(graph, { budgetTokens: 1000 });
  assert.deepEqual(packet.findings, []);
  assert.equal(packet.omitted.findings, 5);
  assert.equal(JSON.stringify(packet).includes('Conditional finding'), false);
  assertBudget(packet, 1000);
});

test('maxItems still bounds candidates examined rather than backfilling from outside that window', () => {
  const graph = graphWith(
    { id: 'fd1', type: 'finding', title: 'Short candidate', ts: 1 },
    { id: 'fd2', type: 'finding', title: 'Large candidate', detail: 'x'.repeat(8000), ts: 2 },
  );
  const limited = buildAgentContext(graph, { budgetTokens: 1000, maxItems: 1 });
  assert.deepEqual(limited.findings, []);
  assert.equal(limited.omitted.findings, 2);
  const expanded = buildAgentContext(graph, { budgetTokens: 1000, maxItems: 2 });
  assert.deepEqual(expanded.findings.map(node => node.id), ['fd1']);
  assert.equal(expanded.omitted.findings, 1);
  assertBudget(limited, 1000);
  assertBudget(expanded, 1000);
});

test('mixed-size scans remain deterministic, read-only and exactly accounted across budgets', () => {
  const graph = graphWith(...Array.from({ length: 18 }, (_, i) => ({
    id: `fd${i}`, type: 'finding', title: `Authored record ${i}`, detail: i % 3 === 0 ? '限制'.repeat(1500) : `Full scope ${i}.\nNot reproduced.`,
    confidence: i % 2 ? 'suspected' : 'static-confirmed', author: `agent:writer-${i % 2}`, ts: i,
  })));
  const before = structuredClone(graph);
  for (const budgetTokens of [400, 512, 700, 1000, 1600, 4000]) {
    const options = { budgetTokens, maxItems: 18 };
    const packet = buildAgentContext(graph, options);
    assertBudget(packet, budgetTokens);
    assert.deepEqual(packet, buildAgentContext(graph, options));
    assert.equal(packet.findings.length + (packet.omitted.findings || 0), 18);
    for (const node of packet.findings) {
      for (const field of ['title', 'detail', 'confidence', 'author']) assert.equal(node[field], graph.nodes[node.id][field], field);
    }
    assert.deepEqual(graph, before);
  }
});

test('high-fanout hub cursor with dense Chinese details preserves open threads, findings, facts, retired nodes and relations', () => {
  const graph = emptyGraph();
  const body = '合成审计记录：已核对网关校验分支、响应头策略及会话边界。'.repeat(12);
  graph.nodes.g1 = { id: 'g1', type: 'goal', title: '合成审计目标', status: 'active', ts: 1 };
  graph.nodes.hub = { id: 'hub', type: 'fact', title: '汇总节点', status: 'done', detail: '汇总全部结果', ts: 100 };
  graph.cursors['agent:primary'] = { id: 'c1', agentId: 'agent:primary', to: 'hub', at: 100 };
  graph.nodes.q1 = { id: 'q1', type: 'question', title: '仍待确认的跨会话边界问题', status: 'open', detail: '等待补充测试凭证', ts: 90 };
  graph.nodes.r1 = { id: 'r1', type: 'hypothesis', title: '已反驳假设一', status: 'refuted', ts: 80 };
  graph.nodes.r2 = { id: 'r2', type: 'finding', title: '已取代候选二', status: 'superseded', ts: 81 };
  for (let i = 1; i <= 6; i++) {
    graph.checkpoints[`cp${i}`] = { id: `cp${i}`, agentId: 'agent:primary', at: 50 + i, summary: `阶段检查点 ${i}：已完成部分验证。` };
  }
  for (let i = 1; i <= 15; i++) {
    const id = `fd${i}`;
    const factId = `f${i}`;
    graph.nodes[id] = { id, type: 'finding', title: `发现记录 ${i}`, detail: body, status: 'confirmed', severity: 'medium', confidence: 'reproduced', ts: 20 + i };
    graph.nodes[factId] = { id: factId, type: 'fact', title: `事实证据 ${i}`, detail: body, status: 'confirmed', confidence: 'reproduced', ts: 40 + i };
    graph.edges[`${id}->hub`] = { id: `${id}->hub`, from: 'hub', to: id, kind: 'documents', ts: 100 };
    graph.edges[`${factId}->${id}`] = { id: `${factId}->${id}`, from: factId, to: id, kind: 'supports', ts: 100 };
  }
  const before = structuredClone(graph);
  const packet = buildAgentContext(graph, { budgetTokens: 4000 });
  assertBudget(packet, 4000);
  assert.ok(packet.objectives.length > 0);
  assert.ok(packet.openThreads.some((node) => node.id === 'q1'));
  assert.ok(packet.findings.length > 0);
  assert.ok(packet.confirmedFacts.length > 0);
  assert.ok(packet.retiredNodes.length > 0);
  assert.ok(packet.relations.length > 0);
  assert.deepEqual(packet, buildAgentContext(graph, { budgetTokens: 4000 }));
  assert.deepEqual(graph, before);
});

test('generous budgets backfill duplicate collection views across focus, objectives, findings and neighborhood', () => {
  const graph = emptyGraph();
  graph.nodes.g1 = { id: 'g1', type: 'goal', title: 'Primary goal', status: 'active', ts: 1 };
  graph.nodes.v1 = { id: 'v1', type: 'vuln', title: 'Primary vuln', severity: 'high', confidence: 'static-confirmed', ts: 2 };
  graph.edges.e1 = { id: 'e1', from: 'v1', to: 'g1', kind: 'related-to', ts: 3 };
  const packet = buildAgentContext(graph, { focus: 'v1', budgetTokens: 64000 });
  assertBudget(packet, 64000);
  assert.equal(packet.truncated, false);
  assert.deepEqual(packet.omitted, {});
  assert.equal(packet.currentFocus?.id, 'v1');
  assert.deepEqual(packet.objectives.map((node) => node.id), ['g1']);
  assert.deepEqual(packet.findings.map((node) => node.id), ['v1']);
  assert.deepEqual(packet.neighborhood.map((entry) => entry.node.id), ['g1']);
});
