export type BoardNode = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  inputTruncation?: Record<string, { originalLength: number; storedLength: number }> | null;
  status?: string | null;
  severity?: string | null;
  confidence?: string | null;
  ts?: number;
  updated?: number;
  session?: string;
  [key: string]: unknown;
};

export type BoardEdge = {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  inputTruncation?: Record<string, { originalLength: number; storedLength: number }> | null;
  ts?: number;
};

export type Activity = {
  id: string;
  tool?: string;
  summary?: string;
  status?: string;
  agentId?: string;
  at?: number;
  linkedNodeIds?: string[];
};

export type Cursor = {
  id: string;
  agentId: string;
  from?: string;
  to?: string;
  at?: number;
};

/** Identity of the code serving or exporting this snapshot; older snapshots may omit it. */
export type BuildInfo = {
  version: string;
  buildId: string;
  commit: string | null;
  dirty: boolean | null;
  origin: {
    kind: 'checkout' | 'release' | 'other';
    version?: string;
    active?: boolean;
    root?: string;
  };
};

export type UpdateCheck = {
  schema: 'pinwhy.update-check.v1';
  currentVersion: string;
  latestVersion: string;
  status: 'available' | 'current' | 'ahead';
  source: string;
  updateUrl: string;
};

/** Identifies the checkpoint a historical snapshot was cut at (`/api/graph?asOf=`, `export --as-of`). */
export type CheckpointRef = { id: string; at?: number | null; agentId?: string | null; sessionId?: string | null; summary?: string; eventId?: string | null; [key: string]: unknown };

export type Checkpoint = { id?: string; at?: number; agentId?: string; summary?: string; trigger?: string; [key: string]: unknown };

export type GraphSnapshot = {
  meta: {
    title?: string;
    focus?: string;
    count?: number;
    session?: string;
    /** Set by a server that accepts edits from the viewer. */
    writable?: boolean;
    build?: BuildInfo;
    /** The checkpoint this snapshot was cut at; absent on the live board. Such a snapshot is never writable. */
    asOf?: CheckpointRef;
  };
  nodes: Record<string, BoardNode> | BoardNode[];
  edges: Record<string, BoardEdge> | BoardEdge[];
  cursors?: Record<string, Cursor>;
  cursorTrail?: unknown[];
  activities?: Record<string, Activity> | Activity[];
  checkpoints?: Record<string, Checkpoint>;
  stats?: {
    total?: number;
    edges?: number;
    activities?: number;
    checkpoints?: number;
    frontier?: number;
    confirmed?: number;
    candidates?: number;
    byType?: Record<string, number>;
    vulns?: Record<string, number>;
    confidence?: Record<string, number>;
  };
  digest?: string;
  digests?: Record<string, string>;
};

export type ViewMode = 'context' | 'logic' | 'all';
export type WorkspaceMode = 'general' | 'audit' | 'ultra';

export type UltraSliceStatus = 'pending' | 'stale' | 'shallow' | 'cleared' | 'flagged';

export type UltraSlice = {
  id: string;
  key: string;
  path: string;
  sector: string;
  startLine: number;
  endLine: number;
  lines: number;
  hash: string;
  status: string;
  effectiveStatus: UltraSliceStatus;
  shallowReason?: string | null;
  unverifiedDependencies?: string[];
  humanFollowups?: string[];
  note?: string;
  refs?: string[];
  dependsOn?: string[];
  reviewedHash?: string | null;
  agent?: string | null;
  reopenReason?: string;
  syncAt?: number | null;
  updatedAt?: number | null;
};

export type UltraSectorSummary = {
  sector: string;
  totalSlices: number;
  totalLines: number;
  pending: number;
  stale: number;
  shallow: number;
  cleared: number;
  flagged: number;
  findings: number;
  openThreads: number;
  sliceIds: string[];
};

export type UltraGapNode = {
  id: string;
  type: string;
  title: string;
  status: string | null;
  severity: string | null;
  confidence: string | null;
  loc?: { path?: string; line?: number; column?: number } | null;
  author?: string | null;
  updatedBy?: string | null;
};

export type UltraSnapshot = {
  schema: 'pinwhy.ultra.v1';
  readOnly: true;
  prescriptive: false;
  initialized: boolean;
  scope: string | null;
  maxSliceLines: number;
  syncCount: number;
  updatedAt: number | null;
  integrity?: { corruptLines: number };
  summary: {
    totalSlices: number;
    totalLines: number;
    pending: number;
    stale: number;
    shallow: number;
    cleared: number;
    flagged: number;
    coveredSlices: number;
    sectors: number;
    openThreads: number;
    unbackedVerdicts: number;
    awakenedChains: number;
    unresolvedAnomalies: number;
    humanSignals: number;
    untrackedFiles: number;
    diskStale: number;
    remainingSlices: number;
    coverageRatio: number;
  };
  slices: UltraSlice[];
  sectors: UltraSectorSummary[];
  gaps: {
    openThreads: UltraGapNode[];
    unbackedVerdicts: UltraGapNode[];
    awakenedChains: { hypothesis: UltraGapNode; matches: { nodeId: string; title: string; via: string }[] }[];
    unresolvedAnomalies: UltraGapNode[];
    humanSignals: UltraGapNode[];
    untrackedFiles: string[];
    diskStaleIds: string[];
    shallowSlices: { id: string; path: string; startLine: number; endLine: number; reason: string | null; unverifiedDependencies?: string[]; humanFollowups?: string[] }[];
    staleSlices: { id: string; path: string; startLine: number; endLine: number }[];
  };
  breadthComplete: boolean;
  commitmentComplete?: boolean;
  allClear: boolean;
};

export const values = <T,>(input: Record<string, T> | T[] | undefined): T[] =>
  Array.isArray(input) ? input : Object.values(input || {});


export type FieldChange = { before: unknown; after: unknown };
export type HistoryEntry = {
  index: number;
  eventId?: string | null;
  op: string;
  at: number | null;
  by: string | null;
  reason: string | null;
  changes: Record<string, FieldChange>;
  edges: { added: BoardEdge[]; removed: BoardEdge[] };
};
export type HistoryIntegrity = { corruptLines: number; futureEvents: number; unknownOps: number; rejected: number };
export type NodeHistory = { nodeId: string; entries: HistoryEntry[]; integrity: HistoryIntegrity };
export type CheckpointChanges = {
  since: { id: string; at: number | null; index: number; summary: string };
  nodes: { added: BoardNode[]; updated: { id: string; before: BoardNode; after: BoardNode; fields: string[] }[]; removed: BoardNode[] };
  edges: { added: BoardEdge[]; removed: BoardEdge[] };
  events: { index: number; op: string; at: number | null; by: string | null; reason: string | null; nodes: CheckpointChanges['nodes']; edges: CheckpointChanges['edges'] }[];
  integrity: HistoryIntegrity;
};
