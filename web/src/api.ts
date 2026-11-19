import { t } from './i18n';
import { endpoint } from './endpoint';
import type { CheckpointChanges, GraphSnapshot, NodeHistory, UpdateCheck } from './types';
import { isGraphSnapshot } from './workspace/graph-stream';

/** Writes a person makes from the viewer. The server stamps them as human and checks where they came from. */
export type NodeInput = { type: string; title: string; detail?: string; parent?: string; target?: string; relation?: string; label?: string; tags?: string[]; at?: string; status?: string; severity?: string; confidence?: string };
type PatchFields = Partial<Record<'title' | 'detail', string>> & Partial<Record<'status' | 'severity' | 'confidence' | 'at', string | null>> & { tags?: string[] | null };
export type NodePatch = PatchFields & { expected?: PatchFields };

export class NodeConflict extends Error {
  public fields: string[];
  constructor(fields: string[]) {
    super(t('edit.conflict'));
    this.fields = fields.map((field) => field === 'loc' ? 'at' : field);
  }
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly definitive: boolean;
  constructor(message: string, options: { status?: number; code?: string; definitive?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.definitive = options.definitive ?? false;
  }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = (value: unknown): value is Record<string, unknown> & { id: string } => record(value) && typeof value.id === 'string' && value.id.length > 0;
const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const DEFINITIVE_STATUSES = new Set([403, 413, 415]);
const DEFINITIVE_REASON_RE = /^(?:body must be a JSON object|parent and target cannot be combined|nothing to change;|title is required|from and to are required strings|id is required|invalid (?:node state|severity|confidence):|no such (?:node|source node|target node|relation):)/;
const DEFINITIVE_FIELD_RE = /^(?:type|detail|parent|target|relation|status|severity|confidence|at|label|tags|kind|rejectTruncation|expected(?:\.[a-z]+)?) must (?:be|contain)/;

export function classifyApiError(status: number, envelope: Record<string, unknown> | null): NodeConflict | ApiError {
  if (status === 409 && envelope?.error === 'node_conflict') {
    return new NodeConflict(stringList(envelope.fields));
  }
  if (envelope?.code === 'input_too_long' || envelope?.error === 'input_too_long') {
    const labels: Record<string, string> = { title: t('edit.title'), detail: t('edit.detail') };
    const fields = stringList(envelope.fields).map((field) => Object.hasOwn(labels, field) ? labels[field] : field).join(', ');
    return new ApiError(t('api.inputTooLong', { fields }), { status, definitive: true });
  }
  const ref = typeof envelope?.asOf === 'string' ? envelope.asOf : typeof envelope?.since === 'string' ? envelope.since : '';
  const message = envelope?.error === 'read_only' ? t('api.readOnly')
    : envelope?.error === 'checkpoint_not_found' ? t('api.checkpointNotFound', { id: ref })
    : envelope?.code === 'ambiguous_ref' ? t('api.ambiguousRef', { id: ref, candidates: stringList(envelope.candidates).join(', ') })
    : typeof envelope?.error === 'string' && envelope.error ? envelope.error : t('api.failed', { status });
  const reason = typeof envelope?.error === 'string' ? envelope.error : '';
  const definitive = DEFINITIVE_STATUSES.has(status) || envelope?.code === 'ambiguous_ref'
    || DEFINITIVE_REASON_RE.test(reason) || DEFINITIVE_FIELD_RE.test(reason);
  return new ApiError(message, { status, definitive });
}

async function send<T>(method: string, url: string, body?: unknown, requestId?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint(url), { method, headers: { 'Content-Type': 'application/json', ...(requestId ? { 'Idempotency-Key': requestId } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(t('api.noResponse'), { code: 'no_response' });
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { /* An unreadable error body still has a useful HTTP status. */ }
  const envelope = record(data) ? data : null;
  if (!response.ok) throw classifyApiError(response.status, envelope);
  if (!envelope) throw new ApiError(t('api.invalidResponse', { status: response.status }), { code: 'invalid_response', status: response.status });
  return data as T;
}

type AddNodeBody = NodeInput & { rejectTruncation: true };
type PatchNodeBody = NodePatch & { rejectTruncation: true };
type AddEdgeBody = { from: string; to: string; kind: string; label?: string; rejectTruncation: true };

export type WriteSpec =
  | { command: 'addNode'; method: 'POST'; url: string; body: AddNodeBody }
  | { command: 'patchNode'; method: 'PATCH'; url: string; id: string; body: PatchNodeBody }
  | { command: 'removeNode'; method: 'DELETE'; url: string; id: string }
  | { command: 'addEdge'; method: 'POST'; url: string; body: AddEdgeBody }
  | { command: 'removeEdge'; method: 'DELETE'; url: string; id: string };

type OriginalRequest = WriteSpec & { requestId: string; serialized?: string };

function freezeRequest(spec: WriteSpec, requestId: string): OriginalRequest {
  if (spec.command === 'removeNode' || spec.command === 'removeEdge') return { ...spec, requestId };
  const serialized = JSON.stringify(spec.body);
  return { ...spec, body: JSON.parse(serialized), serialized, requestId };
}

function validResult(request: OriginalRequest, result: unknown): boolean {
  if (!record(result)) return false;
  if (request.command === 'addNode') {
    if (!hasId(result.node) || typeof result.node.title !== 'string' || typeof result.node.type !== 'string'
      || !Array.isArray(result.edges) || !result.edges.every(hasId)) return false;
    const nodeId = result.node.id;
    const { target, parent, relation } = request.body;
    if (target || parent) {
      return result.edges.length === 1 && result.edges.some((edge) =>
        edge.from === (target ? nodeId : parent)
        && edge.to === (target || nodeId) && edge.kind === (relation || 'related-to'));
    }
    return result.edges.length === 0;
  }
  if (!hasId(result) || ('id' in request && request.id && result.id !== request.id)) return false;
  if (request.command === 'removeNode') return Array.isArray(result.edges) && result.edges.every((id) => typeof id === 'string');
  if (request.command === 'addEdge') return result.from === request.body.from && result.to === request.body.to && result.kind === request.body.kind;
  if (request.command === 'removeEdge') return typeof result.from === 'string' && typeof result.to === 'string' && typeof result.kind === 'string';
  return typeof result.type === 'string' && typeof result.title === 'string';
}

/** One immutable request survives transport ambiguity; checks never write and retries are explicit. */
export class WriteOperation {
  private request: OriginalRequest | null = null;
  private flight: Promise<unknown> | null = null;
  private uncertain = false;
  busy = false;
  error: string | null = null;
  onSuccess?: () => void;
  onReject?: (error: unknown) => void;
  constructor(private changed: () => void = () => {}) {}
  get locked() { return this.request !== null; }
  get requestId() { return this.request?.requestId; }
  get command() { return this.request?.command; }
  clearError() { this.error = null; this.changed(); }
  private complete(result: unknown) {
    this.request = null;
    this.uncertain = false;
    this.error = null;
    const callback = this.onSuccess;
    this.onSuccess = undefined;
    this.onReject = undefined;
    callback?.();
    return result;
  }
  private singleflight(action: () => Promise<unknown>) {
    if (this.flight) return this.flight;
    this.busy = true;
    // Publish the flight before invoking fetch or a subscriber can re-enter submission.
    this.flight = Promise.resolve().then(action).finally(() => {
      this.flight = null; this.busy = false; this.changed();
    });
    this.changed();
    return this.flight;
  }
  submit<T>(spec: WriteSpec): Promise<T> {
    const serialized = 'body' in spec ? JSON.stringify(spec.body) : undefined;
    if (this.request) {
      if (this.request.command !== spec.command || this.request.url !== spec.url || this.request.serialized !== serialized) {
        return Promise.reject(new Error(t('write.payloadLocked')));
      }
      return (this.flight || Promise.reject(new Error(t('write.payloadLocked')))) as Promise<T>;
    }
    this.request = freezeRequest(spec, crypto.randomUUID());
    return this.singleflight(() => this.transmit()) as Promise<T>;
  }
  private async inspect() {
    const request = this.request;
    if (!request) throw new Error(t('write.unknown'));
    const data = await send<unknown>('GET', `/api/receipt?requestId=${encodeURIComponent(request.requestId)}`);
    if (!record(data) || data.schema !== 'pinwhy.receipt-response.v1' || data.readOnly !== true || !record(data.receipt)) throw new Error(t('write.unknown'));
    const receipt = data.receipt;
    if (receipt.requestId !== request.requestId || receipt.command !== request.command
      || !['committed', 'pending'].includes(String(receipt.status)) || !validResult(request, receipt.result)) throw new Error(t('write.unknown'));
    if (receipt.status === 'committed') return this.complete(receipt.result);
    this.error = t(receipt.recoverable === false ? 'write.blocked' : 'write.pending');
    throw new Error(this.error);
  }
  private async reconcile(): Promise<unknown> {
    this.uncertain = true;
    this.error = t('write.unknown');
    try { return await this.inspect(); }
    catch { throw new ApiError(this.error || t('write.unknown'), { code: 'write_unconfirmed' }); }
  }
  private async transmit() {
    const request = this.request;
    if (!request) return undefined;
    let result: unknown;
    try {
      const body = 'body' in request ? request.body : undefined;
      result = await send(request.method, request.url, body, request.requestId);
    } catch (error) {
      if (error instanceof NodeConflict || (error instanceof ApiError && error.definitive && (!this.uncertain || error.status !== 403))) {
        this.request = null;
        this.uncertain = false;
        this.error = error.message;
        this.onReject?.(error);
        this.onSuccess = undefined; this.onReject = undefined;
        throw error;
      }
      return this.reconcile();
    }
    if (!validResult(request, result)) return this.reconcile();
    return this.complete(result);
  }
  check() { return this.flight || (!this.request ? Promise.resolve() : this.singleflight(() => this.reconcile())); }
  retry() { return this.flight || (!this.request ? Promise.resolve() : this.singleflight(() => this.transmit())); }
}

export const addNode = (input: NodeInput, operation = new WriteOperation()) => operation.submit<{ node: { id: string } }>({ command: 'addNode', method: 'POST', url: '/api/nodes', body: { ...input, rejectTruncation: true } });
export const patchNode = (id: string, set: NodePatch, operation = new WriteOperation()) => operation.submit({ command: 'patchNode', method: 'PATCH', url: `/api/nodes/${encodeURIComponent(id)}`, id, body: { ...set, rejectTruncation: true } });
export const removeNode = (id: string, operation = new WriteOperation()) => operation.submit({ command: 'removeNode', method: 'DELETE', url: `/api/nodes/${encodeURIComponent(id)}`, id });
export const addEdge = (from: string, to: string, kind: string, label?: string, operation = new WriteOperation()) => operation.submit({ command: 'addEdge', method: 'POST', url: '/api/edges', body: { from, to, kind, ...(label ? { label } : {}), rejectTruncation: true } });
export const removeEdge = (id: string, operation = new WriteOperation()) => operation.submit({ command: 'removeEdge', method: 'DELETE', url: `/api/edges?id=${encodeURIComponent(id)}`, id });

/** How a new card relates to the selected one. Each reads "new <relation> current" except the last. */
export const LINKS = [
  { id: 'supports', label: t('link.supports') },
  { id: 'contradicts', label: t('link.contradicts') },
  { id: 'derived-from', label: t('link.derived-from') },
  { id: 'related-to', label: t('link.related-to') },
] as const;

export const CREATABLE_TYPES = ['fact', 'observation', 'hypothesis', 'question', 'action', 'result', 'finding', 'vuln', 'note', 'goal', 'condition', 'coverage'] as const;
export const SETTABLE_STATUSES = ['open', 'active', 'done', 'blocked', 'dead', 'confirmed', 'refuted', 'deferred', 'superseded'] as const;

/** Read projections from this server only; static exports never call these. */
export const getNodeHistory = (id: string) => send<NodeHistory>('GET', `/api/history?node=${encodeURIComponent(id)}`);
export const getCheckpointChanges = (id: string) => send<CheckpointChanges>('GET', `/api/changes?since=${encodeURIComponent(id)}`);
export const getViewerStatus = () => send<{ cwd: string }>('GET', '/api/status');
/** The board as it stood right after checkpoint `ref`; never writable. */
export async function getGraphAsOf(ref: string): Promise<GraphSnapshot> {
  const data = await send<unknown>('GET', `/api/graph?asOf=${encodeURIComponent(ref)}`);
  if (!isGraphSnapshot(data)) throw new Error(t('api.invalidSnapshot'));
  return data;
}
/** What changed after `since`, counting only the log up to checkpoint `asOf`. */
export const getChangesBetween = (since: string, asOf: string) => send<CheckpointChanges>('GET', `/api/changes?since=${encodeURIComponent(since)}&asOf=${encodeURIComponent(asOf)}`);
export const SETTABLE_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const SETTABLE_CONFIDENCES = ['suspected', 'static-confirmed', 'reproduced', 'confirmed'] as const;

export async function getUpdateCheck(): Promise<UpdateCheck> {
  const result = await send<UpdateCheck>('GET', '/api/update');
  if (result.schema !== 'pinwhy.update-check.v1'
    || !['available', 'current', 'ahead'].includes(result.status)
    || typeof result.currentVersion !== 'string' || typeof result.latestVersion !== 'string') {
    throw new Error(t('api.invalidResponse', { status: 200 }));
  }
  return result;
}
