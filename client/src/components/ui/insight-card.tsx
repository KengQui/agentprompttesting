import * as React from "react"
import { cn } from "@/lib/utils"

interface InsightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description: string
  highlight?: string
  icon?: React.ReactNode
}

function InsightCard({
  title,
  description,
  highlight,
  icon,
  className,
  ...props
}: InsightCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl shadow-soft border border-card-border p-5 relative overflow-hidden",
        className
      )}
      data-testid="insight-card"
      {...props}
    >
      <div className="flex flex-col gap-3">
        <h3 
          className="text-lg font-semibold text-foreground"
          data-testid="insight-card-title"
        >
          {title}
        </h3>
        
        <p 
          className="text-sm text-foreground/70 leading-relaxed"
          data-testid="insight-card-description"
        >
          {description}
          {highlight && (
            <span 
              className="block font-semibold text-foreground mt-1"
              data-testid="insight-card-highlight"
            >
              {highlight}
            </span>
          )}
        </p>
        
        {icon && (
          <div className="mt-2" data-testid="insight-card-icon">
            {icon}
          </div>
        )}
      </div>
      
      <div className="absolute top-4 right-4 opacity-10">
        <ChevronDecoration />
      </div>
    </div>
  )
}

function ChevronDecoration() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-foreground">
      <path 
        d="M9 18l6-6-6-6" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AiDotsDecoration({ className }: { className?: string }) {
  return (
    <div className={cn("ai-dots", className)} data-testid="ai-dots-decoration">
      <span /><span /><span /><span />
      <span /><span /><span /><span />
      <span /><span /><span /><span />
    </div>
  )
}

export { InsightCard, AiDotsDecoration }
