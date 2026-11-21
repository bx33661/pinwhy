import { getFontEmbedCSS, toPng } from 'html-to-image';
import type { Rect } from '@xyflow/react';

const PAD = 56;
const MAX_SIDE = 8000;

/** SVG children and React Flow containers lose `.react-flow` ancestor rules when `.react-flow__viewport` is cloned standalone. */
function svgPaintRules(viewport: HTMLElement) {
  const rule = (selector: string, element: Element | null, properties: string[]) => {
    if (!element) return '';
    const style = getComputedStyle(element);
    return `${selector}{${properties.map((name) => `${name}:${style.getPropertyValue(name)}!important`).join(';')}}`;
  };
  const edges = [...viewport.querySelectorAll<SVGElement>('.react-flow__edge')].map((edge) => {
    const scope = `.react-flow__edge[data-id="${CSS.escape(edge.dataset.id || '')}"]`;
    return rule(`${scope} .react-flow__edge-path`, edge.querySelector('.react-flow__edge-path'), ['stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'fill'])
      + rule(`${scope} .react-flow__edge-text`, edge.querySelector('.react-flow__edge-text'), ['fill', 'font-size', 'font-weight', 'opacity'])
      + rule(`${scope} .react-flow__edge-textbg`, edge.querySelector('.react-flow__edge-textbg'), ['fill', 'stroke', 'stroke-width', 'opacity'])
      + rule(`${scope} .react-flow__edge-anchor`, edge.querySelector('.react-flow__edge-anchor'), ['fill', 'stroke', 'stroke-width']);
  });
  const markers = [...viewport.querySelectorAll('marker')].map((marker) =>
    rule(`[id="${CSS.escape(marker.id)}"] polyline`, marker.querySelector('polyline'), ['stroke', 'fill']));
  const layoutFix = [
    '.react-flow__viewport{transform-origin:0 0!important}',
    '.react-flow__edges{position:absolute!important;top:0!important;left:0!important;overflow:visible!important}',
    '.react-flow__edges>svg{position:absolute!important;top:0!important;left:0!important;overflow:visible!important}',
    '.react-flow__nodes{position:absolute!important;top:0!important;left:0!important;transform-origin:0 0!important}',
    '.react-flow__node{position:absolute!important;transform-origin:0 0!important}',
    '.pinwhy-card{animation:none!important;transition:none!important}',
    '.react-flow__edge-flow{display:none!important}',
  ].join('');
  return layoutFix + edges.join('') + markers.join('');
}

/** Expand node bounds to include routed edge curves and edge label pills so outer detours are never clipped. */
function measureFullBounds(viewport: HTMLElement, nodeBounds: Rect): Rect {
  let minX = nodeBounds.x - 8;
  let minY = nodeBounds.y - 8;
  let maxX = nodeBounds.x + nodeBounds.width + 8;
  let maxY = nodeBounds.y + nodeBounds.height + 8;

  const svgTargets = viewport.querySelectorAll<SVGGraphicsElement>(
    '.react-flow__edge:not([style*="display: none"]) .react-flow__edge-path, .react-flow__edge:not([style*="display: none"]) .react-flow__edge-textbg',
  );
  for (const el of svgTargets) {
    try {
      const box = el.getBBox();
      if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || (box.width === 0 && box.height === 0)) continue;
      minX = Math.min(minX, box.x - 8);
      minY = Math.min(minY, box.y - 8);
      maxX = Math.max(maxX, box.x + box.width + 8);
      maxY = Math.max(maxY, box.y + box.height + 8);
    } catch { /* ignore unmeasurable SVG elements */ }
  }

  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Render the whole board (every node, group and routed edge, not just the live viewport) to a crisp PNG. */
export async function exportCanvasPng(nodeBounds: Rect, filename: string) {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || !nodeBounds.width || !nodeBounds.height) throw new Error('nothing to export');
  const bounds = measureFullBounds(viewport, nodeBounds);
  const scale = Math.min(2, (MAX_SIDE - PAD * 2) / Math.max(bounds.width, bounds.height, 1));
  const width = Math.ceil(bounds.width * scale + PAD * 2);
  const height = Math.ceil(bounds.height * scale + PAD * 2);
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff';
  const url = await toPng(viewport, {
    width,
    height,
    backgroundColor: background,
    // Embed resolved fonts and SVG/ReactFlow styles into the clone without mutating the live canvas.
    fontEmbedCSS: (await getFontEmbedCSS(viewport)) + svgPaintRules(viewport),
    pixelRatio: 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: '0 0',
      transform: `translate(${PAD - bounds.x * scale}px, ${PAD - bounds.y * scale}px) scale(${scale})`,
      '--zoom': '1',
    } as Record<string, string>,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}
