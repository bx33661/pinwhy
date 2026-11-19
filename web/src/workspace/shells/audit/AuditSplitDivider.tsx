import { startPointerDrag } from '../../../components/pointer-drag';
import { t } from '../../../i18n';

const SPLIT_MIN = 28;
const SPLIT_MAX = 76;
const SPLIT_STEP = 4;

export const clampAuditSplit = (value: number) => Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, Math.round(value)));

/** Accessible split-pane divider between the audit dossier and optional argument graph. */
export function AuditSplitDivider({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const current = clampAuditSplit(value);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('audit.resizeSplit')}
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={current}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') { event.preventDefault(); onChange(clampAuditSplit(current - SPLIT_STEP)); }
        if (event.key === 'ArrowDown') { event.preventDefault(); onChange(clampAuditSplit(current + SPLIT_STEP)); }
      }}
      onPointerDown={(event) => {
        const container = event.currentTarget.parentElement;
        if (!container) return;
        const totalHeight = Math.max(160, container.getBoundingClientRect().height);
        startPointerDrag(event, ({ dy }) => onChange(clampAuditSplit(current + (dy / totalHeight) * 100)));
      }}
      className="group relative z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-b bg-background/80 transition-colors hover:bg-accent"
    >
      <span className="h-0.5 w-10 rounded-full bg-border transition-colors group-hover:bg-strong" />
    </div>
  );
}
