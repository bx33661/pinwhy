export type CardTheme = 'clean' | 'aura' | 'mono' | 'morandi' | 'classic';

export const CARD_THEMES: readonly CardTheme[] = ['clean', 'aura', 'mono', 'morandi', 'classic'];

export const DEFAULT_CARD_THEME: CardTheme = 'clean';

/** Validate a stored or user-supplied node card style; fallback safely to the default studio style. */
export function parseCardTheme(value: unknown): CardTheme {
  return typeof value === 'string' && CARD_THEMES.includes(value as CardTheme)
    ? (value as CardTheme)
    : DEFAULT_CARD_THEME;
}

/** Representative four-dot previews shown in the theme picker without requiring live DOM probing. */
export const CARD_THEME_SWATCHES: Record<CardTheme, readonly [string, string, string, string]> = {
  clean: ['#4338ca', '#b45309', '#0f766e', '#be123c'],
  aura: ['#2563eb', '#c2410c', '#0284c7', '#dc2626'],
  mono: ['#18181b', '#52525b', '#a1a1aa', '#991b1b'],
  morandi: ['#46677d', '#a16b35', '#3d7468', '#b54434'],
  classic: ['#2563eb', '#ca8a04', '#0d9488', '#db2777'],
};
