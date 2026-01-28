import { Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  estimateTotalTokens, 
  getContextRotPercentage, 
  getContextRotSeverity,
  CONTEXT_ROT_THRESHOLD_TOKENS
} from "@/lib/tokenUtils";
import type { ChatMessage } from "@shared/schema";

interface ContextProgressBarProps {
  messages: ChatMessage[];
}

export function ContextProgressBar({ messages }: ContextProgressBarProps) {
  const totalTokens = estimateTotalTokens(messages);
  const percentage = getContextRotPercentage(totalTokens);
  const severity = getContextRotSeverity(totalTokens);

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

  const getMessage = () => {
    switch (severity) {
      case 'safe': return 'Context health is good';
      case 'warning': return 'Context usage is increasing';
      case 'danger': return 'Approaching context rot threshold';
      case 'critical': return 'Context rot imminent - clear chat to restore quality';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className="flex items-center gap-2 min-w-[120px] max-w-[180px] cursor-help"
          data-testid="context-progress-bar"
        >
          <Progress 
            value={percentage} 
            className={`flex-1 h-2 ${getProgressClassName()}`}
            data-testid="progress-context-usage"
          />
          <span 
            className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
            data-testid="text-token-count"
          >
            {formatTokenCount(totalTokens)} / {formatTokenCount(CONTEXT_ROT_THRESHOLD_TOKENS)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium text-sm">{getMessage()}</p>
          <p className="text-xs text-muted-foreground">
            <Info className="h-3 w-3 inline mr-1" />
            Research shows LLM performance degrades as context grows. 
            At 200K tokens, responses become unreliable. Use the eraser to clear.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
