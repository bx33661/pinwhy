import { useEffect, useRef, useState } from 'react';
import { useEdgesState, useNodesState, useUpdateNodeInternals } from '@xyflow/react';
import { layoutGraph, type CanvasEdge, type CanvasNode, type Positions } from '../graph';
import type { ViewMode } from '../types';
import { isMotionReduced } from '../view-transition';
import { layoutAudit } from './audit-layout';

export type WorkspaceProjection = { nodes: CanvasNode[]; edges: CanvasEdge[]; audit?: boolean };

/** One layout supplies both canvases. Content refreshes keep dragged positions and routed edges. */
export function useWorkspaceLayout(projection: WorkspaceProjection | null, mode: ViewMode, direction: 'RIGHT' | 'DOWN') {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges] = useEdgesState<CanvasEdge>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [layoutMode, setLayoutMode] = useState<ViewMode | null>(null);
  const [laying, setLaying] = useState(0);
  const [layoutTransition, setLayoutTransition] = useState(false);
  const [overviewColumns, setOverviewColumns] = useState<1 | 2>(() => window.innerWidth > 1100 ? 2 : 1);
  const layoutKey = useRef('');
  const lastPositions = useRef(new Map<string, Positions>());
  const laidOutDirection = useRef<string | null>(null);
  const hasMounted = useRef(false);
  const knownIds = useRef(new Set<string>());
  const transitionTimer = useRef<number | undefined>(undefined);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  useEffect(() => {
    const resize = () => setOverviewColumns(window.innerWidth > 1100 ? 2 : 1);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!projection) return;
    const key = JSON.stringify([mode, direction, overviewColumns, projection.audit, projection.nodes.map((node) => [node.id, node.data.auditRoles]), projection.edges.map((edge) => [edge.id, edge.source, edge.target])]);
    if (layoutKey.current === key) {
      const fresh = new Map(projection.nodes.map((node) => [node.id, node]));
      setNodes((previous) => previous.map((node) => {
        const next = fresh.get(node.id);
        if (!next) return node;
        const style = mode === 'all'
          ? { ...next.style, width: node.style?.width ?? node.width, height: node.style?.height ?? node.height }
          : { ...node.style, ...next.style };
        return {
          ...node,
          style,
          width: node.width ?? next.width,
          height: node.height ?? next.height,
          data: { ...next.data, ...node.data, item: next.data.item, dimmed: next.data.dimmed, current: next.data.current, agents: next.data.agents },
        };
      }));
      setEdges((previous) => {
        const routes = new Map(previous.map((edge) => [edge.id, edge.data.route]));
        return projection.edges.map((edge) => ({ ...edge, data: { ...edge.data, route: routes.get(edge.id) } }));
      });
      return;
    }
    let cancelled = false;
    const viewKey = `${projection.audit ? 'audit' : 'general'}:${mode}:${direction}`;
    const slow = window.setTimeout(() => setLaying(projection.nodes.length), 300);
    const layout = projection.audit
      ? Promise.resolve(layoutAudit(projection.nodes, projection.edges, direction))
      : layoutGraph(projection.nodes, projection.edges, direction, mode === 'all', overviewColumns, lastPositions.current.get(viewKey));
    layout.then((layouted) => {
      if (cancelled) return;
      const allowMotion = hasMounted.current && !isMotionReduced();
      let enterCount = 0;
      const nextNodes = allowMotion
        ? layouted.nodes.map((node) => (!node.data.group && !knownIds.current.has(node.id)
          ? { ...node, data: { ...node.data, entering: true, enterOrder: Math.min(enterCount++, 8) } }
          : node))
        : layouted.nodes;
      knownIds.current = new Set(layouted.nodes.map((node) => node.id));
      hasMounted.current = true;
      lastPositions.current.set(viewKey, new Map(layouted.nodes.map((node) => [node.id, node.position])));
      layoutKey.current = key;
      if (allowMotion) {
        setLayoutTransition(true);
        clearTimeout(transitionTimer.current);
        transitionTimer.current = window.setTimeout(() => {
          setLayoutTransition(false);
          setNodes((prev) => prev.some((node) => node.data.entering)
            ? prev.map((node) => node.data.entering ? { ...node, data: { ...node.data, entering: false } } : node)
            : prev);
        }, 360);
      }
      setNodes(nextNodes);
      setEdges(layouted.edges);
      setLayoutMode(mode);
      setLayoutRevision((revision) => revision + 1);
      // Direction changes move handles: ask React Flow to remeasure once for the batch.
      if (laidOutDirection.current && laidOutDirection.current !== direction) updateNodeInternals(layouted.nodes.map((node) => node.id));
      laidOutDirection.current = direction;
    }).finally(() => { clearTimeout(slow); if (!cancelled) setLaying(0); });
    return () => { cancelled = true; clearTimeout(slow); };
  }, [projection, mode, direction, overviewColumns, setNodes, setEdges, updateNodeInternals]);

  return { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying, layoutTransition };
}
