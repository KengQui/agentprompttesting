import { AlertTriangle, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  estimateTotalTokens, 
  getContextRotPercentage, 
  getContextRotSeverity,
  CONTEXT_ROT_THRESHOLD_TOKENS
} from "@/lib/tokenUtils";
import type { ChatMessage } from "@shared/schema";

interface ContextRotWarningProps {
  messages: ChatMessage[];
  onClearChat: () => void;
  isClearing?: boolean;
}

export function ContextRotWarning({ messages, onClearChat, isClearing }: ContextRotWarningProps) {
  const totalTokens = estimateTotalTokens(messages);
  const percentage = getContextRotPercentage(totalTokens);
  const severity = getContextRotSeverity(totalTokens);
  
  if (messages.length === 0) return null;

  const formatTokenCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const getProgressClassName = () => {
    switch (severity) {
      case 'safe': return '[&>*]:bg-green-500';
      case 'warning': return '[&>*]:bg-yellow-500';
      case 'danger': return '[&>*]:bg-orange-500';
      case 'critical': return '[&>*]:bg-red-500';
    }
  };

  const getBackgroundColor = () => {
    switch (severity) {
      case 'safe': return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
      case 'danger': return 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800';
      case 'critical': return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    }
  };

  const getTextColor = () => {
    switch (severity) {
      case 'safe': return 'text-green-700 dark:text-green-300';
      case 'warning': return 'text-yellow-700 dark:text-yellow-300';
      case 'danger': return 'text-orange-700 dark:text-orange-300';
      case 'critical': return 'text-red-700 dark:text-red-300';
    }
  };

  const getMessage = () => {
    switch (severity) {
      case 'safe': return 'Context health is good';
      case 'warning': return 'Context usage is increasing';
      case 'danger': return 'Approaching context rot threshold';
      case 'critical': return 'Context rot imminent - AI responses may degrade';
    }
  };

  return (
    <div 
      className={`mx-4 mt-3 p-3 rounded-lg border ${getBackgroundColor()}`}
      data-testid="context-rot-warning"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`shrink-0 ${getTextColor()}`}>
            {severity === 'safe' ? (
              <Info className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span 
                className={`text-sm font-medium ${getTextColor()}`}
                data-testid="text-context-status"
              >
                {getMessage()}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 text-muted-foreground"
                    data-testid="button-context-info"
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Research shows LLM performance degrades as context grows. 
                    At 200K tokens, responses become increasingly unreliable. 
                    Clear the chat to start fresh.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="flex items-center gap-2">
              <Progress 
                value={percentage} 
                className={`flex-1 h-2 ${getProgressClassName()}`}
                data-testid="progress-context-usage"
              />
              <span 
                className="text-xs text-muted-foreground shrink-0"
                data-testid="text-token-count"
              >
                {formatTokenCount(totalTokens)} / {formatTokenCount(CONTEXT_ROT_THRESHOLD_TOKENS)}
              </span>
            </div>
          </div>
        </div>

        <Button
          variant={severity === 'critical' ? 'destructive' : 'outline'}
          size="sm"
          onClick={onClearChat}
          disabled={isClearing}
          className="shrink-0"
          data-testid="button-clear-context"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear Now
        </Button>
      </div>
    </div>
  );
}
