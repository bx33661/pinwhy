// Segmented control built on Radix ToggleGroup (single, never empty).
import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

function Segmented<T extends string>({ value, onValueChange, className, children, ...props }: Omit<React.ComponentProps<typeof ToggleGroupPrimitive.Root>, "type" | "value" | "onValueChange" | "defaultValue"> & { value: T; onValueChange: (value: T) => void }) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = React.useState({ left: 0, width: 0, ready: false, animate: false })

  useIsoLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[data-state="on"]')
      if (active && active.offsetWidth > 0) {
        const left = active.offsetLeft
        const width = active.offsetWidth
        setThumb((prev) => (prev.ready && prev.left === left && prev.width === width
          ? prev
          : { left, width, ready: true, animate: prev.ready }))
      }
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [value])

  return (
    <ToggleGroupPrimitive.Root
      ref={rootRef}
      type="single"
      value={value}
      data-fluid={thumb.ready ? "true" : undefined}
      // Radix emits "" when the active item is pressed again; a view is always selected.
      onValueChange={(next) => next && onValueChange(next as T)}
      className={cn("relative inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5", className)}
      {...props}
    >
      {thumb.ready && (
        <span
          aria-hidden="true"
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
          className={cn(
            "pointer-events-none absolute bottom-0.5 left-0 top-0.5 rounded-md bg-card shadow-xs",
            thumb.animate && "transition-[transform,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        />
      )}
      {children}
    </ToggleGroupPrimitive.Root>
  )
}

function SegmentedItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "relative z-10 inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs in-[[data-fluid=true]]:data-[state=on]:bg-transparent in-[[data-fluid=true]]:data-[state=on]:shadow-none [&_svg]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
