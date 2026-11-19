import { addNode, patchNode, addEdge, removeNode, removeEdge, parseLocation } from '../store.js';
import { projectNode } from '../model.js';
import { validateRequestId } from '../receipts.js';
import { OUTPUTS } from '../contracts.js';
import { json, readBody } from './request.js';

const STRING_PATCHABLE = ['title', 'detail', 'status', 'severity', 'confidence'];
const PATCHABLE = [...STRING_PATCHABLE, 'tags', 'at'];
const NODE_OPTIONAL_STRINGS = ['detail', 'parent', 'relation', 'status', 'severity', 'confidence', 'at', 'label'];

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function extractRequestId(req, body) {
  const headerId = req.headers['idempotency-key'];
  const headerHasId = headerId !== undefined;
  const bodyHasId = Object.hasOwn(body, 'requestId');
  if (!headerHasId && !bodyHasId) return undefined;
  // Explicit IDs are validated, not trimmed, generated, or silently ignored.
  if ((headerHasId && !validateRequestId(headerId)) || (bodyHasId && !validateRequestId(body.requestId))) {
    throw badRequest('requestId must be a non-empty string');
  }
  if (headerHasId && bodyHasId && headerId !== body.requestId) throw badRequest('request_id_mismatch');
  return headerHasId ? headerId : body.requestId;
}

function parseStringArray(value, field, { allowNull = false } = {}) {
  if (allowNull && value === null) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw badRequest(`${field} must be an array of strings${allowNull ? ' or null' : ''}`);
  }
  return value;
}

function parseOptionalLocation(value, field, { allowNull = false } = {}) {
  if (allowNull && value === null) return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a string${allowNull ? ' or null' : ''}`);
  const loc = parseLocation(value);
  if (value && !loc) throw badRequest(`${field} must be a file location`);
  return loc;
}

function createNode(body, { cwd, author, requestId, inputProtection }) {
  const type = Object.hasOwn(body, 'type') ? body.type : 'note';
  if (typeof type !== 'string' || !type.trim()) throw badRequest('type must be a non-empty string');
  if (typeof body.title !== 'string' || !body.title.trim()) throw badRequest('title is required');
  if (Object.hasOwn(body, 'parent') && Object.hasOwn(body, 'target')) throw badRequest('parent and target cannot be combined');
  if (Object.hasOwn(body, 'target') && (typeof body.target !== 'string' || !body.target.trim())) {
    throw badRequest('target must be a non-empty string');
  }
  for (const key of NODE_OPTIONAL_STRINGS) {
    if (Object.hasOwn(body, key) && typeof body[key] !== 'string') throw badRequest(`${key} must be a string`);
  }
  if (Object.hasOwn(body, 'tags')) parseStringArray(body.tags, 'tags');
  if (Object.hasOwn(body, 'at')) parseOptionalLocation(body.at, 'at');
  // Relation names and node types are conventions, not closed lists.
  const optional = Object.fromEntries(
    ['severity', 'confidence', 'tags', 'at', 'label'].filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]),
  );
  const result = addNode({
    type, title: body.title.trim(), detail: body.detail || '', parent: body.parent || null,
    ...(Object.hasOwn(body, 'target') ? { target: body.target } : {}),
    relation: body.relation || null, status: body.status || null,
    ...optional,
    author, requestId, ...inputProtection,
  }, cwd);
  return { status: 201, body: { schema: OUTPUTS.node.schema, ...result, node: projectNode(result.node) } };
}

function parsePatchSet(body) {
  const set = {};
  for (const key of STRING_PATCHABLE) {
    if (!Object.hasOwn(body, key)) continue;
    if (body[key] !== null && typeof body[key] !== 'string') throw badRequest(`${key} must be a string or null`);
    set[key] = body[key] ?? '';
  }
  if (Object.hasOwn(body, 'tags')) set.tags = parseStringArray(body.tags, 'tags', { allowNull: true }) ?? [];
  if (Object.hasOwn(body, 'at')) set.loc = parseOptionalLocation(body.at, 'at', { allowNull: true });
  if (!Object.keys(set).length) throw badRequest(`nothing to change; allowed: ${PATCHABLE.join(', ')}`);
  // Empty enum values clear the field, matching the store's null clear contract.
  for (const key of ['status', 'severity', 'confidence']) if (set[key] === '') set[key] = null;
  return set;
}

function parseExpectedFields(rawExpected, set) {
  if (!rawExpected || typeof rawExpected !== 'object' || Array.isArray(rawExpected)) {
    throw badRequest('expected must be an object of original values for patched fields');
  }
  const expected = {};
  for (const [key, value] of Object.entries(rawExpected)) {
    if (key === 'tags' && Object.hasOwn(set, 'tags')) {
      expected.tags = parseStringArray(value, 'expected.tags', { allowNull: true });
    } else if (key === 'at' && Object.hasOwn(set, 'loc')) {
      expected.loc = parseOptionalLocation(value, 'expected.at', { allowNull: true });
    } else if (STRING_PATCHABLE.includes(key) && Object.hasOwn(set, key) && typeof value === 'string') {
      expected[key] = value;
    } else {
      throw badRequest('expected must contain original values for patched fields');
    }
  }
  return expected;
}

function patchNodeRoute(ref, body, { cwd, author, requestId, inputProtection }) {
  const set = parsePatchSet(body);
  const expected = Object.hasOwn(body, 'expected') ? parseExpectedFields(body.expected, set) : undefined;
  const result = patchNode(ref, set, cwd, { by: author, expected, requestId, ...inputProtection });
  return { status: 200, body: { ...projectNode(result), schema: OUTPUTS.edit.schema } };
}

function createEdge(body, { cwd, author, requestId, inputProtection }) {
  // Same rule as /api/nodes and the CLI: any non-empty relation name; empty falls back to related-to.
  for (const key of ['kind', 'label']) {
    if (Object.hasOwn(body, key) && typeof body[key] !== 'string') throw badRequest(`${key} must be a string`);
  }
  const kind = body.kind || 'related-to';
  if (typeof body.from !== 'string' || !body.from.trim() || typeof body.to !== 'string' || !body.to.trim()) {
    throw badRequest('from and to are required strings');
  }
  const edge = addEdge({
    from: body.from, to: body.to, kind,
    ...(Object.hasOwn(body, 'label') ? { label: body.label } : {}),
    author, requestId, ...inputProtection,
  }, cwd);
  return { status: 201, body: edge };
}

/** What a person can do from the viewer. Every write is stamped with who made it. */
export async function handleWrite(req, res, url, cwd, author) {
  const p = url.pathname;
  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('body must be a JSON object');
  if (Object.hasOwn(body, 'rejectTruncation') && typeof body.rejectTruncation !== 'boolean') {
    throw badRequest('rejectTruncation must be a boolean');
  }
  // Opt-in input protection: older clients retain their original bounded-write contract.
  const ctx = {
    cwd,
    author,
    requestId: extractRequestId(req, body),
    inputProtection: body.rejectTruncation === true ? { rejectTruncation: true } : {},
  };
  if (req.method === 'POST' && p === '/api/nodes') {
    const reply = createNode(body, ctx);
    return json(res, reply.status, reply.body);
  }
  const nodeMatch = /^\/api\/nodes\/([^/]+)$/.exec(p);
  if (nodeMatch) {
    const ref = decodeURIComponent(nodeMatch[1]);
    if (req.method === 'PATCH') {
      const reply = patchNodeRoute(ref, body, ctx);
      return json(res, reply.status, reply.body);
    }
    if (req.method === 'DELETE') return json(res, 200, removeNode(ref, { by: author, requestId: ctx.requestId }, cwd));
  }
  if (req.method === 'POST' && p === '/api/edges') {
    const reply = createEdge(body, ctx);
    return json(res, reply.status, reply.body);
  }
  if (req.method === 'DELETE' && p === '/api/edges') {
    const id = url.searchParams.get('id');
    if (!id) throw badRequest('id is required');
    return json(res, 200, removeEdge({ id }, { by: author, requestId: ctx.requestId }, cwd));
  }
  return json(res, 404, { error: 'not_found' });
}
