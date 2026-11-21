import { memo, useMemo, useState } from 'react';
import { BaseEdge, getBezierPath, getStraightPath, Position, useStore, useStoreApi, type EdgeProps } from '@xyflow/react';
import { labelPoint, roundedPath, routeValid, type EdgeRoute } from './edge-route';
import { useIsExporting } from './export-context';
import { routeAround, type Rect } from './router';
import type { EdgeStyle } from './graph';

type RoutedData = { route?: EdgeRoute; style?: EdgeStyle; text?: string; group?: string; quiet?: boolean; reversed?: boolean; focused?: boolean };

/** From here on a card is legible, so the relation it hangs on is worth naming too. */
const LABEL_ZOOM = .6;

function approxTextWidth(text: string): number {
  let width = 16;
  for (const ch of text) width += ch.charCodeAt(0) > 0x7f ? 11 : 6.2;
  return width;
}

function fitAmbientCaption(raw: string | undefined, maxPx: number): string | undefined {
  if (!raw) return undefined;
  if (approxTextWidth(raw) <= maxPx) return raw;
  const separator = raw.indexOf(' · ');
  // In tight 96px layer gaps, keep the clean relation verb rather than clipping prose under cards.
  if (maxPx < 136 && separator > 0) {
    const verb = raw.slice(0, separator);
    if (approxTextWidth(verb) <= maxPx) return verb;
  }
  let out = '';
  let w = 24;
  for (const ch of raw) {
    const step = ch.charCodeAt(0) > 0x7f ? 11 : 6.2;
    if (w + step > maxPx) break;
    out += ch;
    w += step;
  }
  return out.length >= 2 ? `${out.trimEnd()}…` : raw.slice(0, 4);
}

/**
 * Follows ELK's route while the nodes are where the layout put them. Once a card has been dragged,
 * the edge is re-routed around the other cards instead of being drawn straight through them.
 */
export const RoutedEdge = memo(function RoutedEdge(props: EdgeProps) {
  const { source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerStart, markerEnd, style, label, interactionWidth } = props;
  const { route, style: shape = 'curve', text, group, quiet, reversed, focused } = (props.data || {}) as RoutedData;
  const [interacting, setInteracting] = useState(false);
  const exporting = useIsExporting();
  // Weak, quiet links stay unnamed until focused; the strong families say what they are once readable.
  const liveNamed = useStore((state) => state.transform[2] >= LABEL_ZOOM);
  const named = exporting || liveNamed;
  const rawShown = typeof label === 'string'
    ? label
    : ((named || interacting) && text && (!quiet || interacting) ? text : undefined);
  const sourcePos = useStore((state) => state.nodeLookup.get(source)?.internals.positionAbsolute);
  const targetPos = useStore((state) => state.nodeLookup.get(target)?.internals.positionAbsolute);
  const sourceRun = useStore((state) => state.nodeLookup.get(source)?.data.layoutRun as number | undefined);
  const targetRun = useStore((state) => state.nodeLookup.get(target)?.data.layoutRun as number | undefined);
  const laidOut = routeValid(route, sourcePos, targetPos);
  // While a new layout lands, an edge can hold the new route for a frame or two while its cards are
  // still at their old places. That is not a drag; re-routing every edge for it stalls a big board.
  const settling = route?.run !== undefined && (sourceRun !== route.run || targetRun !== route.run);
  const detour = shape !== 'straight' && !laidOut && !settling;
  // Only stale edges subscribe to the node list, so a drag re-renders just the lines it affects.
  const nodes = useStore((state) => (detour ? state.nodes : null));
  const store = useStoreApi();
  const around = useMemo(() => {
    if (!nodes) return null;
    const obstacles: Rect[] = [];
    for (const node of store.getState().nodeLookup.values()) {
      const width = node.measured?.width, height = node.measured?.height;
      if (node.hidden || node.type === 'boardGroup' || !width || !height) continue;
      obstacles.push({ ...node.internals.positionAbsolute, width, height });
    }
    return routeAround({ x: sourceX, y: sourceY }, sourcePosition, { x: targetX, y: targetY }, targetPosition, obstacles);
  }, [nodes, store, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  let path: string;
  let labelX: number;
  let labelY: number;
  const points = laidOut && shape !== 'straight' ? route!.points : around;
  if (points) {
    path = roundedPath(points, shape === 'curve' ? 44 : 8);
    ({ x: labelX, y: labelY } = labelPoint(points));
  } else if (shape === 'straight') {
    [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else {
    // Boxed in on every side: a plain curve is the last resort.
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  }
  const tone = group && group !== 'link' ? `var(--rel-${group})` : null;
  const showFlow = Boolean(focused || interacting);
  const strokeColor = tone || 'var(--ink)';
  const originX = reversed ? targetX : sourceX;
  const originY = reversed ? targetY : sourceY;
  const isVerticalLayout = sourcePosition === Position.Bottom || sourcePosition === Position.Top;
  const minClearanceX = Math.min(Math.abs(labelX - sourceX), Math.abs(targetX - labelX));
  const availablePx = isVerticalLayout ? 220 : Math.max(68, 2 * minClearanceX - 16);
  const shown = (interacting || focused) ? rawShown : fitAmbientCaption(rawShown, availablePx);
  return <g tabIndex={0} role="img" aria-label={text} onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)} onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}>
    <title>{text}</title>
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      label={shown}
      labelBgBorderRadius={6}
      labelBgPadding={[6, 3]}
      labelStyle={{ fill: tone ? `color-mix(in srgb, ${tone} 82%, var(--ink))` : 'var(--ink-2)', fontSize: 10.5, fontWeight: 500 }}
      labelBgStyle={{
        fill: tone ? `color-mix(in srgb, ${tone} 9%, var(--surface))` : 'var(--surface)',
        stroke: tone ? `color-mix(in srgb, ${tone} 40%, var(--line-strong))` : 'var(--line-strong)',
        strokeWidth: 1,
      }}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={{ ...style, ...(interacting ? { strokeWidth: 2.35 } : {}) }}
      interactionWidth={interactionWidth}
    />
    {showFlow && (
      <>
        <path
          d={path}
          fill="none"
          className={`react-flow__edge-flow pointer-events-none${reversed ? ' is-reversed' : ''}`}
          style={{ stroke: strokeColor }}
        />
        <circle
          className="react-flow__edge-anchor pointer-events-none"
          cx={originX}
          cy={originY}
          r={3}
          fill="var(--surface)"
          stroke={strokeColor}
          strokeWidth={1.75}
        />
      </>
    )}
  </g>;
});
