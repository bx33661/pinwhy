import { useEffect, useState } from 'react';
import { Check, CornerDownRight, Globe, Moon, Palette, RotateCcw, Slash, SlidersHorizontal, Sparkles, Spline, Sun, X, ZapOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { CARD_THEMES, CARD_THEME_SWATCHES, type CardTheme } from '../card-themes';
import type { EdgeStyle } from '../graph';
import { followsBrowser, locale, LOCALES, setLocale, t } from '../i18n';
import type { MotionMode } from '../view-transition';
import type { AuditProvenanceMode } from '../workspace/use-workspace-chrome';

type SettingsTab = 'appearance' | 'display' | 'motion';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
  theme: 'light' | 'dark';
  onTheme: (next: 'light' | 'dark', origin?: { x: number; y: number }) => void;
  cardTheme: CardTheme;
  onCardTheme: (theme: CardTheme) => void;
  edgeStyle: EdgeStyle;
  onEdgeStyle: (style: EdgeStyle) => void;
  showCardLoc: boolean;
  onShowCardLoc: (next: boolean) => void;
  showPeekHud: boolean;
  onShowPeekHud: (next: boolean) => void;
  showZoomSlider: boolean;
  onShowZoomSlider: (next: boolean) => void;
  auditProvenanceMode: AuditProvenanceMode;
  onAuditProvenanceMode: (mode: AuditProvenanceMode) => void;
  showEmptyActivity: boolean;
  onShowEmptyActivity: (next: boolean) => void;
  motionMode: MotionMode;
  onMotionMode: (mode: MotionMode) => void;
  onReset: () => void;
};

function PreferenceSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-medium leading-5 text-foreground">{label}</p>
        <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
          checked ? 'border-foreground bg-foreground' : 'border-strong bg-secondary',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none block size-3.5 rounded-full shadow-2xs transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
            checked ? 'translate-x-[17px] bg-background' : 'translate-x-0.5 bg-foreground/75',
          )}
        />
      </button>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  embedded = false,
  theme,
  onTheme,
  cardTheme,
  onCardTheme,
  edgeStyle,
  onEdgeStyle,
  showCardLoc,
  onShowCardLoc,
  showPeekHud,
  onShowPeekHud,
  showZoomSlider,
  onShowZoomSlider,
  auditProvenanceMode,
  onAuditProvenanceMode,
  showEmptyActivity,
  onShowEmptyActivity,
  motionMode,
  onMotionMode,
  onReset,
}: Props) {
  const defaultTab: SettingsTab = embedded ? 'display' : 'appearance';
  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  useEffect(() => {
    if (embedded && tab === 'appearance') setTab('display');
  }, [embedded, tab]);

  const browserLocale = followsBrowser();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] overflow-hidden p-0">
        <header className="border-b px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="m-0 text-[15px] font-semibold text-foreground">{t('settings.title')}</DialogTitle>
              <DialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                {t('settings.description')}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button size="icon-sm" aria-label={t('common.close')}><X /></Button>
            </DialogClose>
          </div>

          <Segmented<SettingsTab>
            value={tab}
            onValueChange={setTab}
            aria-label={t('settings.title')}
            className="mt-3 w-full"
          >
            {!embedded && (
              <SegmentedItem value="appearance" className="flex-1 justify-center text-xs">
                <Palette className="size-3.5" />
                <span>{t('settings.appearance')}</span>
              </SegmentedItem>
            )}
            <SegmentedItem value="display" className="flex-1 justify-center text-xs">
              <SlidersHorizontal className="size-3.5" />
              <span>{t('settings.display')}</span>
            </SegmentedItem>
            <SegmentedItem value="motion" className="flex-1 justify-center text-xs">
              <Sparkles className="size-3.5" />
              <span>{t('settings.motionSection')}</span>
            </SegmentedItem>
          </Segmented>
        </header>

        <div className="max-h-[min(70vh,540px)] overflow-y-auto px-5 py-4">
          {tab === 'appearance' && !embedded && (
            <section key="appearance" aria-label={t('settings.appearance')} className="anim-node-swap space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-foreground">{t('settings.themeLabel')}</span>
                <div role="radiogroup" aria-label={t('settings.themeLabel')} className="inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
                  {(['light', 'dark'] as const).map((option) => {
                    const active = theme === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={(event) => {
                          if (!active) onTheme(option, { x: event.clientX, y: event.clientY });
                        }}
                        className={cn(
                          'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {option === 'light' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                        {t(option === 'light' ? 'settings.themeLight' : 'settings.themeDark')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/70 pt-3.5">
                <span className="block text-[13px] font-medium text-foreground">{t('settings.language')}</span>
                <div role="radiogroup" aria-label={t('settings.language')} className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={browserLocale}
                    onClick={() => { if (!browserLocale) setLocale(null); }}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      browserLocale
                        ? 'border-foreground bg-secondary font-medium text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-strong hover:text-foreground',
                    )}
                  >
                    <Globe className="size-3.5" />
                    {t('palette.followBrowser')}
                  </button>
                  {LOCALES.map((option) => {
                    const active = !browserLocale && locale === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => { if (!active) setLocale(option.id); }}
                        className={cn(
                          'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-foreground bg-secondary font-medium text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:border-strong hover:text-foreground',
                        )}
                      >
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/70 pt-3.5">
                <span className="block text-[13px] font-medium text-foreground">{t('toolbar.cardTheme')}</span>
                <div role="radiogroup" aria-label={t('toolbar.cardTheme')} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {CARD_THEMES.map((id) => {
                    const active = cardTheme === id;
                    const swatches = CARD_THEME_SWATCHES[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onCardTheme(id)}
                        className={cn(
                          'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-foreground bg-secondary/55 shadow-2xs'
                            : 'border-border bg-card hover:border-strong hover:bg-accent/45',
                        )}
                      >
                        <span className="mt-0.5 grid shrink-0 grid-cols-2 gap-0.5 rounded border bg-background p-1" aria-hidden="true">
                          {swatches.map((hex) => <i key={hex} className="size-1.5 rounded-full" style={{ background: hex }} />)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-1 text-xs font-semibold text-foreground">
                            <span className="truncate">{t(`cardTheme.${id}`)}</span>
                            {active && <Check className="size-3.5 shrink-0 text-foreground" />}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                            {t(`cardTheme.${id}Hint`)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {tab === 'display' && (
            <section key="display" aria-label={t('settings.display')} className="anim-node-swap divide-y divide-border/70">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5">
                <span className="text-[13px] font-medium text-foreground">{t('toolbar.edgeStyle')}</span>
                <Segmented<EdgeStyle> value={edgeStyle} onValueChange={onEdgeStyle} aria-label={t('toolbar.edgeStyle')}>
                  <SegmentedItem value="curve" className="text-xs"><Spline />{t('toolbar.curve')}</SegmentedItem>
                  <SegmentedItem value="step" className="text-xs"><CornerDownRight />{t('toolbar.step')}</SegmentedItem>
                  <SegmentedItem value="straight" className="text-xs"><Slash />{t('toolbar.straight')}</SegmentedItem>
                </Segmented>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[13px] font-medium leading-5 text-foreground">{t('settings.auditProvenance')}</p>
                  <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">{t('settings.auditProvenanceHint')}</p>
                </div>
                <Segmented<AuditProvenanceMode>
                  value={auditProvenanceMode}
                  onValueChange={onAuditProvenanceMode}
                  aria-label={t('settings.auditProvenance')}
                  className="shrink-0"
                >
                  <SegmentedItem value="auto" className="px-2 text-xs">{t('settings.provAuto')}</SegmentedItem>
                  <SegmentedItem value="always" className="px-2 text-xs">{t('settings.provAlways')}</SegmentedItem>
                  <SegmentedItem value="off" className="px-2 text-xs">{t('settings.provOff')}</SegmentedItem>
                </Segmented>
              </div>

              <PreferenceSwitch
                label={t('settings.showCardLoc')}
                hint={t('settings.showCardLocHint')}
                checked={showCardLoc}
                onCheckedChange={onShowCardLoc}
              />
              <PreferenceSwitch
                label={t('settings.showPeekHud')}
                hint={t('settings.showPeekHudHint')}
                checked={showPeekHud}
                onCheckedChange={onShowPeekHud}
              />
              <PreferenceSwitch
                label={t('settings.showZoomSlider')}
                hint={t('settings.showZoomSliderHint')}
                checked={showZoomSlider}
                onCheckedChange={onShowZoomSlider}
              />
              <PreferenceSwitch
                label={t('settings.showEmptyActivity')}
                hint={t('settings.showEmptyActivityHint')}
                checked={showEmptyActivity}
                onCheckedChange={onShowEmptyActivity}
              />
            </section>
          )}

          {tab === 'motion' && (
            <section key="motion" aria-label={t('settings.motionSection')} className="anim-node-swap py-1">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-secondary/25 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[13px] font-medium leading-5 text-foreground">{t('settings.motion')}</p>
                  <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">{t('settings.motionHint')}</p>
                </div>
                <Segmented<MotionMode> value={motionMode} onValueChange={onMotionMode} aria-label={t('settings.motion')} className="shrink-0">
                  <SegmentedItem value="fluid" className="text-xs"><Sparkles />{t('settings.motionFluid')}</SegmentedItem>
                  <SegmentedItem value="reduced" className="text-xs"><ZapOff />{t('settings.motionReduced')}</SegmentedItem>
                </Segmented>
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t bg-secondary/25 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Kbd>⌘ ,</Kbd>
            <span>{t('settings.title')}</span>
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onReset}>
            <RotateCcw className="size-3" />
            {t('settings.reset')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
