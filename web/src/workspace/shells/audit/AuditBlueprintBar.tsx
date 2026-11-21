import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { cn } from '@/lib/utils';
import { TypeDot } from '../../../SecurityNode';
import { SeverityBadge } from '../../../SeverityBadge';
import { presentNode, typeLabel } from '../../../presentation';
import { t } from '../../../i18n';
import type { AuditSelection } from '../../audit';
import { AuditSurfaceSwitch, ConfidencePill, type CssVars } from './shared';

type Props = {
  audit: AuditSelection;
  graphOpen: boolean;
  inspectorPadding?: string;
  onToggleGraph: (next: boolean) => void;
  onIssue: (id: string | null) => void;
  onCandidate: (id: string | null) => void;
};

/** Context header shown above the full-stage Toulmin Argument Blueprint so switching back to Dossier is instant. */
export function AuditBlueprintBar({ audit, graphOpen, inspectorPadding, onToggleGraph, onIssue, onCandidate }: Props) {
  const root = audit.root;
  const memberIndex = audit.candidate ? audit.members.findIndex((item) => item.id === audit.candidate?.id) : -1;
  const prevCandidate = memberIndex > 0 ? audit.members[memberIndex - 1] : null;
  const nextCandidate = memberIndex >= 0 && memberIndex < audit.members.length - 1 ? audit.members[memberIndex + 1] : null;

  return (
    <header
      style={inspectorPadding ? ({ '--audit-pad': inspectorPadding } as CssVars) : undefined}
      className={cn(
        'z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur-xs',
        inspectorPadding && 'lg:pr-(--audit-pad)',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => onIssue(null)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          {t('audit.allIssues')}
        </button>
        {audit.issue && audit.candidate && (
          <>
            <span className="text-muted-foreground">/</span>
            <button
              type="button"
              onClick={() => onCandidate(null)}
              className="max-w-52 truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
              title={audit.issue.title}
            >
              {presentNode(audit.issue).headline}
            </button>
          </>
        )}
        {root && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
              <TypeDot type={root.type} className="size-1.5 shrink-0" />
              <span className="truncate">{presentNode(root).headline}</span>
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] font-normal text-muted-foreground">
                {typeLabel(root.type)} · {root.id}
              </span>
            </span>
            {root.severity && <SeverityBadge severity={root.severity} />}
            <ConfidencePill confidence={root.confidence} compact />
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {memberIndex >= 0 && audit.members.length > 1 && (
          <div className="inline-flex items-center gap-0.5 rounded-md border bg-secondary/40 px-1 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            <IconButton
              label={t('audit.prevCandidate')}
              disabled={!prevCandidate}
              onClick={() => prevCandidate && onCandidate(prevCandidate.id)}
              className="size-6"
            >
              <ChevronLeft className="size-3.5" />
            </IconButton>
            <span className="px-1 font-mono">{memberIndex + 1}/{audit.members.length}</span>
            <IconButton
              label={t('audit.nextCandidate')}
              disabled={!nextCandidate}
              onClick={() => nextCandidate && onCandidate(nextCandidate.id)}
              className="size-6"
            >
              <ChevronRight className="size-3.5" />
            </IconButton>
          </div>
        )}
        <AuditSurfaceSwitch graphOpen={graphOpen} onToggleGraph={onToggleGraph} />
      </div>
    </header>
  );
}
