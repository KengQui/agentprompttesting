import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  fileCount: number
  preview?: React.ReactNode
  icon?: React.ReactNode
  onClick?: () => void
}

function FileCard({
  title,
  fileCount,
  preview,
  icon,
  onClick,
  className,
  ...props
}: FileCardProps) {
  const testId = `file-card-${title.toLowerCase().replace(/\s+/g, '-')}`
  
  return (
    <div
      className={cn(
        "group bg-card rounded-2xl shadow-soft hover-elevate cursor-pointer transition-all",
        "border border-card-border",
        "flex flex-col overflow-hidden",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      data-testid={testId}
      {...props}
    >
      {preview && (
        <div 
          className="file-preview aspect-[4/3] p-3"
          data-testid={`${testId}-preview`}
        >
          <div className="w-full h-full rounded-lg bg-white/80 flex items-center justify-center overflow-hidden">
            {preview}
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between p-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div 
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
              data-testid={`${testId}-icon`}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 
              className="font-semibold text-foreground truncate"
              data-testid={`${testId}-title`}
            >
              {title}
            </h3>
            <p 
              className="text-sm text-muted-foreground"
              data-testid={`${testId}-count`}
            >
              {fileCount} files
            </p>
          </div>
        </div>
        
        <div 
          className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-muted transition-colors"
          data-testid={`${testId}-chevron`}
        >
          <ChevronRight className="w-4 h-4 text-foreground/60" />
        </div>
      </div>
    </div>
  )
}

interface FileCardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function FileCardGrid({ children, className, ...props }: FileCardGridProps) {
  return (
    <div 
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
        className
      )}
      data-testid="file-card-grid"
      {...props}
    >
      {children}
    </div>
  )
}

export { FileCard, FileCardGrid }
