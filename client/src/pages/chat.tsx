import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Send, Bot, User, Settings, Loader2, X, AlertCircle, MessageSquare, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ContextRotWarning } from "@/components/context-rot-warning";
import type { Agent, ChatMessage } from "@shared/schema";

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_COOLDOWN = 2000;

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      data-testid={`message-${message.id}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p
          className={`text-xs mt-1 ${
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function TypingIndicator({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="bg-muted rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-6 px-2 text-xs text-muted-foreground"
              data-testid="button-cancel-response"
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextSummary({ messages, topic }: { messages: ChatMessage[]; topic: string | null }) {
  if (messages.length === 0) return null;
  
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        {messages.length} message{messages.length !== 1 ? 's' : ''} in conversation
        {topic && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {topic}
          </Badge>
        )}
      </span>
    </div>
  );
}

function CharacterCounter({ current, max }: { current: number; max: number }) {
  const percentage = (current / max) * 100;
  const isWarning = percentage > 80;
  const isError = current > max;
  
  return (
    <span
      className={`text-xs ${
        isError ? "text-destructive" : isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"
      }`}
      data-testid="text-character-count"
    >
      {current}/{max}
    </span>
  );
}

function detectTopic(messages: ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  
  const recentMessages = messages.slice(-5);
  const allText = recentMessages.map(m => m.content.toLowerCase()).join(' ');
  
  const topics = [
    { keywords: ['help', 'support', 'issue', 'problem', 'fix'], label: 'Support' },
    { keywords: ['buy', 'purchase', 'price', 'cost', 'order'], label: 'Sales' },
    { keywords: ['how', 'what', 'why', 'explain', 'tell me'], label: 'Questions' },
    { keywords: ['thanks', 'thank you', 'great', 'awesome'], label: 'Feedback' },
    { keywords: ['schedule', 'book', 'appointment', 'meeting'], label: 'Scheduling' },
  ];
  
  for (const topic of topics) {
    if (topic.keywords.some(keyword => allText.includes(keyword))) {
      return topic.label;
    }
  }
  
  return 'General';
}

function EmptyChat({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
      <p className="text-muted-foreground text-center max-w-sm">
        Send a message to {agentName} to begin testing your agent configuration.
      </p>
    </div>
  );
}

export default function Chat() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", params.id],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/agents", params.id, "messages"],
  });

  const currentTopic = detectTopic(messages);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      abortControllerRef.current = new AbortController();
      setIsCancelled(false);
      
      const response = await fetch(`/api/agents/${params.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }
      
      return await response.json() as ChatMessage[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "messages"] });
      setLastMessageTime(Date.now());
    },
    onError: (error: Error) => {
      if (error.name === 'AbortError' || isCancelled) {
        toast({
          title: "Response cancelled",
          description: "The AI response was cancelled.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "messages"] });
        return;
      }
      
      let title = "Error";
      let description = error.message || "Failed to send message";
      
      if (error.message.includes("API key")) {
        title = "Configuration Error";
        description = "The AI service is not properly configured. Please check the API key settings.";
      } else if (error.message.includes("rate limit")) {
        title = "Too Many Requests";
        description = "Please wait a moment before sending another message.";
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        title = "Connection Error";
        description = "Unable to reach the server. Please check your internet connection.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/agents/${params.id}/messages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "messages"] });
      toast({
        title: "Chat cleared",
        description: "All messages have been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear chat",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  useEffect(() => {
    if (lastMessageTime === 0) return;
    
    const updateCooldown = () => {
      const elapsed = Date.now() - lastMessageTime;
      const remaining = Math.max(0, RATE_LIMIT_COOLDOWN - elapsed);
      setCooldownRemaining(remaining);
      
      if (remaining > 0) {
        requestAnimationFrame(updateCooldown);
      }
    };
    
    updateCooldown();
  }, [lastMessageTime]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      setIsCancelled(true);
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const isRateLimited = cooldownRemaining > 0;
  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending || isRateLimited || isOverLimit) return;
    sendMutation.mutate(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-background p-4">
          <div className="container mx-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-semibold mb-2">Agent not found</h2>
        <p className="text-muted-foreground mb-4">The agent you're looking for doesn't exist.</p>
        <Button onClick={() => navigate("/")} data-testid="button-go-home">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/")}
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Back to home</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-semibold" data-testid="text-agent-name">{agent.name}</h1>
                  <p className="text-xs text-muted-foreground capitalize">{agent.status}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => clearMutation.mutate()}
                    disabled={messages.length === 0 || clearMutation.isPending}
                    data-testid="button-clear-chat"
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear chat history</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate(`/settings/${params.id}`)}
                    data-testid="button-settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Agent settings</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      <ContextSummary messages={messages} topic={currentTopic} />
      
      <ContextRotWarning 
        messages={messages} 
        onClearChat={() => clearMutation.mutate()} 
        isClearing={clearMutation.isPending}
      />
      
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="container mx-auto max-w-3xl px-4 py-6">
          {messagesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-16 flex-1 max-w-[60%] rounded-lg" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyChat agentName={agent.name} />
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {sendMutation.isPending && <TypingIndicator onCancel={handleCancel} />}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-4">
        <div className="container mx-auto max-w-3xl">
          {isOverLimit && (
            <div className="flex items-center gap-2 mb-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Message is too long. Please shorten it to {MAX_MESSAGE_LENGTH} characters.</span>
            </div>
          )}
          {isRateLimited && (
            <div className="flex items-center gap-2 mb-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Please wait {Math.ceil(cooldownRemaining / 1000)}s before sending another message...</span>
            </div>
          )}
          <Card className="p-2">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`min-h-[44px] max-h-[120px] resize-none border-0 focus-visible:ring-0 ${
                  isOverLimit ? "text-destructive" : ""
                }`}
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH + 100}
                data-testid="textarea-message"
              />
              <Button
                onClick={handleSend}
                disabled={!message.trim() || sendMutation.isPending || isRateLimited || isOverLimit}
                size="icon"
                className="shrink-0"
                data-testid="button-send"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Card>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
            <CharacterCounter current={message.length} max={MAX_MESSAGE_LENGTH} />
          </div>
        </div>
      </div>
    </div>
  );
}
