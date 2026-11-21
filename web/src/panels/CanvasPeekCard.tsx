import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SeverityBadge } from '../SeverityBadge';
import { TypeDot } from '../SecurityNode';
import { typeLabel } from '../graph';
import { presentNode, statusLabel } from '../presentation';
import { sourceLocation } from '../research-state';
import { t } from '../i18n';
import type { BoardNode } from '../types';

type Props = {
  node: BoardNode | null;
  degree: number;
  visible: boolean;
  inspectorOpen: boolean;
  inspectorOffset?: number;
};

/** Compact zoomed-out hover preview HUD so far-zoom cards stay legible without selecting or moving cursors. */
export function CanvasPeekCard({ node, degree, visible, inspectorOpen, inspectorOffset = 0 }: Props) {
  const [shown, setShown] = useState<{ node: BoardNode; degree: number } | null>(null);

  useEffect(() => {
    if (!visible || !node) {
      setShown(null);
      return;
    }
    const timer = window.setTimeout(() => setShown({ node, degree }), 160);
    return () => clearTimeout(timer);
  }, [visible, node, degree]);

  if (!visible || !shown) return null;
  const item = shown.node;
  const text = presentNode(item);
  const loc = sourceLocation(item);
  const dynamicRight = inspectorOpen && inspectorOffset > 0 ? { right: `${Math.round(inspectorOffset + 12)}px` } : undefined;

  return (
    <aside
      aria-hidden="true"
      data-canvas-peek
      style={dynamicRight}
      className={cn(
        'anim-peek-in pointer-events-none absolute bottom-3 z-10 w-[min(310px,calc(100%-24px))] flex-col gap-1.5 rounded-xl border bg-card/92 p-3 shadow-float backdrop-blur-md',
        inspectorOpen ? 'hidden xl:flex xl:right-[408px]' : 'hidden sm:flex sm:right-3',
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <TypeDot type={item.type} className="size-2" />
        <span className="font-medium text-foreground">{typeLabel(item.type)}</span>
        <span className="font-mono text-[10.5px]">{item.id}</span>
        <span className="ml-auto flex items-center gap-1">
          {item.status && <span>{statusLabel(item.status)}</span>}
          {item.severity && <SeverityBadge severity={item.severity} />}
        </span>
      </div>
      <p className="m-0 line-clamp-3 text-[13px] font-medium leading-5 text-foreground">{text.headline}</p>
      {text.summary && <p className="m-0 line-clamp-2 text-xs leading-[18px] text-muted-foreground">{text.summary}</p>}
      {loc && <p className="m-0 truncate font-mono text-[11px] leading-4 text-subtle">{loc}</p>}
      <p className="m-0 border-t pt-1.5 text-[11px] leading-4 text-muted-foreground">{t('peek.connections', { n: shown.degree })}</p>
    </aside>
  );
}
