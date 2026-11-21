import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  offsetTop?: boolean;
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
  offsetTop = false,
}: Props) {
  return (
    <div className={cn(
      'pointer-events-none absolute left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-col items-center gap-2',
      offsetTop ? 'top-14' : 'top-3',
    )}>
      {offlineShown && (
        <div role="alert" className="max-w-full truncate rounded-full border border-destructive/40 bg-danger-soft px-3 py-1 text-xs text-destructive shadow-xs">
          {t('app.disconnected')}{syncedAt ? t('app.frozenAt', { time: new Date(syncedAt).toLocaleTimeString(locale, { hour12: false }) }) : ''}
        </div>
      )}
      {timelineActive && (
        <div role="status" className="anim-pill-in pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-foreground bg-card/92 px-3 py-1 text-xs text-foreground shadow-float backdrop-blur-md">
          <History className="size-3.5 shrink-0" />
          <span className="truncate">{t('timeline.banner', { id: timelinePoint?.id ?? asOf ?? '', time: formatTime(timelinePoint?.at ?? undefined) })}</span>
          <button type="button" className="shrink-0 rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onBackToNow}>
            {t('timeline.backToNow')}
          </button>
        </div>
      )}
      {isStatic && pastPoint && (
        <div role="status" className="flex max-w-full items-center gap-2 truncate rounded-full border border-foreground bg-card/90 px-3 py-1 text-xs text-foreground shadow-xs backdrop-blur-md">
          <History className="size-3.5 shrink-0" />
          <span className="truncate">{t('timeline.staticBadge', { id: pastPoint.id, time: formatTime(pastPoint.at ?? undefined) })}</span>
        </div>
      )}
      {hidden > 0 && (
        <button
          className="anim-pill-in pointer-events-auto max-w-full truncate rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md transition-colors hover:border-strong hover:text-foreground"
          onClick={onShowAll}
        >
          {t('app.hiddenNodes', { n: hidden })}
        </button>
      )}
      {laying > 0 && <div role="status" className="anim-pill-in max-w-full truncate rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md">{t('app.laying', { n: laying })}</div>}
      {notice && <div role="status" className="anim-pill-in max-w-full truncate rounded-full border bg-card/92 px-3 py-1 text-xs shadow-float backdrop-blur-md">{notice}</div>}
    </div>
  );
}
