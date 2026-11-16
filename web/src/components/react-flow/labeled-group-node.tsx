// Adapted from https://ui.reactflow.dev/labeled-group-node (xyflow, MIT).
import { type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { type NodeProps, type PanelPosition } from "@xyflow/react";

import { BaseNode } from "@/components/react-flow/base-node";
import { cn } from "@/lib/utils";

export function GroupNodeLabel({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className="h-full w-full" {...props}>
      <div className={cn("w-fit px-5 pt-4 text-xs text-card-foreground", className)}>{children}</div>
    </div>
  );
}

export type GroupNodeProps = Partial<NodeProps> & {
  label?: ReactNode;
  position?: PanelPosition;
  className?: string;
  style?: CSSProperties;
};

export function GroupNode({ label, position: _position, className, style, ...props }: GroupNodeProps) {
  return (
    <BaseNode
      tabIndex={-1}
      style={style}
      className={cn("rounded-2xl border border-border/90 bg-secondary/30 shadow-xs hover:border-border", className)}
      {...props}
    >
      {label && <div className="pointer-events-none absolute left-4 right-4 top-3.5 z-10">{label}</div>}
    </BaseNode>
  );
}
