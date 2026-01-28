import * as React from "react"
import { cn } from "@/lib/utils"

export type StatusType = "success" | "warning" | "destructive" | "muted"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusType
  label?: string
  showDot?: boolean
}

const statusConfig: Record<StatusType, { dotClass: string; label: string }> = {
  success: {
    dotClass: "status-dot-success",
    label: "On Track",
  },
  warning: {
    dotClass: "status-dot-warning", 
    label: "Delayed",
  },
  destructive: {
    dotClass: "status-dot-destructive",
    label: "Off Track",
  },
  muted: {
    dotClass: "status-dot-muted",
    label: "Pending",
  },
}

function StatusBadge({ 
  status, 
  label, 
  showDot = true,
  className,
  ...props 
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const displayLabel = label || config.label

  return (
    <div 
      className={cn(
        "inline-flex items-center gap-2 text-sm",
        className
      )}
      data-testid={`status-badge-${status}`}
      {...props}
    >
      {showDot && (
        <span 
          className={cn("status-dot", config.dotClass)}
          data-testid={`status-dot-${status}`}
        />
      )}
      <span 
        className="text-foreground/80"
        data-testid={`status-label-${status}`}
      >
        {displayLabel}
      </span>
    </div>
  )
}

export { StatusBadge }
