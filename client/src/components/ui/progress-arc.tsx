import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressArcProps extends React.SVGAttributes<SVGSVGElement> {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  showLabel?: boolean
  label?: string
}

function ProgressArc({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  showLabel = true,
  label,
  className,
  ...props
}: ProgressArcProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  
  return (
    <div 
      className={cn("relative inline-flex items-center justify-center", className)}
      data-testid={`progress-arc-${Math.round(percentage)}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        data-testid="progress-arc-svg"
        {...props}
      >
        <circle
          className="progress-arc-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          data-testid="progress-arc-background"
        />
        <circle
          className="progress-arc transition-all duration-500 ease-out"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          data-testid="progress-arc-value"
        />
      </svg>
      
      {showLabel && (
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center"
          data-testid="progress-arc-label-container"
        >
          <span 
            className="text-2xl font-bold text-foreground"
            data-testid="progress-arc-percentage"
          >
            {Math.round(percentage)}%
          </span>
          {label && (
            <span 
              className="text-xs text-muted-foreground"
              data-testid="progress-arc-label"
            >
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export { ProgressArc }
