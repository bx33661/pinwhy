import { useEffect, useState } from 'react';
import { Check, Copy, Focus, GitBranch, Globe, ImageDown, Keyboard, Languages, ListTree, Moon, Settings2, Sun, SwatchBook } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CARD_THEMES, type CardTheme } from '../card-themes';
import { TypeDot } from '../SecurityNode';
import { typeLabel } from '../graph';
import { presentNode, severityLabel, statusLabel } from '../presentation';
import type { BoardNode, ViewMode } from '../types';
import { LOCALES, followsBrowser, locale, setLocale, t } from '../i18n';

const INITIAL_NODE_CAP = 80;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: BoardNode[];
  theme: 'light' | 'dark';
  cardTheme: CardTheme;
  copied: boolean;
  onSelect: (id: string) => void;
  onMode?: (mode: ViewMode) => void;
  onTheme: () => void;
  onCardTheme: (theme: CardTheme) => void;
  onCopyDigest: () => void;
  onExport: (() => void) | null;
  onShortcuts: () => void;
  onSettings?: () => void;
};

export function CommandPalette({ open, onOpenChange, nodes, theme, cardTheme, copied, onSelect, onMode, onTheme, onCardTheme, onCopyDigest, onExport, onShortcuts, onSettings }: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (action: () => void) => () => { onOpenChange(false); action(); };
  const hasQuery = query.trim().length > 0;
  const visibleNodes = hasQuery ? nodes : nodes.slice(0, INITIAL_NODE_CAP);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent position="top" className="max-w-[560px] p-0">
        <DialogTitle className="sr-only">{t('topbar.searchCommands')}</DialogTitle>
        <DialogDescription className="sr-only">{t('palette.description')}</DialogDescription>
        <Command loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('palette.placeholder')} />
          {open && (
            <CommandList>
              <CommandEmpty>{t('palette.empty')}</CommandEmpty>
              <CommandGroup heading={t('palette.commands')}>
                {onMode && <>
                  <CommandItem value={`${t('palette.toContext')} view context`} onSelect={run(() => onMode('context'))}><Focus className="size-4 text-muted-foreground" />{t('palette.toContext')}</CommandItem>
                  <CommandItem value={`${t('palette.toLogic')} view logic`} onSelect={run(() => onMode('logic'))}><GitBranch className="size-4 text-muted-foreground" />{t('palette.toLogic')}</CommandItem>
                  <CommandItem value={`${t('palette.toAll')} view all`} onSelect={run(() => onMode('all'))}><ListTree className="size-4 text-muted-foreground" />{t('palette.toAll')}</CommandItem>
                </>}
                <CommandItem value={`${theme === 'light' ? t('palette.toDarkTheme') : t('palette.toLightTheme')} theme`} onSelect={run(onTheme)}>
                  {theme === 'light' ? <Moon className="size-4 text-muted-foreground" /> : <Sun className="size-4 text-muted-foreground" />}
                  {theme === 'light' ? t('palette.toDarkTheme') : t('palette.toLightTheme')}
                </CommandItem>
                {onSettings && (
                  <CommandItem value={`${t('palette.openSettings')} settings preferences 偏好设置`} onSelect={run(onSettings)}>
                    <Settings2 className="size-4 text-muted-foreground" />{t('palette.openSettings')}
                  </CommandItem>
                )}
                <CommandItem value={`${t('palette.copyDigest')} copy digest`} onSelect={run(onCopyDigest)}>
                  {copied ? <Check className="size-4 text-muted-foreground" /> : <Copy className="size-4 text-muted-foreground" />}{t('palette.copyDigest')}
                </CommandItem>
                {onExport && <CommandItem value={`${t('palette.export')} png export`} onSelect={run(onExport)}><ImageDown className="size-4 text-muted-foreground" />{t('palette.export')}</CommandItem>}
                <CommandItem value={`${t('palette.shortcuts')} shortcuts keyboard help`} onSelect={run(onShortcuts)}><Keyboard className="size-4 text-muted-foreground" />{t('palette.shortcuts')}</CommandItem>
              </CommandGroup>
              <CommandGroup heading={t('toolbar.cardTheme')}>
                {CARD_THEMES.map((id) => (
                  <CommandItem
                    key={id}
                    value={`${t('toolbar.cardTheme')} palette style ${id} ${t(`cardTheme.${id}`)}`}
                    onSelect={run(() => onCardTheme(id))}
                  >
                    <SwatchBook className="size-4 text-muted-foreground" />
                    <span>{t(`cardTheme.${id}`)}</span>
                    <span className="ml-1.5 truncate text-xs text-muted-foreground">{t(`cardTheme.${id}Hint`)}</span>
                    {cardTheme === id && <Check className="ml-auto size-4 shrink-0 text-muted-foreground" />}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading={t('palette.language')}>
                {LOCALES.map((option) => (
                  <CommandItem key={option.id} value={`${t('palette.language')} language ${option.name} ${option.id}`} onSelect={run(() => setLocale(option.id))}>
                    <Languages className="size-4 text-muted-foreground" />{option.name}
                    {!followsBrowser() && option.id === locale && <Check className="ml-auto size-4 text-muted-foreground" />}
                  </CommandItem>
                ))}
                <CommandItem value={`${t('palette.language')} language browser`} onSelect={run(() => setLocale(null))}>
                  <Globe className="size-4 text-muted-foreground" />{t('palette.followBrowser')}
                  {followsBrowser() && <Check className="ml-auto size-4 text-muted-foreground" />}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading={t('palette.nodes', { n: nodes.length })}>
                {visibleNodes.map((node) => (
                  <CommandItem
                    key={node.id}
                    value={`${node.id} ${node.title} ${node.detail || ''} ${typeLabel(node.type)} ${statusLabel(node.status)} ${severityLabel(node.severity)}`}
                    onSelect={run(() => onSelect(node.id))}
                  >
                    <TypeDot type={node.type} />
                    <span className="min-w-0 flex-1 truncate">{presentNode(node).headline}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{typeLabel(node.type)}</span>
                  </CommandItem>
                ))}
                {!hasQuery && nodes.length > INITIAL_NODE_CAP && (
                  <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">
                    {t('palette.typeToSearchMore', { n: nodes.length })}
                  </p>
                )}
              </CommandGroup>
            </CommandList>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
