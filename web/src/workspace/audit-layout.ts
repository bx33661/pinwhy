import type { EdgeRoute, Pt } from '../edge-route';
import { NODE_H, NODE_W, type CanvasEdge, type CanvasNode } from '../graph';
import type { AuditNodeRole } from './audit';

const ROLE_PRIORITY: readonly AuditNodeRole[] = [
  'root',
  'support',
  'condition',
  'contradiction',
  'candidate',
  'premise',
  'localCondition',
  'localContradiction',
  'related',
];

type StageId = 0 | 1 | 2 | 3;

function primaryRole(node: CanvasNode): AuditNodeRole {
  const roles = node.data.auditRoles ?? ['related'];
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? 'related';
}

function stageOf(role: AuditNodeRole): StageId {
  if (role === 'premise' || role === 'localCondition' || role === 'localContradiction') return 0;
  if (role === 'support' || role === 'condition' || role === 'contradiction' || role === 'candidate') return 1;
  if (role === 'root') return 2;
  return 3;
}

const nodeHeight = (node: CanvasNode) => Number(node.style?.height ?? node.height ?? NODE_H);

let auditLayoutRun = 10_000;

/**
 * Toulmin semantic blueprint layout:
 * Stage 0 (Premises & Local Challenges) → Stage 1 (Supports / Conditions / Contradictions) → Stage 2 (Focal Claim) → Stage 3 (Related).
 * Empty stages collapse, columns center around the focal claim axis, and forward edges receive clean non-overlapping routes.
 */
export function layoutAudit(nodes: CanvasNode[], edges: CanvasEdge[], direction: 'RIGHT' | 'DOWN' = 'RIGHT') {
  if (!nodes.length) return { nodes, edges };
  const run = ++auditLayoutRun;
  const horizontal = direction === 'RIGHT';
  const stageGap = horizontal ? NODE_W + 248 : 256;
  const cardGap = 32;
  const bandGap = 68;

  const byStage = new Map<StageId, CanvasNode[]>([[0, []], [1, []], [2, []], [3, []]]);
  const roleById = new Map<string, AuditNodeRole>();
  for (const node of nodes) {
    const role = primaryRole(node);
    roleById.set(node.id, role);
    byStage.get(stageOf(role))?.push(node);
  }

  // Collapse unoccupied stages so small arguments stay compact and centered.
  const activeStages = ([0, 1, 2, 3] as const).filter((stage) => (byStage.get(stage)?.length ?? 0) > 0);
  const stageCoord = new Map<StageId, number>(activeStages.map((stage, idx) => [stage, idx * stageGap]));

  const coords = new Map<string, Pt>();

  const placeCrossAxis = (stageNodes: CanvasNode[], stage: StageId, bands: AuditNodeRole[][]) => {
    const main = stageCoord.get(stage) ?? 0;
    const activeBands = bands
      .map((bandRoles) => stageNodes.filter((node) => bandRoles.includes(roleById.get(node.id) ?? 'related')))
      .filter((band) => band.length > 0);
    if (!activeBands.length) return;

    const totalCross = activeBands.reduce((sum, band, bandIdx) => {
      const bandSize = band.reduce((acc, node, idx) => (
        acc + (horizontal ? nodeHeight(node) : NODE_W) + (idx > 0 ? cardGap : 0)
      ), 0);
      return sum + bandSize + (bandIdx > 0 ? bandGap : 0);
    }, 0);

    let cursor = -Math.round(totalCross / 2);
    for (let b = 0; b < activeBands.length; b++) {
      if (b > 0) cursor += bandGap;
      for (let i = 0; i < activeBands[b].length; i++) {
        const node = activeBands[b][i];
        if (i > 0) cursor += cardGap;
        coords.set(node.id, horizontal ? { x: main, y: cursor } : { x: cursor, y: main });
        cursor += horizontal ? nodeHeight(node) : NODE_W;
      }
    }
  };

  // Place Stage 1 (Dialectical inputs), Stage 2 (Focal Root), and Stage 3 (Related) first.
  placeCrossAxis(byStage.get(1) ?? [], 1, [['support'], ['condition'], ['contradiction', 'candidate']]);
  placeCrossAxis(byStage.get(2) ?? [], 2, [['root']]);
  placeCrossAxis(byStage.get(3) ?? [], 3, [['related']]);

  // Sort Stage 0 (premises & local challenges) by the cross-axis coordinate of their Stage 1 target so traces stay parallel.
  const stage0 = [...(byStage.get(0) ?? [])];
  if (stage0.length > 0) {
    const targetCross = (id: string) => {
      for (const edge of edges) {
        const peerId = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
        if (!peerId) continue;
        const peerPos = coords.get(peerId);
        if (peerPos) return horizontal ? peerPos.y : peerPos.x;
      }
      return 0;
    };
    stage0.sort((a, b) => targetCross(a.id) - targetCross(b.id));
    placeCrossAxis(stage0, 0, [['premise', 'localCondition', 'localContradiction']]);
  }

  const heightById = new Map(nodes.map((node) => [node.id, nodeHeight(node)]));
  const placedNodes = nodes.map((node) => {
    const height = heightById.get(node.id) ?? NODE_H;
    const position = coords.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      width: NODE_W,
      height,
      initialWidth: NODE_W,
      initialHeight: height,
      position,
      data: { ...node.data, direction, layoutRun: run },
    };
  });

  // Compute clean 4-point routes for forward stage transitions; reverse/same-lane links use RoutedEdge's obstacle router.
  const bundleCounts = new Map<string, number>();
  const routedEdges = edges.map((edge) => {
    const src = coords.get(edge.source);
    const dst = coords.get(edge.target);
    if (!src || !dst) return { ...edge, data: { ...edge.data, route: undefined } };
    const srcH = heightById.get(edge.source) ?? NODE_H;
    const dstH = heightById.get(edge.target) ?? NODE_H;

    if (horizontal) {
      const startX = src.x + NODE_W;
      const endX = dst.x;
      if (endX - startX < 36) return { ...edge, data: { ...edge.data, route: undefined } };
      const startY = src.y + srcH / 2;
      const endY = dst.y + dstH / 2;
      const bundleKey = `${Math.round(startX)}:${Math.round(endX)}`;
      const index = bundleCounts.get(bundleKey) ?? 0;
      bundleCounts.set(bundleKey, index + 1);
      const offset = ((index % 5) - 2) * 8;
      const midX = (startX + endX) / 2 + offset;
      const route: EdgeRoute = {
        points: [
          { x: startX, y: startY },
          { x: midX, y: startY },
          { x: midX, y: endY },
          { x: endX, y: endY },
        ],
        source: src,
        target: dst,
        direction,
        run,
      };
      return { ...edge, data: { ...edge.data, route } };
    }

    const startY = src.y + srcH;
    const endY = dst.y;
    if (endY - startY < 36) return { ...edge, data: { ...edge.data, route: undefined } };
    const startX = src.x + NODE_W / 2;
    const endX = dst.x + NODE_W / 2;
    const bundleKey = `${Math.round(startY)}:${Math.round(endY)}`;
    const index = bundleCounts.get(bundleKey) ?? 0;
    bundleCounts.set(bundleKey, index + 1);
    const offset = ((index % 5) - 2) * 8;
    const midY = (startY + endY) / 2 + offset;
    const route: EdgeRoute = {
      points: [
        { x: startX, y: startY },
        { x: startX, y: midY },
        { x: endX, y: midY },
        { x: endX, y: endY },
      ],
      source: src,
      target: dst,
      direction,
      run,
    };
    return { ...edge, data: { ...edge.data, route } };
  });

  return { nodes: placedNodes, edges: routedEdges };
}
