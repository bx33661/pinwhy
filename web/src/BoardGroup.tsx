import { memo } from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { GroupNode } from './components/react-flow/labeled-group-node';
import { useIsExporting } from './export-context';
import type { CanvasNode } from './graph';

export const BoardGroup = memo(function BoardGroup({ data }: NodeProps<CanvasNode>) {
  const exporting = useIsExporting();
  // Keep the frame label legible when the board is zoomed far out, while exporting at crisp 1x scale.
  const liveScale = useStore((state) => Math.min(1.65, Math.max(1, 0.82 / state.transform[2])));
  const scale = exporting ? 1 : liveScale;
  return (
    <GroupNode
      position="top-left"
      style={data.groupColor ? {
        borderColor: `color-mix(in srgb, ${data.groupColor} 24%, var(--line))`,
        background: `color-mix(in srgb, ${data.groupColor} 5%, var(--surface-2))`,
      } : undefined}
      label={
        <span
          className="inline-flex origin-top-left items-center gap-2 rounded-full border border-border/90 bg-card/95 px-3 py-1 shadow-xs"
          style={{ transform: `scale(${scale})`, maxWidth: `${100 / scale}%` }}
        >
          <i aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: data.groupColor || 'var(--ink-3)' }} />
          <span className="truncate text-[12.5px] font-semibold leading-4 text-foreground">{data.item.title}</span>
          <span className="rounded-full bg-secondary px-1.5 py-0 text-[11px] font-medium leading-4 tabular-nums text-subtle">{data.groupCount}</span>
          {data.groupSubtitle && <span className="truncate text-[11.5px] leading-4 text-muted-foreground">{data.groupSubtitle}</span>}
        </span>
      }
    />
  );
});
