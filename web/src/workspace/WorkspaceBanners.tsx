import { History } from 'lucide-react';
import { formatTime } from '../graph';
import { locale, t } from '../i18n';
import type { CheckpointRef } from '../types';

type Props = {
  offlineShown: boolean;
  syncedAt: number | null;
  timelineActive: boolean;
  timelinePoint: CheckpointRef | null;
  asOf: string | null;
  onBackToNow: () => void;
  isStatic: boolean;
  pastPoint: CheckpointRef | undefined;
  hidden: number;
  onShowAll: () => void;
  laying: number;
  notice: string | null;
};

/** Floating status pills above the workspace canvas (offline, checkpoint, hidden count, layout, notice). */
export function WorkspaceBanners({
  offlineShown,
  syncedAt,
  timelineActive,
  timelinePoint,
  asOf,
  onBackToNow,
  isStatic,
  pastPoint,
  hidden,
  onShowAll,
  laying,
  notice,
}: Props) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
      {offlineShown && (
        <div role="alert" className="whitespace-nowrap rounded-full border border-destructive/40 bg-danger-soft px-3 py-1 text-xs text-destructive shadow-xs">
          {t('app.disconnected')}{syncedAt ? t('app.frozenAt', { time: new Date(syncedAt).toLocaleTimeString(locale, { hour12: false }) }) : ''}
        </div>
      )}
      {timelineActive && (
        <div role="status" className="anim-pill-in pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card/90 px-3 py-1 text-xs text-foreground shadow-float backdrop-blur-md">
          <History className="size-3.5" />
          {t('timeline.banner', { id: timelinePoint?.id ?? asOf ?? '', time: formatTime(timelinePoint?.at ?? undefined) })}
          <button type="button" className="rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onBackToNow}>
            {t('timeline.backToNow')}
          </button>
        </div>
      )}
      {isStatic && pastPoint && (
        <div role="status" className="flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground bg-card/90 px-3 py-1 text-xs text-foreground shadow-xs backdrop-blur-md">
          <History className="size-3.5" />
          {t('timeline.staticBadge', { id: pastPoint.id, time: formatTime(pastPoint.at ?? undefined) })}
        </div>
      )}
      {hidden > 0 && (
        <button
          className="anim-pill-in pointer-events-auto whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md transition-colors hover:border-strong hover:text-foreground"
          onClick={onShowAll}
        >
          {t('app.hiddenNodes', { n: hidden })}
        </button>
      )}
      {laying > 0 && <div role="status" className="anim-pill-in whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md">{t('app.laying', { n: laying })}</div>}
      {notice && <div role="status" className="anim-pill-in whitespace-nowrap rounded-full border bg-card/90 px-3 py-1 text-xs shadow-float backdrop-blur-md">{notice}</div>}
    </div>
  );
}
