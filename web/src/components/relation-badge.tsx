import { cn } from '@/lib/utils';
import { relationLabel, relationTone } from '../graph';

/** Tinted pill naming a relation kind without altering its authored semantics. */
export function RelationBadge({ kind, className }: { kind: string; className?: string }) {
  const tone = relationTone(kind);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0 font-medium leading-4',
        !tone && 'bg-secondary/60 text-subtle',
        className,
      )}
      style={tone ? {
        color: `color-mix(in srgb, ${tone} 85%, var(--ink))`,
        borderColor: `color-mix(in srgb, ${tone} 30%, var(--line))`,
        background: `color-mix(in srgb, ${tone} 10%, var(--surface))`,
      } : undefined}
    >
      {relationLabel(kind)}
    </span>
  );
}
