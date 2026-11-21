import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Box, Crosshair, ImageDown, Map as MapIcon, Maximize2, Minus, Palette, Plus, Radio, ScanSearch, SlidersHorizontal } from 'lucide-react';
import { Panel, useReactFlow, useStore } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { IconButton } from '@/components/icon-button';
import { t } from '../i18n';

type Props = {
  hasCurrent: boolean;
  canFollow: boolean;
  canExport: boolean;
  onExport: () => void;
  grouped: boolean;
  direction: 'RIGHT' | 'DOWN';
  showMap: boolean;
  follow: boolean;
  onToggleFollow: () => void;
  motion: number;
  onLocate: () => void;
  canFocusNeighborhood?: boolean;
  onFocusNeighborhood?: () => void;
  onDirection: () => void;
  onToggleMap: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  showZoomSlider?: boolean;
  onSettings?: () => void;
  onScene3d?: () => void;
};

/** One focused floating toolbar: spatial framing, layout, minimap and zoom without style-popover clutter. */
export function CanvasToolbar({
  hasCurrent,
  canFollow,
  canExport,
  onExport,
  grouped,
  direction,
  showMap,
  follow,
  motion,
  onLocate,
  canFocusNeighborhood,
  onFocusNeighborhood,
  onDirection,
  onToggleMap,
  onToggleFollow,
  showLegend,
  onToggleLegend,
  showZoomSlider = false,
  onSettings,
  onScene3d,
}: Props) {
  // Subscribe only to quantized zoom so panning never triggers toolbar re-renders.
  const zoom = useStore((state) => Math.round(state.transform[2] * 100) / 100);
  const { zoomTo, zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);
  const Direction = direction === 'RIGHT' ? AlignHorizontalSpaceAround : AlignVerticalSpaceAround;

  return (
    <Panel position="bottom-left" className="m-3!">
      <div className="flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-0.5 rounded-xl border bg-card/88 p-1 shadow-float backdrop-blur-md">
        <IconButton label={t('toolbar.fit')} shortcut="F" onClick={() => fitView({ padding: 0.14, duration: motion })}><Maximize2 /></IconButton>
        {hasCurrent && <IconButton label={t('toolbar.locate')} shortcut="C" onClick={onLocate}><Crosshair /></IconButton>}
        {canFocusNeighborhood && onFocusNeighborhood && <IconButton label={t('toolbar.focusNeighborhood')} shortcut="Z" onClick={onFocusNeighborhood}><ScanSearch /></IconButton>}
        {hasCurrent && canFollow && (
          <IconButton
            label={grouped ? t('toolbar.followDisabled') : follow ? t('toolbar.unfollow') : t('toolbar.follow')}
            aria-pressed={follow && !grouped}
            disabled={grouped}
            onClick={onToggleFollow}
          >
            <Radio />
          </IconButton>
        )}
        <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
        {!grouped && <IconButton label={direction === 'RIGHT' ? t('toolbar.toVertical') : t('toolbar.toHorizontal')} onClick={onDirection}><Direction /></IconButton>}
        <IconButton className="max-sm:hidden" label={showLegend ? t('toolbar.hideLegend') : t('toolbar.showLegend')} aria-pressed={showLegend} onClick={onToggleLegend}><Palette /></IconButton>
        <IconButton label={showMap ? t('toolbar.hideMap') : t('toolbar.showMap')} shortcut="M" aria-pressed={showMap} onClick={onToggleMap}><MapIcon /></IconButton>
        {onSettings && <IconButton className="max-sm:hidden" label={t('settings.open')} shortcut="⌘," onClick={onSettings}><SlidersHorizontal /></IconButton>}
        {(canExport || onScene3d) && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />}
        {canExport && <IconButton label={t('toolbar.export')} onClick={onExport}><ImageDown /></IconButton>}
        {onScene3d && (
          <IconButton
            data-scene3d-trigger
            size="sm"
            className="h-7 gap-1 bg-secondary/60 px-2 text-xs text-foreground hover:bg-secondary"
            label={t('toolbar.scene3d')}
            onClick={onScene3d}
          >
            <Box className="size-3.5" />
            <span aria-hidden="true" className="font-medium max-sm:hidden">2.5D</span>
          </IconButton>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <IconButton label={t('toolbar.zoomOut')} onClick={() => zoomOut({ duration: motion })}><Minus /></IconButton>
          {showZoomSlider && (
            <Slider
              aria-label={t('toolbar.zoom')}
              className="w-20 max-sm:hidden"
              value={[zoom]}
              min={minZoom}
              max={maxZoom}
              step={0.01}
              onValueChange={(next) => zoomTo(next[0])}
            />
          )}
          <IconButton label={t('toolbar.zoomIn')} onClick={() => zoomIn({ duration: motion })}><Plus /></IconButton>
          <Button size="sm" className="w-12 tabular-nums text-muted-foreground" aria-label={t('toolbar.zoomReset')} onClick={() => zoomTo(1, { duration: motion })}>
            {Math.round(zoom * 100)}%
          </Button>
        </div>
      </div>
    </Panel>
  );
}
